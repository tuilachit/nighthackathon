import {
  decodeHtml,
  dimensionsFromInches,
  inferCategory,
  inferColors,
  inferStyles,
  isRecord,
  keywordsFromName,
  normalizeHttpsUrl,
  numberValue,
  stringValue,
} from "./shared";
import type { ProductCandidate, ProductDiscoveryTarget } from "./types";

const TARGET_REDSKY_ENDPOINT =
  "https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2";
const TARGET_REDSKY_KEY = "9f36aeafbe60771e321a7cc95a78140772ab3e96";
const TARGET_CATEGORY_ID = "5xtmy";
const TARGET_CATEGORY_PATH =
  "/c/bookshelves-bookcases-office-furniture-home-decor/-/N-5xtmy";
const PAGE_SIZE = 28;
const PAGE_COUNT = 8;

export function targetDiscoveryUrls(): readonly string[] {
  return Array.from({ length: PAGE_COUNT }, (_value, pageIndex) => pageIndex * PAGE_SIZE).map((offset) => {
    const url = new URL(TARGET_REDSKY_ENDPOINT);
    const params: Readonly<Record<string, string>> = {
      key: TARGET_REDSKY_KEY,
      category: TARGET_CATEGORY_ID,
      channel: "WEB",
      count: String(PAGE_SIZE),
      default_purchasability_filter: "true",
      include_sponsored: "false",
      new_search: "false",
      offset: String(offset),
      page: TARGET_CATEGORY_PATH,
      platform: "desktop",
      pricing_store_id: "2093",
      store_ids: "2093,3375,955,1336,1975",
      visitor_id: "night-hack-catalog",
      zip: "77002",
    };
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  });
}

export function parseTargetDiscoveryTargets(
  input: unknown,
): readonly ProductDiscoveryTarget[] {
  if (
    !isRecord(input) ||
    !isRecord(input.data) ||
    !isRecord(input.data.search) ||
    !Array.isArray(input.data.search.products)
  ) {
    return [];
  }

  return input.data.search.products.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.item)) {
      return [];
    }
    const externalId = stringValue(entry.tcin);
    const enrichment = isRecord(entry.item.enrichment)
      ? entry.item.enrichment
      : undefined;
    const productUrl = normalizeHttpsUrl(
      stringValue(enrichment?.buy_url) ?? "",
    );
    return externalId === undefined || productUrl === undefined
      ? []
      : [{ externalId, productUrl }];
  });
}

export function parseTargetListingResponse(input: unknown): readonly ProductCandidate[] {
  if (
    !isRecord(input) ||
    !isRecord(input.data) ||
    !isRecord(input.data.search) ||
    !Array.isArray(input.data.search.products)
  ) {
    return [];
  }

  return input.data.search.products.flatMap((entry) => {
    const product = parseTargetProduct(entry);
    return product === undefined ? [] : [product];
  });
}

function parseTargetProduct(value: unknown): ProductCandidate | undefined {
  if (!isRecord(value) || !isRecord(value.item) || !isRecord(value.price)) {
    return undefined;
  }
  const item = value.item;
  const description = isRecord(item.product_description) ? item.product_description : undefined;
  const enrichment = isRecord(item.enrichment) ? item.enrichment : undefined;
  const imageInfo = enrichment !== undefined && isRecord(enrichment.image_info)
    ? enrichment.image_info
    : undefined;
  const primaryImage = imageInfo !== undefined && isRecord(imageInfo.primary_image)
    ? imageInfo.primary_image
    : undefined;
  const title = stringValue(description?.title);
  const name = title === undefined ? undefined : decodeHtml(title);
  const externalId = stringValue(value.tcin);
  const price = numberValue(value.price.current_retail);
  const productUrl = stringValue(enrichment?.buy_url);
  const imageSourceUrl = stringValue(primaryImage?.url);
  const imageAltText = stringValue(primaryImage?.alt_text) ?? name;
  const bullets = Array.isArray(description?.bullet_descriptions)
    ? description.bullet_descriptions.filter((bullet): bullet is string => typeof bullet === "string")
    : [];
  const dimensions = parseTargetDimensions(bullets);
  const material = parseLabeledBullet(bullets, "Material");
  const surfaceMaterial = parseLabeledBullet(bullets, "Surface Material");
  const brand = isRecord(item.primary_brand) ? stringValue(item.primary_brand.name) : undefined;

  if (
    name === undefined ||
    externalId === undefined ||
    price === undefined ||
    price <= 0 ||
    productUrl === undefined ||
    imageSourceUrl === undefined ||
    dimensions === undefined
  ) {
    return undefined;
  }

  const normalizedProductUrl = normalizeHttpsUrl(productUrl);
  const normalizedImageUrl = normalizeHttpsUrl(imageSourceUrl);
  if (normalizedProductUrl === undefined || normalizedImageUrl === undefined) {
    return undefined;
  }

  const materials = [material, surfaceMaterial]
    .filter((entry): entry is string => entry !== undefined)
    .map((entry) => entry.toLowerCase());
  const colors = inferColors(name, imageAltText ?? "");

  return {
    retailerId: "target",
    externalId,
    name,
    category: inferCategory(name),
    priceUsd: price,
    dimensions,
    materials,
    colors,
    styles: inferStyles(name),
    keywords: keywordsFromName(`${name} ${brand ?? ""}`),
    imageSourceUrl: normalizedImageUrl,
    imageAltText: imageAltText ?? name,
    productUrl: normalizedProductUrl,
    verificationSourceUrl: normalizedProductUrl,
    dimensionsSource: "retailer-api",
    extractedAt: new Date().toISOString(),
    confidence: "high",
    variantLabel: colors[0],
    variantOptions: colors.length === 0 ? {} : { color: colors.join(", ") },
    sourcePayload: {
      tcin: externalId,
      brand: brand ?? null,
      dpci: stringValue(item.dpci) ?? null,
    },
  };
}

function parseTargetDimensions(bullets: readonly string[]) {
  const dimensionBullet = bullets.find((bullet) => /Dimensions \(Overall\)/i.test(bullet));
  const match = dimensionBullet?.match(
    /([\d.]+)\s+Inches\s+\(H\)\s*x\s*([\d.]+)\s+Inches\s+\(W\)\s*x\s*([\d.]+)\s+Inches\s+\(D\)/i,
  );
  return match === null || match === undefined
    ? undefined
    : dimensionsFromInches(
        Number.parseFloat(match[2]),
        Number.parseFloat(match[1]),
        Number.parseFloat(match[3]),
      );
}

function parseLabeledBullet(
  bullets: readonly string[],
  label: string,
): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = bullets
    .find((bullet) => new RegExp(`<B>${escaped}:<\\/B>`, "i").test(bullet))
    ?.match(new RegExp(`<B>${escaped}:<\\/B>\\s*([^<]+)`, "i"));
  return match?.[1]?.trim();
}
