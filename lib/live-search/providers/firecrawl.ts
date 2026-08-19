import "server-only";

import { getLiveSearchServerEnvironment } from "@/lib/live-search/env";
import {
  LIVE_RETAILER_IDENTITIES,
  MAX_COVERAGE_NOTES,
  type BrowserSearchOutput,
  type LiveRetailer,
  type LiveProductObservation,
  type LiveSearchIntent,
  type RetailerIdentity,
} from "@/lib/live-search/types";
import { validateBrowserSearchOutput } from "@/lib/live-search/validation";
import {
  canonicalizePublicProductUrl,
  hasSameRegistrableDomain,
  parsePublicHttpsUrl,
  registrableDomain,
} from "@/lib/live-search/url-security";

const SEARCH_ENDPOINT = "https://api.firecrawl.dev/v2/search";
const SCRAPE_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const DEFAULT_PAGE_TIMEOUT_MS = 9_000;
/** Client abort trails the provider timeout so the provider's own error wins when it arrives. */
const PAGE_TIMEOUT_GRACE_MS = 2_000;
const FIRECRAWL_SEARCH_TIMEOUT_MS = 10_000;
const AU_LOCATION = {
  country: "AU",
  languages: ["en-AU"],
} as const;

type FetchImplementation = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface FirecrawlDiscoveryHit {
  readonly retailer?: RetailerIdentity;
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly extraction?: FirecrawlProductExtraction;
}

export interface FirecrawlProductExtraction {
  readonly url: string;
  readonly name: string;
  readonly retailerProductId?: string;
  readonly category?: string;
  readonly imageUrl?: string;
  readonly imageCandidates?: readonly string[];
  readonly priceMinor?: number;
  readonly currency?: string;
  readonly availability?: "in_stock" | "out_of_stock" | "unknown";
  readonly dimensions?: {
    readonly widthMm: number;
    readonly heightMm: number;
    readonly depthMm: number;
  };
  readonly dimensionsEvidence?: string;
  readonly markdown: string;
}

export interface FirecrawlRejection {
  readonly url: string;
  readonly missingFields: readonly string[];
  readonly reasons: readonly string[];
}

export interface FirecrawlPrimarySearchResult {
  readonly output: BrowserSearchOutput;
  readonly discoveryHits: readonly FirecrawlDiscoveryHit[];
  readonly attemptedPages: number;
  readonly rejectedPages: number;
  readonly imageCandidates?: Readonly<Record<string, readonly string[]>>;
  /** Every candidate URL that failed, with the exact field that failed it. */
  readonly rejections: readonly FirecrawlRejection[];
  readonly productsPerRetailer: Readonly<Record<string, number>>;
  readonly reachedCompletenessFloor: boolean;
  readonly stoppedReason:
    | "completeness-floor"
    | "budget-exhausted"
    | "candidates-exhausted"
    | "scrape-cap"
    | "rate-limited";
  readonly elapsedMs: number;
}

/**
 * Runs the bounded Firecrawl-first path and admits only observations that pass
 * the same strict validation gate as the Browser Use fallback.
 */
