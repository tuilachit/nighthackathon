import { load } from "cheerio";
import {
  dimensionsFromInches,
  inferCategory,
  inferColors,
  inferStyles,
  keywordsFromName,
  normalizeHttpsUrl,
} from "./shared";
import type { ProductCandidate, ProductDiscoveryTarget } from "./types";

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

export function parseWayfairProduct(
  html: string,
  productUrl: string,
): ProductCandidate | undefined {
  const $ = load(html);
  const name = $("h1").first().text().trim();
  const externalId = productUrl.match(/-(w\d+)\.html/i)?.[1]?.toLowerCase();
  const priceText = $(
    [
      "[data-test-id='StandardPricingPrice-PRIMARY']",
      "[data-test-id='StandardPricingPrice-SALE']",
      "[data-test-id='PriceDisplay']",
    ].join(","),
  )
    .first()
    .text();
  const price = Number.parseFloat(priceText.replace(/[^0-9.]/g, ""));
  const imageElement = $("img[alt]")
    .filter((_index, element) => {
      const source = $(element).attr("src") ?? "";
      return (
        ($(element).attr("alt") ?? "").startsWith(name) &&
        source.includes("wfcdn.com") &&
        !source.includes("resize-h48-w48") &&
        !source.includes("resize-h50-w50")
      );
    })
    .first();
  const imageSourceUrl = imageElement.attr("src");
  const dimensionsText =
    html.match(/Overall Dimensions\\",\\"value\\":\\"([^"\\]+)/)?.[1] ??
    $("body").text().match(
      /Overall Dimensions\s+([\d.]+)''\s*H\s*X\s*([\d.]+)''\s*W\s*X\s*([\d.]+)''\s*D/i,
    )?.slice(1).join(" X ");
  const dimensionsMatch = dimensionsText?.match(
    /([\d.]+)''\s*H\s*X\s*([\d.]+)''\s*W\s*X\s*([\d.]+)''\s*D/i,
  );
  const dimensions =
    dimensionsMatch === null || dimensionsMatch === undefined
      ? undefined
      : dimensionsFromInches(
          Number.parseFloat(dimensionsMatch[2]),
          Number.parseFloat(dimensionsMatch[1]),
          Number.parseFloat(dimensionsMatch[3]),
        );
  const material =
    html.match(
      /description\\":\\"Frame Material\\",\\"additionalDetails\\":\\"([^"\\]+)/,
    )?.[1] ?? "";
  const colorLabel = $("*")
    .filter((_index, element) => $(element).children().length === 0 && $(element).text().trim() === "Color:")
    .first();
  const color = colorLabel.next().text().trim();
  const normalizedImageUrl =
    imageSourceUrl === undefined ? undefined : normalizeHttpsUrl(imageSourceUrl);

  if (
    name.length === 0 ||
    externalId === undefined ||
    !Number.isFinite(price) ||
    price <= 0 ||
    normalizedImageUrl === undefined ||
    dimensions === undefined
  ) {
    return undefined;
  }

  const colors = inferColors(color, name);
  return {
    retailerId: "wayfair",
    externalId,
    name,
    category: inferCategory(name),
    priceUsd: price,
    dimensions,
    materials: material.length === 0 ? [] : [material.toLowerCase()],
    colors,
    styles: inferStyles(name),
    keywords: keywordsFromName(name),
    imageSourceUrl: normalizedImageUrl,
    imageAltText: name,
    productUrl,
    verificationSourceUrl: productUrl,
    variantLabel: color.length === 0 ? undefined : color,
    variantOptions: color.length === 0 ? {} : { color },
    sourcePayload: {
      sku: externalId,
      frameMaterial: material || null,
      selectedColor: color || null,
    },
  };
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
