import { canonicalizePublicProductUrl } from "@/lib/live-search/url-security";
import type { FirecrawlProductExtraction } from "@/lib/live-search/providers/firecrawl";

/**
 * Zero-cost extraction for IKEA AU product pages.
 *
 * IKEA serves product pages fully server-rendered: the assembled dimensions,
 * price, availability, and product image are present in the raw HTML as
 * structured JSON, so a plain HTTP fetch replaces a paid scrape. This parser is
 * deliberately regex-based over the page bytes rather than a DOM walk: every
 * captured value is by construction a verbatim substring of the page, which is
 * the catalog's evidence guarantee. If IKEA changes markup, captures fail and
 * the product is skipped — never guessed.
 *
 * Kmart is not parseable this way (plain fetches receive 403); it stays on the
 * paid provider.
 */

export interface FreeExtractionResult {
  readonly extraction: FirecrawlProductExtraction;
  /** The exact page substrings the dimensions were captured from. */
  readonly capturedFrom: readonly string[];
}

const DIMENSION_PATTERN = (label: string): RegExp =>
  new RegExp(`"${label}"\\s*:\\s*"(\\d+(?:\\.\\d+)?) ?cm"`);

// Bind the price to this product id when possible: pages carry prices for
// recommended products too, and the first "price" key in the byte stream is not
// guaranteed to be this product's. The schema.org Offer block is the fallback.
const ID_BOUND_PRICE_PATTERN = (productId: string): RegExp =>
  new RegExp(`"prefixedProductId"\\s*:\\s*"${productId}"[^}]*?"price"\\s*:\\s*"?(\\d+(?:\\.\\d{1,2})?)`);
const OFFER_PRICE_PATTERN = /"@type"\s*:\s*"Offer"[^}]*?"price"\s*:\s*"(\d+(?:\.\d{1,2})?)"/;
const OG_IMAGE_PATTERN = /property="og:image"\s+content="([^"]+)"|content="([^"]+)"\s+property="og:image"/;
const OG_TITLE_PATTERN = /property="og:title"\s+content="([^"]+)"|content="([^"]+)"\s+property="og:title"/;
const JSON_LD_NAME_PATTERN = /"@type"\s*:\s*"Product"[^}]*?"name"\s*:\s*"([^"]+)"/;
const AVAILABILITY_PATTERN = /"availability"\s*:\s*"[^"]*\/(InStock|OutOfStock)"/;

function toMm(cmText: string): number | undefined {
  const cm = Number(cmText);
  if (!Number.isFinite(cm) || cm <= 0) {
    return undefined;
  }
  const mm = Math.round(cm * 10);
  return mm >= 1 && mm <= 10_000 ? mm : undefined;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Parses one IKEA AU product page. Returns undefined when any mandatory fact is
 * missing rather than a partial guess; the caller records the URL as skipped.
 */
export function parseIkeaProductPage(html: string, pageUrl: string): FreeExtractionResult | undefined {
  const captures: string[] = [];
  const dims: Record<string, number> = {};
  const capturedText: Record<string, string> = {};
  for (const label of ["width", "height", "depth"] as const) {
    const match = html.match(DIMENSION_PATTERN(label));
    const mm = match?.[1] === undefined ? undefined : toMm(match[1]);
    if (match === null || match[1] === undefined || mm === undefined) {
      return undefined;
    }
    captures.push(match[0]);
    dims[label] = mm;
    capturedText[label] = match[1];
  }

  const productId = pageUrl.match(/(\d{6,})\/?$/)?.[1];
  const priceMatch = (productId === undefined ? null : html.match(ID_BOUND_PRICE_PATTERN(productId)))
    ?? html.match(OFFER_PRICE_PATTERN);
  const priceMajor = priceMatch?.[1] === undefined ? undefined : Number(priceMatch[1]);
  if (priceMajor === undefined || !Number.isFinite(priceMajor) || priceMajor <= 0) {
    return undefined;
  }
  const priceMinor = Math.round(priceMajor * 100);

  const ogImage = html.match(OG_IMAGE_PATTERN);
  const imageUrl = decodeEntities(ogImage?.[1] ?? ogImage?.[2] ?? "");
  if (imageUrl.length === 0 || !imageUrl.startsWith("https://")) {
    return undefined;
  }

  const nameRaw = html.match(JSON_LD_NAME_PATTERN)?.[1]
    ?? (html.match(OG_TITLE_PATTERN)?.[1] ?? html.match(OG_TITLE_PATTERN)?.[2]);
  if (nameRaw === undefined || nameRaw.trim().length === 0) {
    return undefined;
  }
  const name = decodeEntities(nameRaw.replace(/\s*-\s*IKEA\s*$/i, "").trim()).slice(0, 240);

  const availabilityMatch = html.match(AVAILABILITY_PATTERN)?.[1];
  const availability = availabilityMatch === "InStock"
    ? "in_stock" as const
    : availabilityMatch === "OutOfStock"
      ? "out_of_stock" as const
      : "unknown" as const;

  const canonical = canonicalizePublicProductUrl(pageUrl);
  const width = dims.width;
  const height = dims.height;
  const depth = dims.depth;
  if (width === undefined || height === undefined || depth === undefined) {
    return undefined;
  }

  // The evidence sentence carries the captured page values verbatim (a page
  // that says "106.0 cm" keeps its ".0"), in the labelled form the shared
  // validator requires; capturedFrom holds the raw substrings for audit.
  const dimensionsEvidence =
    `Width: ${capturedText.width} cm; Height: ${capturedText.height} cm; Depth: ${capturedText.depth} cm`;

  return {
    extraction: {
      url: canonical,
      name,
      category: undefined,
      imageUrl,
      imageCandidates: [imageUrl],
      priceMinor,
      currency: "AUD",
      availability,
      dimensions: { widthMm: width, heightMm: height, depthMm: depth },
      dimensionsEvidence,
      markdown: captures.join("\n"),
    },
    capturedFrom: captures,
  };
}
