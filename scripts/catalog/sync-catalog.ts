import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CatalogProduct, Retailer } from "../../lib/catalog-types";
import { requireValidCatalog } from "../../lib/catalog-validation";
import { ClaudeProductExtractor } from "./ingestion/claude-extractor";
import {
  BrowserUseClient,
  FirecrawlClient,
  ProductPageFetcher,
  ProviderCreditExhaustedError,
  type FetchedPage,
  type IngestionMetrics,
} from "./ingestion/fetchers";
import {
  discoverIkeaProducts,
  IKEA_CATEGORY_URLS,
} from "./ingestion/ikea";
import { extractJsonLdProductLinks } from "./ingestion/json-ld";
import {
  buildCandidateFromPage,
  toCatalogProduct,
  type ProductPageSeed,
} from "./ingestion/pipeline";
import { IngestionStateStore } from "./ingestion/state";
import {
  parseTargetDiscoveryTargets,
  parseTargetListingResponse,
  targetDiscoveryUrls,
} from "./ingestion/target";
import type {
  ProductCandidate,
  RetailerId,
} from "./ingestion/types";
import {
  discoverWayfairProducts,
  WAYFAIR_CATEGORY_URL,
} from "./ingestion/wayfair";

const OUTPUT_PATH = resolve(process.cwd(), "public/catalog.json");
const TEMP_OUTPUT_PATH = `${OUTPUT_PATH}.tmp`;
const STATE_PATH = resolve(
  process.cwd(),
  ".cache/catalog-ingestion/state.json",
);
const REPORT_PATH = resolve(
  process.cwd(),
  ".cache/catalog-ingestion/last-report.json",
);
const MAX_PHASE_NEW_PRODUCTS = 150;
const DEFAULT_BATCH_SIZE = 25;
const TARGET_REQUEST_INTERVAL_MS = 500;
const WAYFAIR_CATEGORY_URLS = [
  WAYFAIR_CATEGORY_URL,
  `${WAYFAIR_CATEGORY_URL}?curpage=2`,
  `${WAYFAIR_CATEGORY_URL}?curpage=3`,
] as const;
const IKEA_DISCOVERY_URLS = IKEA_CATEGORY_URLS.flatMap((url) => [
  url,
  `${url}?page=2`,
]);

interface DiscoveryResult {
  readonly directCandidates: readonly ProductCandidate[];
  readonly pageSeeds: readonly ProductPageSeed[];
}

interface RunReport {
  readonly status: "complete" | "credit-exhausted";
  readonly stoppedProvider?: string;
  readonly catalogCount: number;
  readonly addedThisRun: number;
  readonly addedSincePhaseStart: number;
  readonly perRetailer: Readonly<Record<Retailer, number>>;
  readonly provenanceByRetailer: Readonly<
    Record<Retailer, Readonly<Record<string, number>>>
  >;
  readonly metrics: IngestionMetrics;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const metrics: IngestionMetrics = {
    firecrawlPagesFetched: 0,
    browserUseSessions: 0,
    claudeCalls: 0,
    retailerApiRequests: 0,
  };
  const state = new IngestionStateStore(STATE_PATH);
  await state.load();
  let products = [...(await readExistingCatalog())];
  await state.initializeBaseline(products.map((product) => product.id));

  const alreadyAdded = state.countProductsAddedSinceBaseline(
    products.map((product) => product.id),
  );
  const phaseRemaining = Math.max(
    0,
    MAX_PHASE_NEW_PRODUCTS - alreadyAdded,
  );
  const batchLimit = Math.min(readBatchSize(), phaseRemaining);
  if (batchLimit === 0) {
    await writeReport(
      createReport("complete", products, 0, alreadyAdded, metrics),
    );
    console.log("Phase 2 product cap is already satisfied.");
    return;
  }

  const firecrawl = new FirecrawlClient(
    requiredEnvironment("FIRECRAWL_API_KEY"),
    metrics,
  );
  const browserUse = new BrowserUseClient(
    requiredEnvironment("BROWSER_USE_API_KEY"),
    metrics,
  );
  const fetcher = new ProductPageFetcher(firecrawl, browserUse);
  const claude = new ClaudeProductExtractor(
    requiredEnvironment("ANTHROPIC_API_KEY"),
    metrics,
  );