export async function searchProductsWithFirecrawl(
  intent: LiveSearchIntent,
  maxResults?: number,
  fetchImplementation: FetchImplementation = fetch,
  clock: () => number = Date.now,
): Promise<FirecrawlPrimarySearchResult> {
  const environment = getLiveSearchServerEnvironment();
  const limit = maxResults ?? environment.maxResults;
  const startedAt = clock();
  const deadline = startedAt + environment.discoveryBudgetMs;

  // Discovery gathers a wide candidate pool; extraction spends the expensive
  // per-page budget on it through a bounded concurrent pool and stops as soon
  // as the completeness floor is met. Previously the pool was capped at the display
  // limit, so a single surviving product was both the first and the last result.
  const discoveryHits = await discoverProductPagesWithFirecrawl(
    intent,
    environment.discoveryPoolSize,
    fetchImplementation,
  );

  const products: LiveProductObservation[] = [];
  const imageCandidates: Record<string, readonly string[]> = {};
  const notes: string[] = [];
  const rejections: FirecrawlRejection[] = [];
  let attemptedPages = 0;
  let stoppedReason: FirecrawlPrimarySearchResult["stoppedReason"] = "candidates-exhausted";

  // A fixed number of scrapes stay in flight and a new one starts the moment any
  // settles. Lock-step batches made every batch as slow as its slowest page, so
  // one 20s timeout stalled five finished pages and a single batch spent the
  // whole budget; production attempted 6 of 28 discovered URLs.
  // Only pages without an inline extraction cost a scrape request; cap those so
  // one search cannot exhaust the provider's per-minute allowance.
  const queue = [...discoveryHits];
  const inFlight = new Set<Promise<void>>();
  let stopped = false;
  let scrapesStarted = 0;
  let rateLimited = false;

  const settle = async (hit: FirecrawlDiscoveryHit): Promise<void> => {
    attemptedPages += 1;
    try {
      // Firecrawl search reliably discovers retailer URLs, but JSON extraction is
      // not guaranteed on each search result. Finish the bounded product-page
      // extraction here rather than discarding a valid discovery and falling
      // through to the slower interactive-browser provider.
      const extraction = hit.extraction ??
        await extractProductWithFirecrawl(
          hit.url,
          fetchImplementation,
          environment.extractionPageTimeoutMs,
        );
      const validation = validateBrowserSearchOutput({
        products: [toUntrustedObservation(extraction, hit, intent)],
        partial: false,
        notes: [],
      });
      const product = validation.value?.products[0];
      if (!validation.ok || product === undefined) {
        // validation.errors names the exact field that failed. Discarding it left
        // every rejection reading as a generic "incomplete", which made the drop
        // rate impossible to attribute to any one field in production.
        const missingFields = missingFieldNames(validation.errors);
        console.warn(JSON.stringify({
          level: "warn",
          message: "firecrawl_candidate_rejected",
          url: hit.url,
          missingFields,
          reasons: validation.errors,
        }));
        rejections.push({ url: hit.url, missingFields, reasons: validation.errors });
        notes.push(rejectionNote(shortHost(hit.url), validation.errors));
        return;
      }
      if (products.some((existing) => existing.productUrl === product.productUrl)) {
        return;
      }
      products.push(product);
      if (extraction.imageCandidates !== undefined) {
        imageCandidates[product.productUrl] = extraction.imageCandidates;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (error instanceof FirecrawlRequestError && error.status === 429) {
        // The provider has refused further requests this minute. Starting more
        // pages would only add rejections; stop admitting work and report it.
        rateLimited = true;
      }
      console.warn(JSON.stringify({
        level: "warn",
        message: "firecrawl_extraction_failed",
        url: hit.url,
        error: reason,
      }));
      rejections.push({ url: hit.url, missingFields: [], reasons: [reason] });
      notes.push(`Could not validate ${shortHost(hit.url)} from the retailer page.`);
    }
  };

  while (!stopped && (queue.length > 0 || inFlight.size > 0)) {
    if (meetsCompletenessFloor(products, intent, environment, limit)) {
      stoppedReason = "completeness-floor";
      stopped = true;
      break;
    }
    if (clock() >= deadline) {
      stoppedReason = "budget-exhausted";
      notes.push("Stopped searching at the time limit before every retailer was complete.");
      stopped = true;
      break;
    }
    if (rateLimited) {
      stoppedReason = "rate-limited";
      notes.push("The retailer page provider rate-limited this search before every page was checked.");
      stopped = true;
    }
    while (!stopped && queue.length > 0 && inFlight.size < environment.extractionConcurrency) {
      const next = queue[0];
      if (next === undefined) {
        break;
      }
      const costsScrape = next.extraction === undefined;
      if (costsScrape && scrapesStarted >= environment.maxScrapesPerSearch) {
        // Pages with inline extraction are still free to validate; stop only
        // admitting new scrapes.
        const freeIndex = queue.findIndex((hit) => hit.extraction !== undefined);
        if (freeIndex === -1) {
          stoppedReason = "scrape-cap";
          notes.push("Checked the maximum number of retailer pages allowed for one search.");
          stopped = true;
          break;
        }
        const [free] = queue.splice(freeIndex, 1);
        if (free === undefined) {
          break;
        }
        const freeTask: Promise<void> = settle(free).finally(() => {
          inFlight.delete(freeTask);
        });
        inFlight.add(freeTask);
        continue;
      }
      queue.shift();
      if (costsScrape) {
        scrapesStarted += 1;
      }
      const task: Promise<void> = settle(next).finally(() => {
        inFlight.delete(task);
      });
      inFlight.add(task);
    }
    if (stopped) {
      // Pages already admitted may finish, but never past the deadline.
      await Promise.race([
        Promise.allSettled([...inFlight]),
        sleep(Math.max(0, deadline - clock())),
      ]);
      break;
    }
    if (inFlight.size === 0) {
      break;
    }
    // Wake on the first settled page or the deadline, whichever comes first, so
    // a slow page never delays the decision to start the next one.
    await Promise.race([
      ...inFlight,
      sleep(Math.max(0, deadline - clock())),
    ]);
  }
  // Pages still in flight at the deadline are abandoned for this response; their
  // per-page timeout bounds the provider spend.
  if (!stopped && rateLimited) {
    stoppedReason = "rate-limited";
    notes.push("The retailer page provider rate-limited this search before every page was checked.");
  }

  if (meetsCompletenessFloor(products, intent, environment, limit)) {
    stoppedReason = "completeness-floor";
  }

  const productsPerRetailer = countPerRetailer(products);
  if (intent.kind === "prompt") {
    for (const retailer of intent.retailers) {
      const found = productsPerRetailer[retailer] ?? 0;
      if (found === 0) {
        notes.push(`No validated Firecrawl result returned for ${retailer}.`);
      } else if (found < environment.minPerRetailer) {
        notes.push(`Only ${found} of ${environment.minPerRetailer} wanted products passed for ${retailer}.`);
      }
    }
  }
  if (discoveryHits.length === 0) {
    notes.push("Firecrawl found no candidate product pages.");
  }

  const elapsedMs = clock() - startedAt;
  const reachedCompletenessFloor = meetsCompletenessFloor(products, intent, environment, limit);
  const boundedNotes = [...new Set(notes)].slice(0, MAX_COVERAGE_NOTES);
  const displayed = products.slice(0, limit);
  const combined = validateBrowserSearchOutput({
    products: displayed,
    partial: boundedNotes.length > 0 || !reachedCompletenessFloor,
    notes: boundedNotes,
  });

  console.info(JSON.stringify({
    level: "info",
    message: "firecrawl_discovery_summary",
    intentKind: intent.kind,
    discovered: discoveryHits.length,
    attemptedPages,
    validated: products.length,
    productsPerRetailer,
    rejected: rejections.length,
    scrapesStarted,
    rateLimited,
    reachedCompletenessFloor,
    stoppedReason,
    elapsedMs,
  }));

  if (!combined.ok || combined.value === undefined) {
    return {
      output: {
        products: [],
        partial: true,
        notes: ["Firecrawl results did not pass the combined validation gate."],
      },
      discoveryHits,
      attemptedPages,
      rejectedPages: attemptedPages,
      imageCandidates,
      rejections,
      productsPerRetailer,
      reachedCompletenessFloor: false,
      stoppedReason,
      elapsedMs,
    };
  }
  return {
    output: combined.value,
    discoveryHits,
    attemptedPages,
    rejectedPages: attemptedPages - combined.value.products.length,
    imageCandidates,
    rejections,
    productsPerRetailer,
    reachedCompletenessFloor,
    stoppedReason,
    elapsedMs,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countPerRetailer(
  products: readonly LiveProductObservation[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const product of products) {
    counts[product.retailer.key] = (counts[product.retailer.key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Discovery may stop early only once the result set is genuinely complete:
 * the floor is met and every requested retailer is represented. Stopping at
 * the first validated product is what reduced production runs to one candidate.
 */
function meetsCompletenessFloor(
  products: readonly LiveProductObservation[],
  intent: LiveSearchIntent,
  environment: {
    readonly completenessFloor: number;
    readonly minPerRetailer: number;
  },
  limit: number,
): boolean {
  if (intent.kind === "product-link") {
    return products.length >= 1;
  }
  if (products.length >= limit) {
    return true;
  }
  if (products.length < environment.completenessFloor) {
    return false;
  }
  const counts = countPerRetailer(products);
  return intent.retailers.every(
    (retailer) => (counts[retailer] ?? 0) >= environment.minPerRetailer,
  );
}

/** Discovers bounded product-page candidates without opening an interactive browser. */
export async function discoverProductPagesWithFirecrawl(
  intent: LiveSearchIntent,
  maxResults = getLiveSearchServerEnvironment().maxResults,
  fetchImplementation: FetchImplementation = fetch,
): Promise<readonly FirecrawlDiscoveryHit[]> {
  if (intent.kind === "product-link") {
    return [{
      url: canonicalizePublicProductUrl(intent.url),
      title: "Submitted product",
      description: "Exact product link supplied by the user.",
    }];
  }

  const perRetailer = Math.max(1, Math.ceil(maxResults / intent.retailers.length));
  const results = await Promise.allSettled(
    intent.retailers.map((retailer) => searchRetailer(
      retailer,
      intent.text,
      perRetailer,
      fetchImplementation,
    )),
  );
  // Interleave retailers rather than concatenating them. Truncating a
  // concatenated list by insertion order handed every slot to whichever
  // retailer's HTTP call happened to resolve first.
  const perRetailerHits = results.map((result) => (
    result.status === "fulfilled" ? [...result.value] : []
  ));
  const seen = new Set<string>();
  const interleaved: FirecrawlDiscoveryHit[] = [];
  const longest = Math.max(0, ...perRetailerHits.map((hits) => hits.length));
  for (let index = 0; index < longest; index += 1) {
    for (const hits of perRetailerHits) {
      const hit = hits[index];
      if (hit === undefined || seen.has(hit.url)) {
        continue;
      }
      seen.add(hit.url);
      interleaved.push(hit);
    }
  }
  return interleaved.slice(0, maxResults);
}

/** Extracts compact product facts from one already-validated public product URL. */
export async function extractProductWithFirecrawl(
  targetUrl: string,
  fetchImplementation: FetchImplementation = fetch,
  pageTimeoutMs: number = DEFAULT_PAGE_TIMEOUT_MS,
): Promise<FirecrawlProductExtraction> {
  const canonicalTarget = canonicalizePublicProductUrl(targetUrl);
  const environment = getLiveSearchServerEnvironment();
  const response = await fetchImplementation(SCRAPE_ENDPOINT, {
    method: "POST",
    headers: firecrawlHeaders(environment.firecrawlApiKey),
    body: JSON.stringify({
      url: canonicalTarget,
      formats: [
        "markdown",
        "images",
        {
          type: "json",
          prompt: productExtractionPrompt(),
          schema: productExtractionSchema(),
        },
      ],
      onlyMainContent: true,
      onlyCleanContent: true,
      location: AU_LOCATION,
      removeBase64Images: true,
      blockAds: true,
      proxy: "auto",
      // Ask Firecrawl to give up on a slow page before we do. Two production runs
      // showed 9 of 12 scrapes hitting the old 20s ceiling; one slow page then
      // held its whole batch and a single batch consumed the entire budget.
      timeout: pageTimeoutMs,
    }),
    signal: AbortSignal.timeout(pageTimeoutMs + PAGE_TIMEOUT_GRACE_MS),
  });
  const payload = await readFirecrawlResponse(response, "scrape");
  if (!isRecord(payload.data)) {
    throw new FirecrawlResponseError("Firecrawl scrape response omitted data.");
  }
  return productExtractionFromData(payload.data, canonicalTarget);
}

async function searchRetailer(
  retailer: LiveRetailer,
  query: string,
  limit: number,
  fetchImplementation: FetchImplementation,
): Promise<readonly FirecrawlDiscoveryHit[]> {
  const environment = getLiveSearchServerEnvironment();
  const identity = LIVE_RETAILER_IDENTITIES[retailer];
  const response = await fetchImplementation(SEARCH_ENDPOINT, {
    method: "POST",
    headers: firecrawlHeaders(environment.firecrawlApiKey),
    body: JSON.stringify({
      query: retailerSearchQuery(retailer, query),
      limit,
      includeDomains: [identity.host],
      sources: ["web"],
      country: "AU",
      location: "Sydney,New South Wales,Australia",
      timeout: 8_000,
      ignoreInvalidURLs: true,
    }),
    signal: AbortSignal.timeout(FIRECRAWL_SEARCH_TIMEOUT_MS),
  });
  const payload = await readFirecrawlResponse(response, "search");
  const data = isRecord(payload.data) && Array.isArray(payload.data.web)
    ? payload.data.web
    : [];
  return data.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    const rawUrl = optionalString(entry.url);
    const title = optionalString(entry.title);
    if (rawUrl === undefined || title === undefined) {
      return [];
    }
    try {
      const url = canonicalizePublicProductUrl(rawUrl);
      if (!hasSameRegistrableDomain(`https://${identity.host}`, url)) {
        return [];
      }
      if (!isKnownRetailerProductPage(retailer, url)) {
        return [];
      }
      let extraction: FirecrawlProductExtraction | undefined;
      try {
        extraction = productExtractionFromData(entry, url);
      } catch {
        extraction = undefined;
      }
      return [{
        retailer: identity,
        url,
        title,
        description: optionalString(entry.description) ?? "",
        ...optionalProperty("extraction", extraction),
      }];
    } catch {
      return [];
    }
  });
}

function retailerSearchQuery(retailer: LiveRetailer, query: string): string {
  // The user's own words carry the intent; appending a fixed noun only dilutes
  // them, so "black bookshelf" is no longer searched as "black bookshelf furniture".
  //
  // The path scope stays. includeDomains cannot express a path prefix, and
  // ikea.com serves every market from one registrable domain, so without it an
  // Australian search returns US and EU product pages that
  // isKnownRetailerProductPage then discards - spending the result budget on rows
  // that can never survive.
  const productPath = retailer === "ikea-au"
    ? "site:ikea.com/au/en/p/"
    : "site:kmart.com.au/product/";
  return `${query} ${productPath}`;
}

function isKnownRetailerProductPage(retailer: LiveRetailer, value: string): boolean {
  const pathname = parsePublicHttpsUrl(value).pathname.toLowerCase();
  return retailer === "ikea-au"
    ? pathname.includes("/au/en/p/")
    : pathname.startsWith("/product/");
}

function productExtractionSchema(): Readonly<Record<string, unknown>> {
  return {
    type: "object",
    properties: {
      canonicalUrl: { type: "string", format: "uri" },
      name: { type: "string", minLength: 1, maxLength: 240 },
      retailerProductId: { type: "string", minLength: 1, maxLength: 120 },
      category: { type: "string", minLength: 1, maxLength: 100 },
      imageUrl: { type: "string", format: "uri" },
      priceText: { type: "string", minLength: 1, maxLength: 40 },
      currency: { type: "string", pattern: "^[A-Z]{3}$" },
      availability: {
        type: "string",
        enum: ["in_stock", "out_of_stock", "unknown"],
      },
      assembledDimensions: {
        type: "object",
        properties: {
          widthMm: { type: "integer", minimum: 1, maximum: 10_000 },
          heightMm: { type: "integer", minimum: 1, maximum: 10_000 },
          depthMm: { type: "integer", minimum: 1, maximum: 10_000 },
        },
        required: ["widthMm", "heightMm", "depthMm"],
        additionalProperties: false,
      },
      dimensionsEvidence: { type: "string", minLength: 1, maxLength: 2_000 },
    },
    required: ["canonicalUrl", "name"],
    additionalProperties: false,
  };
}

function productExtractionPrompt(): string {
  return [
    "Extract only facts explicitly stated for this exact furniture product and variant.",
    "Copy the canonical URL, product name, retailer product ID, category, primary image,",
    "the listed price exactly as displayed including its symbol (priceText, e.g. \"$129.00\"),",
    "ISO-4217 currency, availability, and assembled dimensions.",
    "Never convert the price to cents or any other unit; copy the characters shown on the page.",
    "Only return widthMm, heightMm, and depthMm when all three axes are explicit.",
    "Never infer dimension order, estimate a value, or substitute package dimensions.",
    "Preserve a short verbatim dimensionsEvidence string. Omit any unavailable field.",
  ].join(" ");
}

/**
 * The scraped target already passed the product-page check at discovery. A
 * model-supplied canonical URL may only replace it when it is itself a known
 * product page on the same retailer; otherwise a category or shop landing page
 * (kmart.com.au/shop/officeworks in production) becomes the product link.
 */
function resolveProductUrl(
  canonicalTarget: string,
  candidates: readonly (string | undefined)[],
): string {
  const retailer = retailerForUrl(canonicalTarget);
  for (const candidate of candidates) {
    if (candidate === undefined) {
      continue;
    }
    let canonical: string;
    try {
      canonical = canonicalizePublicProductUrl(candidate);
    } catch {
      continue;
    }
    // Any claim that the page lives on another registrable domain is treated as
    // a redirect off the retailer and rejects the whole extraction; the content
    // cannot be trusted as retailer-sourced. This is the existing security
    // boundary and is intentionally stricter than ignoring the claim.
    if (!hasSameRegistrableDomain(canonicalTarget, canonical)) {
      throw new FirecrawlResponseError("Firecrawl scrape left the submitted retailer domain.");
    }
    if (retailer === undefined || isKnownRetailerProductPage(retailer, canonical)) {
      return canonical;
    }
  }
  return canonicalTarget;
}

function retailerForUrl(value: string): LiveRetailer | undefined {
  const host = parsePublicHttpsUrl(value).hostname.toLowerCase();
  const match = (Object.entries(LIVE_RETAILER_IDENTITIES) as [LiveRetailer, RetailerIdentity][])
    .find(([, identity]) => host === identity.host || host.endsWith(`.${identity.host}`));
  return match?.[0];
}

function productExtractionFromData(
  data: Record<string, unknown>,
  canonicalTarget: string,
): FirecrawlProductExtraction {
  const extracted = isRecord(data.json) ? data.json : {};
  const markdown = optionalString(data.markdown) ?? "";
  const returnedUrl = resolveProductUrl(canonicalTarget, [
    optionalString(extracted.canonicalUrl),
    metadataUrl(data),
  ]);
  const name = optionalString(extracted.name) ?? metadataTitle(data);
  if (name === undefined) {
    throw new FirecrawlResponseError("Firecrawl scrape omitted the product name.");
  }
  const imageCandidates = [...new Set([
    optionalString(extracted.imageUrl),
    ...stringArray(data.images),
  ].flatMap((value) => {
    const url = safeOptionalPublicUrl(value);
    return url === undefined || isObviouslyNonProductImage(url) ? [] : [url];
  }))].slice(0, 6);
  const imageUrl = imageCandidates[0];
  const price = readPrice(extracted.priceText, extracted.currency, markdown);
  const extractedDimensions = dimensions(extracted.assembledDimensions);
  const markdownDimensions = readExplicitDimensions(markdown);
  const explicitDimensions = extractedDimensions ?? markdownDimensions?.dimensions;
  const dimensionsEvidence = (explicitDimensions !== undefined && markdownDimensions !== undefined &&
      sameDimensions(explicitDimensions, markdownDimensions.dimensions)
      ? markdownDimensions.evidence
      : undefined) ?? optionalString(extracted.dimensionsEvidence);
  return {
    url: canonicalizePublicProductUrl(returnedUrl),
    name,
    ...optionalProperty("retailerProductId", optionalString(extracted.retailerProductId)),
    ...optionalProperty("category", optionalString(extracted.category)),
    ...optionalProperty("imageUrl", imageUrl),
    ...optionalProperty(
      "imageCandidates",
      imageCandidates.length === 0 ? undefined : imageCandidates,
    ),
      ...optionalProperty("priceMinor", price?.minorUnits),
    ...optionalProperty("currency", price?.currency),
    ...optionalProperty("availability", availability(extracted.availability)),
    ...optionalProperty("dimensions", explicitDimensions),
    ...optionalProperty("dimensionsEvidence", dimensionsEvidence),
    markdown,
  };
}

function sameDimensions(
  left: { readonly widthMm: number; readonly heightMm: number; readonly depthMm: number },
  right: { readonly widthMm: number; readonly heightMm: number; readonly depthMm: number },
): boolean {
  return left.widthMm === right.widthMm &&
    left.heightMm === right.heightMm &&
    left.depthMm === right.depthMm;
}

function readExplicitDimensions(markdown: string): {
  readonly dimensions: {
    readonly widthMm: number;
    readonly heightMm: number;
    readonly depthMm: number;
  };
  readonly evidence: string;
} | undefined {
  const valueThenLegend = markdown.match(
    /(\d+(?:\.\d+)?)\s*(mm|cm|m)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\s*\(\s*w\s*[x×]\s*d\s*[x×]\s*h\s*\)/i,
  );
  if (valueThenLegend !== null) {
    const dimensions = dimensionsFromEntries([
      ["width", valueThenLegend[1], valueThenLegend[2]],
      ["depth", valueThenLegend[3], valueThenLegend[4]],
      ["height", valueThenLegend[5], valueThenLegend[6]],
    ]);
    if (dimensions !== undefined) {
      return { dimensions, evidence: valueThenLegend[0] };
    }
  }

  const sharedUnit = markdown.match(
    /(\d+(?:\.\d+)?)\s*w\s*[x×]\s*(\d+(?:\.\d+)?)\s*d\s*[x×]\s*(\d+(?:\.\d+)?)\s*h\s*(mm|cm|m)\b/i,
  );
  if (sharedUnit !== null) {
    const dimensions = dimensionsFromEntries([
      ["width", sharedUnit[1], sharedUnit[4]],
      ["depth", sharedUnit[2], sharedUnit[4]],
      ["height", sharedUnit[3], sharedUnit[4]],
    ]);
    if (dimensions !== undefined) {
      return { dimensions, evidence: sharedUnit[0] };
    }
  }

  const axes = new Map<"width" | "height" | "depth", {
    readonly millimetres: number;
    readonly evidence: string;
  }>();
  const conflicts = new Set<string>();
  const pattern = /\b(width|height|depth)\b\s*(?::|is|-)?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/gi;
  for (const match of markdown.matchAll(pattern)) {
    const axis = match[1]?.toLowerCase() as "width" | "height" | "depth" | undefined;
    const rawValue = match[2];
    const unit = match[3]?.toLowerCase();
    if (axis === undefined || rawValue === undefined || unit === undefined) {
      continue;
    }
    const factor = unit === "mm" ? 1 : unit === "cm" ? 10 : 1_000;
    const millimetres = Number(rawValue) * factor;
    if (!Number.isInteger(millimetres) || millimetres < 1 || millimetres > 10_000) {
      continue;
    }
    const previous = axes.get(axis);
    if (previous !== undefined && previous.millimetres !== millimetres) {
      conflicts.add(axis);
      continue;
    }
    axes.set(axis, { millimetres, evidence: match[0] });
  }
  if (conflicts.size > 0) {
    return undefined;
  }
  const width = axes.get("width");
  const height = axes.get("height");
  const depth = axes.get("depth");
  if (width === undefined || height === undefined || depth === undefined) {
    return undefined;
  }
  return {
    dimensions: {
      widthMm: width.millimetres,
      heightMm: height.millimetres,
      depthMm: depth.millimetres,
    },
    evidence: [width.evidence, height.evidence, depth.evidence].join("; "),
  };
}

function dimensionsFromEntries(
  entries: readonly (readonly ["width" | "height" | "depth", string | undefined, string | undefined])[],
): FirecrawlProductExtraction["dimensions"] | undefined {
  const values = new Map<"width" | "height" | "depth", number>();
  for (const [axis, rawValue, unit] of entries) {
    if (rawValue === undefined || unit === undefined) {
      return undefined;
    }
    const factor = unit.toLowerCase() === "mm" ? 1 : unit.toLowerCase() === "cm" ? 10 : 1_000;
    const millimetres = Number(rawValue) * factor;
    if (!Number.isInteger(millimetres) || millimetres < 1 || millimetres > 10_000) {
      return undefined;
    }
    values.set(axis, millimetres);
  }
  const widthMm = values.get("width");
  const heightMm = values.get("height");
  const depthMm = values.get("depth");
  return widthMm === undefined || heightMm === undefined || depthMm === undefined
    ? undefined
    : { widthMm, heightMm, depthMm };
}

interface ExtractedPrice {
  readonly minorUnits: number;
  readonly currency: string;
}

const DISPLAYED_PRICE_PATTERN =
  /(?:A\$|AU\$|AUD\s*|\$)\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/;
const AMOUNT_PATTERN = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/;
const AUSTRALIAN_PRICE_MARKER = /A\$|AU\$|\bAUD\b/i;

/**
 * Derives a price in minor units from the price as displayed on the retailer page.
 *
 * The provider is deliberately never asked to perform this conversion. A model
 * reading "$129.00" reliably answers 129 for a field documented as integer minor
 * units, which understates the price by a factor of one hundred and is
 * indistinguishable from a genuine $1.29 product once the page is out of scope.
 * Parsing the displayed characters keeps the conversion deterministic and testable.
 */
function readPrice(
  priceText: unknown,
  currencyInput: unknown,
  markdown: string,
): ExtractedPrice | undefined {
  const displayed = optionalString(priceText) ?? readDisplayedPrice(markdown);
  if (displayed === undefined) {
    return undefined;
  }
  const currency = currencyCode(currencyInput) ??
    (AUSTRALIAN_PRICE_MARKER.test(displayed) ? "AUD" : undefined);
  if (currency === undefined) {
    return undefined;
  }
  const minorUnits = toMinorUnits(displayed, currency);
  return minorUnits === undefined ? undefined : { minorUnits, currency };
}

function readDisplayedPrice(markdown: string): string | undefined {
  return markdown.match(DISPLAYED_PRICE_PATTERN)?.[0];
}

function toMinorUnits(displayed: string, currency: string): number | undefined {
  const match = displayed.match(AMOUNT_PATTERN);
  const whole = match?.[1];
  if (match === null || whole === undefined) {
    return undefined;
  }
  const exponent = minorUnitExponent(currency);
  const fraction = (match[2] ?? "").padEnd(exponent, "0").slice(0, exponent);
  const minorUnits = Number(whole.replace(/,/g, "")) * 10 ** exponent +
    (fraction.length === 0 ? 0 : Number(fraction));
  return Number.isSafeInteger(minorUnits) && minorUnits > 0 ? minorUnits : undefined;
}

function minorUnitExponent(currency: string): number {
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency })
      .resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

function isObviouslyNonProductImage(value: string): boolean {
  const url = parsePublicHttpsUrl(value);
  return (
    /\.(?:svg|gif)(?:$|\?)/i.test(url.pathname) ||
    /(?:^|[\/_-])(?:logo|icon|sprite|avatar)(?:[\/_-]|$)/i.test(url.pathname) ||
    // A product-page path is not an image. Scrapes sometimes emit the page URL
    // with a trailing segment (".../p/<slug>/false"); it passes the retailer
    // host check but is not a real asset, and being first in the image list it
    // would otherwise shadow the genuine CDN image. Real product images live on
    // the retailers' image CDNs, never under /p/ or /product/.
    /\/(?:p|product)\//i.test(url.pathname)
  );
}

function toUntrustedObservation(
  extraction: FirecrawlProductExtraction,
  hit: FirecrawlDiscoveryHit,
  intent: LiveSearchIntent,
): Readonly<Record<string, unknown>> {
  const retailer = hit.retailer ?? retailerIdentityForExactLink(extraction.url, intent);
  return {
    retailer,
    retailerProductId: extraction.retailerProductId,
    name: extraction.name,
    category: extraction.category,
    productUrl: extraction.url,
    imageUrl: extraction.imageUrl,
    priceMinor: extraction.priceMinor,
    currency: extraction.currency,
    availability: extraction.availability ?? "unknown",
    assembledDimensions: extraction.dimensions,
    packages: [],
    dimensionsSource: "retailer-page",
    dimensionsEvidence: extraction.dimensionsEvidence,
    observedAt: new Date().toISOString(),
    confidence: "high",
  };
}

function retailerIdentityForExactLink(
  productUrl: string,
  intent: LiveSearchIntent,
): RetailerIdentity {
  if (intent.kind !== "product-link") {
    throw new FirecrawlResponseError("A discovered prompt result was missing its retailer identity.");
  }
  if (!hasSameRegistrableDomain(intent.url, productUrl)) {
    throw new FirecrawlResponseError("Firecrawl exact-link extraction left the submitted domain.");
  }
  const host = registrableDomain(parsePublicHttpsUrl(productUrl).hostname);
  return {
    key: host.replace(/\./g, "-"),
    label: host,
    host,
  };
}

/** Extracts the bare field names from validation paths like `products[0].category`. */
function missingFieldNames(errors: readonly string[]): readonly string[] {
  return [...new Set(errors.flatMap((error) => {
    const match = error.match(/^products\[\d+\]\.([A-Za-z]+)/);
    return match?.[1] === undefined ? [] : [match[1]];
  }))];
}

function rejectionNote(host: string, errors: readonly string[]): string {
  const fields = missingFieldNames(errors);
  return fields.length === 0
    ? `Rejected ${host} because required source facts were incomplete.`
    : `Rejected ${host}: missing ${fields.join(", ")}.`;
}

function shortHost(value: string): string {
  try {
    return parsePublicHttpsUrl(value).hostname;
  } catch {
    return "a candidate page";
  }
}

async function readFirecrawlResponse(
  response: Response,
  operation: "search" | "scrape",
): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (!response.ok) {
    throw new FirecrawlRequestError(response.status, body);
  }
  const payload = parseJson(body);
  if (!isRecord(payload) || payload.success !== true) {
    throw new FirecrawlResponseError(`Firecrawl ${operation} returned an invalid response.`);
  }
  return payload;
}

function firecrawlHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function metadataUrl(data: Record<string, unknown>): string | undefined {
  return isRecord(data.metadata)
    ? optionalString(data.metadata.sourceURL) ?? optionalString(data.metadata.url)
    : undefined;
}

function metadataTitle(data: Record<string, unknown>): string | undefined {
  return isRecord(data.metadata) ? optionalString(data.metadata.title) : undefined;
}

function safeOptionalPublicUrl(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return parsePublicHttpsUrl(value).toString();
  } catch {
    return undefined;
  }
}

function dimensions(value: unknown): FirecrawlProductExtraction["dimensions"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const widthMm = positiveInteger(value.widthMm);
  const heightMm = positiveInteger(value.heightMm);
  const depthMm = positiveInteger(value.depthMm);
  return widthMm === undefined || heightMm === undefined || depthMm === undefined
    ? undefined
    : { widthMm, heightMm, depthMm };
}

function availability(
  value: unknown,
): FirecrawlProductExtraction["availability"] | undefined {
  return value === "in_stock" || value === "out_of_stock" || value === "unknown"
    ? value
    : undefined;
}

function currencyCode(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function optionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): { readonly [Property in Key]?: Value } {
  return value === undefined ? {} : { [key]: value } as { readonly [Property in Key]?: Value };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class FirecrawlRequestError extends Error {
  public constructor(
    public readonly status: number,
    detail: string,
  ) {
    super(`Firecrawl returned HTTP ${status}: ${detail.slice(0, 300)}`);
    this.name = "FirecrawlRequestError";
  }

  public get retryable(): boolean {
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export class FirecrawlResponseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FirecrawlResponseError";
  }
}
