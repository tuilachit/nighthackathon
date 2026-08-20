import type { FirecrawlProductExtraction } from "@/lib/live-search/providers/firecrawl";
import { LIVE_RETAILER_IDENTITIES } from "@/lib/live-search/types";
import type { LiveRetailer } from "@/lib/live-search/types";
import type { CatalogCategory } from "@/lib/live-search/catalog/enumerate";

/**
 * Turns a page extraction into the observation object the shared validator
 * accepts, applying the checks that are stricter for a durable catalog row than
 * for a single live result.
 *
 * Pure and network-free: it receives the extraction and the page markdown and
 * returns either an observation to validate or a specific rejection reason.
 * Persisting the row and running validateBrowserSearchOutput happen in the CLI.
 */

export type CatalogIngestResult =
  | { readonly ok: true; readonly observation: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly reason: string };

const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  bookcase: "Bookcase",
  shelving: "Shelving unit",
  sideboard: "Sideboard",
  drawers: "Chest of drawers",
  "tv-unit": "TV unit",
  cabinet: "Cabinet",
  desk: "Desk",
  wardrobe: "Wardrobe",
  bedside: "Bedside table",
  table: "Table",
  bed: "Bed frame",
};

export function buildCatalogObservation(input: {
  readonly retailer: LiveRetailer;
  readonly categoryHint: CatalogCategory;
  readonly extraction: FirecrawlProductExtraction;
  readonly markdown: string;
  readonly observedAt: string;
}): CatalogIngestResult {
  const { retailer, categoryHint, extraction, markdown, observedAt } = input;

  const dimensions = extraction.dimensions;
  if (dimensions === undefined) {
    return { ok: false, reason: "no_dimensions" };
  }
  const evidence = extraction.dimensionsEvidence?.trim();
  if (evidence === undefined || evidence.length === 0) {
    return { ok: false, reason: "no_dimensions_evidence" };
  }

  // Durable-row gate: the evidence string must actually appear on the scraped
  // page, not merely be numerically consistent with the dimensions. This closes
  // the hole where a model could emit a plausible evidence sentence the page
  // never contained. The live path keeps its lighter numeric check because a
  // live result is re-derived on every search.
  if (!markdownContainsEvidence(markdown, evidence)) {
    return { ok: false, reason: "evidence_not_on_page" };
  }

  const imageUrl = extraction.imageUrl ?? extraction.imageCandidates?.[0];
  if (imageUrl === undefined) {
    return { ok: false, reason: "no_image" };
  }
  if (extraction.priceMinor === undefined) {
    return { ok: false, reason: "no_price" };
  }
  if (extraction.currency === undefined) {
    return { ok: false, reason: "no_currency" };
  }

  const retailerProductId =
    trimmedOr(extraction.retailerProductId, deriveRetailerProductId(retailer, extraction.url));
  if (retailerProductId === undefined) {
    return { ok: false, reason: "no_retailer_product_id" };
  }
  const category = trimmedOr(extraction.category, CATEGORY_LABELS[categoryHint]) ?? CATEGORY_LABELS[categoryHint];

  const observation: Readonly<Record<string, unknown>> = {
    retailer: LIVE_RETAILER_IDENTITIES[retailer],
    retailerProductId,
    name: extraction.name,
    category,
    productUrl: extraction.url,
    imageUrl,
    priceMinor: extraction.priceMinor,
    currency: extraction.currency,
    availability: extraction.availability ?? "unknown",
    assembledDimensions: dimensions,
    packages: [],
    dimensionsSource: "retailer-page",
    dimensionsEvidence: evidence,
    observedAt,
    confidence: "high",
  };
  return { ok: true, observation };
}

/** IKEA article number or Kmart product id, parsed from the product URL path. */
export function deriveRetailerProductId(retailer: LiveRetailer, url: string): string | undefined {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return undefined;
  }
  if (retailer === "ikea-au") {
    // .../p/<slug>-<digits>[/]  — the trailing digit run is the article number.
    const match = path.match(/-(\d{6,})\/?$/);
    return match?.[1];
  }
  // Kmart: /product/<slug>-<digits> or /product/<digits>
  const match = path.match(/(\d{4,})\/?$/);
  return match?.[1];
}

/**
 * True when every measurement the evidence states appears on the page. The
 * extractor assembles evidence from separate page fragments (e.g. a spec table
 * lists "Depth: 37.1 cm", "Height: 200.8 cm", "Width: 81.0 cm" on different
 * rows), so the joined string is not a contiguous substring even though each
 * part is genuinely on the page. Splitting on the joiners and requiring each
 * fragment to appear keeps the verbatim guarantee — an invented measurement
 * still fails — without rejecting honest, reformatted evidence. Both sides are
 * lowercased and whitespace-collapsed so spacing differences do not defeat it.
 */
export function markdownContainsEvidence(markdown: string, evidence: string): boolean {
  const haystack = normalizeWhitespace(markdown);
  const fragments = evidence
    .split(/[,;]/)
    .map((fragment) => normalizeWhitespace(fragment).replace(/[.\s]+$/, ""))
    .filter((fragment) => fragment.length > 0);
  return fragments.length > 0 && fragments.every((fragment) => haystack.includes(fragment));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function trimmedOr(value: string | undefined, fallback: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    return trimmed;
  }
  return fallback;
}
