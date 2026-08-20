import { canonicalizePublicProductUrl } from "@/lib/live-search/url-security";
import { LIVE_RETAILER_IDENTITIES, LIVE_RETAILERS } from "@/lib/live-search/types";
import type { LiveRetailer } from "@/lib/live-search/types";

/**
 * Enumeration of retailer product URLs from the retailers' own sitemaps.
 *
 * Sitemaps are the free, authoritative source of every product URL a retailer
 * publishes, so discovery for the catalog costs no provider credits. This module
 * is pure: it parses sitemap XML and classifies URLs. Fetching and persistence
 * live in the backfill CLI so the classification can be tested without a network.
 */

export interface CatalogUrlCandidate {
  readonly retailer: LiveRetailer;
  readonly canonicalUrl: string;
  readonly categoryHint: CatalogCategory;
}

export type CatalogCategory =
  | "bookcase"
  | "shelving"
  | "sideboard"
  | "drawers"
  | "tv-unit"
  | "cabinet"
  | "desk"
  | "wardrobe"
  | "bedside"
  | "table"
  | "bed";

/**
 * Slug fragments that mark a storage-furniture product, most specific first so
 * "chest-of-drawers" classifies as drawers before a bare "chest" would.
 * Matching is substring against the lowercased URL path.
 */
const CATEGORY_RULES: readonly { readonly hint: CatalogCategory; readonly fragments: readonly string[] }[] = [
  { hint: "bookcase", fragments: ["bookcase", "bookshelf", "book-case"] },
  { hint: "shelving", fragments: ["shelving-unit", "shelving", "shelf-unit", "wall-shelf", "-shelf-", "cube-storage", "cube-unit", "cube-bookcase"] },
  { hint: "sideboard", fragments: ["sideboard", "buffet", "-buffet-"] },
  { hint: "drawers", fragments: ["chest-of-drawers", "chest-of", "drawer-unit", "-drawers-", "tallboy", "-drawer-"] },
  { hint: "tv-unit", fragments: ["tv-unit", "tv-bench", "media-unit", "tv-stand", "entertainment-unit"] },
  { hint: "cabinet", fragments: ["storage-cabinet", "display-cabinet", "cabinet-with"] },
  { hint: "desk", fragments: ["-desk-", "desk-", "-desk/", "workstation", "gaming-desk", "standing-desk"] },
  { hint: "wardrobe", fragments: ["wardrobe", "armoire", "-robe-"] },
  { hint: "bedside", fragments: ["bedside-table", "bedside", "nightstand", "night-stand"] },
  { hint: "table", fragments: ["coffee-table", "side-table", "dining-table", "console-table", "-table-"] },
  { hint: "bed", fragments: ["bed-frame", "bedframe", "day-bed", "daybed"] },
];

/** Extracts <loc> URLs from a sitemap or sitemap-index document. */
export function parseSitemapUrls(xml: string): readonly string[] {
  const urls: string[] = [];
  const pattern = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const value = decodeXmlEntities(match[1] ?? "");
    if (value.length > 0) {
      urls.push(value);
    }
  }
  return urls;
}

/** True when the URL is a product-detail page for a supported retailer. */
export function retailerForProductUrl(url: string): LiveRetailer | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:") {
    return undefined;
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  for (const retailer of LIVE_RETAILERS) {
    const identity = LIVE_RETAILER_IDENTITIES[retailer];
    const onHost = host === identity.host || host.endsWith(`.${identity.host}`);
    if (!onHost) {
      continue;
    }
    if (retailer === "ikea-au" && path.includes("/au/en/p/")) {
      return retailer;
    }
    if (retailer === "kmart-au" && path.startsWith("/product/")) {
      return retailer;
    }
  }
  return undefined;
}

/** Classifies a product URL into a storage-furniture category, or undefined if it is not one. */
export function classifyCategory(url: string): CatalogCategory | undefined {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return undefined;
  }
  for (const rule of CATEGORY_RULES) {
    if (rule.fragments.some((fragment) => path.includes(fragment))) {
      return rule.hint;
    }
  }
  return undefined;
}

/**
 * Turns raw sitemap URLs into deduplicated storage-furniture candidates. A URL
 * is kept only when it is a supported retailer product page, classifies into a
 * storage category, and canonicalizes safely; tracking parameters are stripped
 * so the same product cannot enter the queue twice.
 */
export function selectCatalogCandidates(urls: readonly string[]): readonly CatalogUrlCandidate[] {
  const seen = new Set<string>();
  const candidates: CatalogUrlCandidate[] = [];
  for (const url of urls) {
    const retailer = retailerForProductUrl(url);
    if (retailer === undefined) {
      continue;
    }
    const categoryHint = classifyCategory(url);
    if (categoryHint === undefined) {
      continue;
    }
    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizePublicProductUrl(url);
    } catch {
      continue;
    }
    if (seen.has(canonicalUrl)) {
      continue;
    }
    seen.add(canonicalUrl);
    candidates.push({ retailer, canonicalUrl, categoryHint });
  }
  return candidates;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
