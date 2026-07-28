import { load } from "cheerio";
import { normalizeHttpsUrl } from "./shared";
import type { ProductDiscoveryTarget } from "./types";

export const WAYFAIR_CATEGORY_URL =
  "https://www.wayfair.com/furniture/sb0/bookcases-c1780385.html";

export function discoverWayfairProducts(html: string): readonly ProductDiscoveryTarget[] {
  const $ = load(html);
  const products = new Map<string, ProductDiscoveryTarget>();

  $("[data-test-id='CardWrapper']").each((_index, element) => {
    const context = $(element).attr("data-clio-context");
    const externalId = context?.match(/"displayListingID":"([^"]+)"/)?.[1]?.toLowerCase();
    const productUrl = $(element)
      .find("a[href*='/furniture/pdp/']")
      .first()
      .attr("href");
    if (externalId === undefined || productUrl === undefined || products.has(externalId)) {
      return;
    }
    const normalizedUrl = canonicalWayfairUrl(productUrl);
    if (normalizedUrl !== undefined) {
      products.set(externalId, { externalId, productUrl: normalizedUrl });
    }
  });

  return [...products.values()];
}

function canonicalWayfairUrl(value: string): string | undefined {
  const normalized = normalizeHttpsUrl(value);
  if (normalized === undefined) {
    return undefined;
  }
  const url = new URL(normalized);
  for (const key of [...url.searchParams.keys()]) {
    if (key !== "piid") {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}
