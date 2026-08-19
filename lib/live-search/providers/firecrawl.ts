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
const FIRECRAWL_TIMEOUT_MS = 35_000;
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
}

export interface FirecrawlProductExtraction {
  readonly url: string;
  readonly name: string;
  readonly retailerProductId?: string;
  readonly category?: string;
  readonly imageUrl?: string;
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

export interface FirecrawlPrimarySearchResult {
  readonly output: BrowserSearchOutput;
  readonly discoveryHits: readonly FirecrawlDiscoveryHit[];
  readonly attemptedPages: number;
  readonly rejectedPages: number;
}

/**
 * Runs the bounded Firecrawl-first path and admits only observations that pass
 * the same strict validation gate as the Browser Use fallback.
 */
export async function searchProductsWithFirecrawl(
  intent: LiveSearchIntent,
  maxResults = getLiveSearchServerEnvironment().maxResults,
  fetchImplementation: FetchImplementation = fetch,
): Promise<FirecrawlPrimarySearchResult> {
  const discoveryHits = await discoverProductPagesWithFirecrawl(
    intent,
    maxResults,
    fetchImplementation,
  );
  const settled = await Promise.allSettled(
    discoveryHits.map((hit) => extractProductWithFirecrawl(hit.url, fetchImplementation)),
  );
  const products: LiveProductObservation[] = [];
  const notes: string[] = [];

  for (const [index, result] of settled.entries()) {
    const hit = discoveryHits[index];
    if (hit === undefined) {
      continue;
    }
    if (result.status === "rejected") {
      notes.push(`Could not validate ${shortHost(hit.url)} from the retailer page.`);
      continue;
    }
    const validation = validateBrowserSearchOutput({
      products: [toUntrustedObservation(result.value, hit, intent)],
      partial: false,
      notes: [],
    });
    const product = validation.value?.products[0];
    if (!validation.ok || product === undefined) {
      notes.push(`Rejected ${shortHost(hit.url)} because required source facts were incomplete.`);
      continue;
    }
    products.push(product);
  }

  if (intent.kind === "prompt") {
    for (const retailer of intent.retailers) {
      if (!products.some((product) => product.retailer.key === retailer)) {
        notes.push(`No validated Firecrawl result returned for ${retailer}.`);
      }
    }
  }
  if (discoveryHits.length === 0) {
    notes.push("Firecrawl found no candidate product pages.");
  }

  const boundedNotes = [...new Set(notes)].slice(0, MAX_COVERAGE_NOTES);
  const combined = validateBrowserSearchOutput({
    products,
    partial: boundedNotes.length > 0,
    notes: boundedNotes,
  });
  if (!combined.ok || combined.value === undefined) {
    return {
      output: {
        products: [],
        partial: true,
        notes: ["Firecrawl results did not pass the combined validation gate."],
      },
      discoveryHits,
      attemptedPages: discoveryHits.length,
      rejectedPages: discoveryHits.length,
    };
  }
  return {
    output: combined.value,
    discoveryHits,
    attemptedPages: discoveryHits.length,
    rejectedPages: discoveryHits.length - combined.value.products.length,
  };
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
  const results = await Promise.all(
    intent.retailers.map((retailer) => searchRetailer(
      retailer,
      intent.text,
      perRetailer,
      fetchImplementation,
    )),
  );
  const deduplicated = new Map<string, FirecrawlDiscoveryHit>();
  for (const result of results.flat()) {
    deduplicated.set(result.url, result);
  }
  return [...deduplicated.values()].slice(0, maxResults);
}

/** Extracts compact product facts from one already-validated public product URL. */
export async function extractProductWithFirecrawl(
  targetUrl: string,
  fetchImplementation: FetchImplementation = fetch,
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
          prompt: [
            "Extract only facts explicitly stated for this exact furniture product and variant.",
            "Copy the canonical URL, product name, retailer product ID, category, primary image,",
            "listed price in integer minor units, ISO-4217 currency, availability, and assembled dimensions.",
            "Only return widthMm, heightMm, and depthMm when all three axes are explicit.",
            "Never infer dimension order, estimate a value, or substitute package dimensions.",
            "Preserve a short verbatim dimensionsEvidence string. Omit any unavailable field.",
          ].join(" "),
          schema: productExtractionSchema(),
        },
      ],
      onlyMainContent: true,
      onlyCleanContent: true,
      location: AU_LOCATION,
      removeBase64Images: true,
      blockAds: true,
      proxy: "auto",
      timeout: 30_000,
    }),
    signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
  });
  const payload = await readFirecrawlResponse(response, "scrape");
  if (!isRecord(payload.data)) {
    throw new FirecrawlResponseError("Firecrawl scrape response omitted data.");
  }
  const data = payload.data;
  const extracted = isRecord(data.json) ? data.json : {};
  const returnedUrl = optionalString(extracted.canonicalUrl) ?? metadataUrl(data) ?? canonicalTarget;
  if (!hasSameRegistrableDomain(canonicalTarget, returnedUrl)) {
    throw new FirecrawlResponseError("Firecrawl scrape left the submitted retailer domain.");
  }
  const name = optionalString(extracted.name);
  if (name === undefined) {
    throw new FirecrawlResponseError("Firecrawl scrape omitted the product name.");
  }
  const imageUrl = safeOptionalPublicUrl(
    optionalString(extracted.imageUrl) ?? stringArray(data.images)[0],
  );
  return {
    url: canonicalizePublicProductUrl(returnedUrl),
    name,
    ...optionalProperty("retailerProductId", optionalString(extracted.retailerProductId)),
    ...optionalProperty("category", optionalString(extracted.category)),
    ...optionalProperty("imageUrl", imageUrl),
    ...optionalProperty("priceMinor", positiveInteger(extracted.priceMinor)),
    ...optionalProperty("currency", currencyCode(extracted.currency)),
    ...optionalProperty("availability", availability(extracted.availability)),
    ...optionalProperty("dimensions", dimensions(extracted.assembledDimensions)),
    ...optionalProperty("dimensionsEvidence", optionalString(extracted.dimensionsEvidence)),
    markdown: optionalString(data.markdown) ?? "",
  };
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
      query: `${query} furniture`,
      limit,
      includeDomains: [identity.host],
      country: "AU",
      location: "Sydney,New South Wales,Australia",
      timeout: 30_000,
      ignoreInvalidURLs: true,
    }),
    signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
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
      return [{
        retailer: identity,
        url,
        title,
        description: optionalString(entry.description) ?? "",
      }];
    } catch {
      return [];
    }
  });
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
      priceMinor: { type: "integer", minimum: 1 },
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
