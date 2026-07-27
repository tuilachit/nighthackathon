import {
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
import type {
  JsonValue,
  ProductCandidate,
  ProductDiscoveryTarget,
} from "./types";

export const IKEA_CATEGORY_URLS = [
  "https://www.ikea.com/us/en/cat/bookcases-10382/",
  "https://www.ikea.com/us/en/cat/shelf-units-11465/",
] as const;

export function discoverIkeaProducts(html: string): readonly ProductDiscoveryTarget[] {
  const values = parseJsonLd(html);
  const graph = values.find((value) => isRecord(value) && Array.isArray(value["@graph"]));
  if (!isRecord(graph) || !Array.isArray(graph["@graph"])) {
    return [];
  }

  const page = graph["@graph"].find(
    (entry) => isRecord(entry) && entry["@type"] === "CollectionPage",
  );
  if (!isRecord(page) || !isRecord(page.mainEntity) || !Array.isArray(page.mainEntity.itemListElement)) {
    return [];
  }

  return page.mainEntity.itemListElement.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.item)) {
      return [];
    }
    const productUrl = stringValue(entry.item.url);
    if (productUrl === undefined) {
      return [];
    }
    const externalId = productUrl.match(/-([a-z]?\d{8})\/?$/i)?.[1];
    return externalId === undefined ? [] : [{ externalId, productUrl }];
  });
}

export function parseIkeaProduct(html: string): ProductCandidate | undefined {
  const value = parseJsonLd(html).find(
    (entry) => isRecord(entry) && entry["@type"] === "Product",
  );
  if (!isRecord(value)) {
    return undefined;
  }

  const name = stringValue(value.name);
  const externalId = stringValue(value.mpn)?.replace(/\./g, "");
  const width = stringValue(value.width);
  const height = stringValue(value.height);
  const depth = stringValue(value.depth);
  const color = stringValue(value.color) ?? "";
  const material = stringValue(value.material) ?? "";
  const description = stringValue(value.description) ?? "";
  const imageSourceUrl = firstImageUrl(value.image);
  const offers = isRecord(value.offers) ? value.offers : undefined;
  const priceString = offers === undefined ? undefined : stringValue(offers.price);
  const price = priceString === undefined ? numberValue(offers?.price) : Number.parseFloat(priceString);
  const productUrl = offers === undefined ? undefined : stringValue(offers.url);
  const dimensions =
    width === undefined || height === undefined || depth === undefined
      ? undefined
      : dimensionsFromInches(width, height, depth);

  if (
    name === undefined ||
    externalId === undefined ||
    dimensions === undefined ||
    price === undefined ||
    !Number.isFinite(price) ||
    price <= 0 ||
    imageSourceUrl === undefined ||
    productUrl === undefined
  ) {
    return undefined;
  }

  return {
    retailerId: "ikea",
    externalId,
    name,
    category: inferCategory(name),
    priceUsd: price,
    dimensions,
    materials: material.length === 0 ? [] : material.split(",").map(normalizeTag),
    colors: inferColors(color, name),
    styles: inferStyles(name, description),
    keywords: keywordsFromName(name),
    imageSourceUrl,
    imageAltText: name,
    productUrl,
    verificationSourceUrl: productUrl,
    variantLabel: color.length === 0 ? undefined : color,
    variantOptions: color.length === 0 ? {} : { color },
    sourcePayload: {
      schemaType: "Product",
      category: stringValue(value.category) ?? null,
      color: color || null,
      material: material || null,
    },
  };
}

function parseJsonLd(html: string): readonly unknown[] {
  return [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => {
      try {
        return [JSON.parse(match[1]) as JsonValue];
      } catch {
        return [];
      }
    });
}

function firstImageUrl(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return typeof value === "string" ? normalizeHttpsUrl(value) : undefined;
  }

  for (const image of value) {
    if (typeof image === "string") {
      const url = normalizeHttpsUrl(image);
      if (url !== undefined) {
        return url;
      }
    }
    if (isRecord(image)) {
      const url = stringValue(image.contentUrl);
      if (url !== undefined) {
        return normalizeHttpsUrl(url);
      }
    }
  }
  return undefined;
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}