  let addedThisRun = 0;
  try {
    const discovery = await discoverProducts(fetcher, metrics);
    const knownIds = new Set(products.map((product) => product.id));
    const knownUrls = new Set(
      products.map((product) => canonicalUrl(product.productUrl)),
    );

    for (const candidate of discovery.directCandidates) {
      if (addedThisRun >= batchLimit) {
        break;
      }
      const product = toCatalogProduct(candidate);
      if (
        knownIds.has(product.id) ||
        knownUrls.has(canonicalUrl(product.productUrl))
      ) {
        continue;
      }
      products = [...requireValidCatalog([...products, product])];
      await writeCatalog(products);
      await state.markAccepted(product.productUrl, product.id);
      knownIds.add(product.id);
      knownUrls.add(canonicalUrl(product.productUrl));
      addedThisRun += 1;
      reportProgress(products, addedThisRun, alreadyAdded, metrics);
    }

    for (const seed of discovery.pageSeeds) {
      if (addedThisRun >= batchLimit) {
        break;
      }
      const canonicalProductUrl = canonicalUrl(seed.productUrl);
      if (
        knownUrls.has(canonicalProductUrl) ||
        state.hasProcessed(seed.productUrl)
      ) {
        continue;
      }

      try {
        const page = await fetcher.fetchPage(seed.productUrl);
        const candidate = await buildCandidateFromPage(
          seed,
          page,
          claude,
        );
        if (candidate === undefined) {
          await state.markRejected(
            seed.productUrl,
            "Missing explicit high-confidence product fields.",
          );
          continue;
        }
        const product = toCatalogProduct(candidate);
        if (
          knownIds.has(product.id) ||
          knownUrls.has(canonicalUrl(product.productUrl))
        ) {
          await state.markRejected(seed.productUrl, "Duplicate product.");
          continue;
        }
        products = [...requireValidCatalog([...products, product])];
        await writeCatalog(products);
        await state.markAccepted(seed.productUrl, product.id);
        knownIds.add(product.id);
        knownUrls.add(canonicalUrl(product.productUrl));
        addedThisRun += 1;
        reportProgress(products, addedThisRun, alreadyAdded, metrics);
      } catch (error) {
        if (error instanceof ProviderCreditExhaustedError) {
          throw error;
        }
        await state.markRejected(
          seed.productUrl,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    const report = createReport(
      "complete",
      products,
      addedThisRun,
      alreadyAdded + addedThisRun,
      metrics,
    );
    await writeReport(report);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (!(error instanceof ProviderCreditExhaustedError)) {
      throw error;
    }
    const report = createReport(
      "credit-exhausted",
      products,
      addedThisRun,
      alreadyAdded + addedThisRun,
      metrics,
      error.provider,
    );
    await writeReport(report);
    console.warn(JSON.stringify(report, null, 2));
  }
}

async function discoverProducts(
  fetcher: ProductPageFetcher,
  metrics: IngestionMetrics,
): Promise<DiscoveryResult> {
  const directCandidates: ProductCandidate[] = [];
  const pageSeeds: ProductPageSeed[] = [];

  for (const targetUrl of targetDiscoveryUrls()) {
    await wait(TARGET_REQUEST_INTERVAL_MS);
    metrics.retailerApiRequests += 1;
    const response = await fetch(targetUrl, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      continue;
    }
    const payload = (await response.json()) as unknown;
    directCandidates.push(...parseTargetListingResponse(payload));
    pageSeeds.push(
      ...parseTargetDiscoveryTargets(payload).map((target) => ({
        retailerId: "target" as const,
        ...target,
      })),
    );
  }

  for (const categoryUrl of IKEA_DISCOVERY_URLS) {
    const page = await fetcher.fetchPage(categoryUrl);
    pageSeeds.push(...discoverPageSeeds("ikea", page));
  }
  for (const categoryUrl of WAYFAIR_CATEGORY_URLS) {
    const page = await fetcher.fetchPage(categoryUrl);
    pageSeeds.push(...discoverPageSeeds("wayfair", page));
  }

  return {
    directCandidates: deduplicateCandidates(directCandidates),
    pageSeeds: prioritizeAndDeduplicateSeeds(pageSeeds),
  };
}

function discoverPageSeeds(
  retailerId: "ikea" | "wayfair",
  page: FetchedPage,
): readonly ProductPageSeed[] {
  const adapterTargets =
    retailerId === "ikea"
      ? discoverIkeaProducts(page.rawHtml)
      : discoverWayfairProducts(page.rawHtml);
  const linkTargets = [
    ...page.links,
    ...extractJsonLdProductLinks(page.rawHtml),
  ].flatMap((productUrl) => {
    const externalId = externalIdFromUrl(retailerId, productUrl);
    return externalId === undefined
      ? []
      : [{ externalId, productUrl }];
  });
  return [...adapterTargets, ...linkTargets].map((target) => ({
    retailerId,
    ...target,
  }));
}

function externalIdFromUrl(
  retailerId: "ikea" | "wayfair",
  productUrl: string,
): string | undefined {
  const parsed = safeUrl(productUrl);
  if (parsed === undefined) {
    return undefined;
  }
  if (retailerId === "ikea") {
    if (!parsed.hostname.endsWith("ikea.com") || !parsed.pathname.includes("/p/")) {
      return undefined;
    }
    return parsed.pathname.match(/-([a-z]?\d{8})\/?$/i)?.[1];
  }
  if (
    !parsed.hostname.endsWith("wayfair.com") ||
    !parsed.pathname.includes("/furniture/pdp/")
  ) {
    return undefined;
  }
  return parsed.pathname.match(/-(w[a-z0-9]+)\.html$/i)?.[1]?.toLowerCase();
}

function prioritizeAndDeduplicateSeeds(
  seeds: readonly ProductPageSeed[],
): readonly ProductPageSeed[] {
  const unique = [
    ...new Map(
      seeds.map((seed) => [
        `${seed.retailerId}:${canonicalUrl(seed.productUrl)}`,
        seed,
      ]),
    ).values(),
  ];
  const priority: Readonly<Record<RetailerId, number>> = {
    wayfair: 0,
    ikea: 1,
    target: 2,
  };
  return unique.sort(
    (left, right) =>
      priority[left.retailerId] - priority[right.retailerId] ||
      left.externalId.localeCompare(right.externalId),
  );
}

function deduplicateCandidates(
  candidates: readonly ProductCandidate[],
): readonly ProductCandidate[] {
  return [
    ...new Map(
      candidates.map((candidate) => [
        `${candidate.retailerId}:${candidate.externalId}`,
        candidate,
      ]),
    ).values(),
  ];
}

async function readExistingCatalog(): Promise<readonly CatalogProduct[]> {
  return requireValidCatalog(
    JSON.parse(await readFile(OUTPUT_PATH, "utf8")) as unknown,
  );
}

async function writeCatalog(
  products: readonly CatalogProduct[],
): Promise<void> {
  const validated = requireValidCatalog(products);
  await writeFile(
    TEMP_OUTPUT_PATH,
    `${JSON.stringify(validated, null, 2)}\n`,
    "utf8",
  );
  await rename(TEMP_OUTPUT_PATH, OUTPUT_PATH);
}

function createReport(
  status: RunReport["status"],
  products: readonly CatalogProduct[],
  addedThisRun: number,
  addedSincePhaseStart: number,
  metrics: IngestionMetrics,
  stoppedProvider?: string,
): RunReport {
  const retailers: readonly Retailer[] = ["IKEA", "Target", "Wayfair"];
  return {
    status,
    ...(stoppedProvider === undefined ? {} : { stoppedProvider }),
    catalogCount: products.length,
    addedThisRun,
    addedSincePhaseStart,
    perRetailer: Object.fromEntries(
      retailers.map((retailer) => [
        retailer,
        products.filter((product) => product.retailer === retailer).length,
      ]),
    ) as Readonly<Record<Retailer, number>>,
    provenanceByRetailer: Object.fromEntries(
      retailers.map((retailer) => {
        const sources: Record<string, number> = {
          "json-ld": 0,
          "llm-extracted": 0,
          "retailer-api": 0,
        };
        for (const product of products) {
          if (product.retailer === retailer) {
            sources[product.provenance.dimensionsSource] += 1;
          }
        }
        return [retailer, sources];
      }),
    ) as RunReport["provenanceByRetailer"],
    metrics: { ...metrics },
  };
}

async function writeReport(report: RunReport): Promise<void> {
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function reportProgress(
  products: readonly CatalogProduct[],
  addedThisRun: number,
  alreadyAdded: number,
  metrics: IngestionMetrics,
): void {
  if (addedThisRun % 10 !== 0) {
    return;
  }
  console.log(
    JSON.stringify(
      createReport(
        "complete",
        products,
        addedThisRun,
        alreadyAdded + addedThisRun,
        metrics,
      ),
    ),
  );
}

function readBatchSize(): number {
  const argument = process.argv.find((value) =>
    value.startsWith("--batch-size="),
  );
  if (argument === undefined) {
    return DEFAULT_BATCH_SIZE;
  }
  const value = Number.parseInt(argument.split("=")[1] ?? "", 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("--batch-size must be a positive integer.");
  }
  return value;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function canonicalUrl(value: string): string {
  const parsed = safeUrl(value);
  if (parsed === undefined) {
    return value;
  }
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (key !== "piid") {
      parsed.searchParams.delete(key);
    }
  }
  return parsed.toString();
}

function safeUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
