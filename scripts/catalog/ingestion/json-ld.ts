import type { ProductDimensions } from "../../../lib/catalog-types";
import {
  inferColors,
  isRecord,
  normalizeHttpsUrl,
  numberValue,
  parseInches,
  stringValue,
} from "./shared";

export interface JsonLdProductData {
  readonly externalId?: string;
  readonly name?: string;
  readonly priceUsd?: number;
  readonly dimensions?: ProductDimensions;
  readonly materials: readonly string[];
  readonly colors: readonly string[];
  readonly imageUrl?: string;
  readonly productUrl?: string;
}

/** Extracts explicit schema.org Product facts without guessing missing fields. */
export function extractJsonLdProduct(html: string): JsonLdProductData | undefined {
  const product = parseJsonLd(html)
    .flatMap(flattenJsonLd)
    .find(
      (entry) =>
        isRecord(entry) &&
        schemaTypes(entry["@type"]).some((type) => type === "Product"),
    );
  if (!isRecord(product)) {
    return undefined;
  }

  const offers = firstRecord(product.offers);
  const price = numberFromStringOrNumber(offers?.price);
  const priceCurrency = stringValue(offers?.priceCurrency)?.toUpperCase();
  const widthMm = parseDimensionMm(product.width);
  const heightMm = parseDimensionMm(product.height);
  const depthMm = parseDimensionMm(product.depth);
  const dimensions =
    widthMm === undefined ||
    heightMm === undefined ||
    depthMm === undefined
      ? undefined
      : { widthMm, heightMm, depthMm };
  const name = stringValue(product.name);
  const material = stringList(product.material);
  const colorText = stringList(product.color);
  const productUrl =
    normalizeOptionalUrl(offers?.url) ?? normalizeOptionalUrl(product.url);

  return {
    ...(firstDefinedString(
      product.sku,
      product.mpn,
      product.productID,
    ) === undefined
      ? {}
      : {
          externalId: firstDefinedString(
            product.sku,
            product.mpn,
            product.productID,
          )?.replace(/[.\s]/g, ""),
        }),
    ...(name === undefined ? {} : { name }),
    ...(price === undefined || (priceCurrency !== undefined && priceCurrency !== "USD")
      ? {}
      : { priceUsd: price }),
    ...(dimensions === undefined ? {} : { dimensions }),
    materials: material.map(normalizeTag),
    colors: inferColors(...colorText, name ?? ""),
    ...(firstImageUrl(product.image) === undefined
      ? {}
      : { imageUrl: firstImageUrl(product.image) }),
    ...(productUrl === undefined ? {} : { productUrl }),
  };
}

export function extractJsonLdProductLinks(html: string): readonly string[] {
  const links = new Set<string>();
  for (const entry of parseJsonLd(html).flatMap(flattenJsonLd)) {
    if (!isRecord(entry)) {
      continue;
    }
    for (const value of [
      entry.url,
      isRecord(entry.item) ? entry.item.url : undefined,
    ]) {
      const normalized = normalizeOptionalUrl(value);
      if (normalized !== undefined) {
        links.add(normalized);
      }
    }
  }
  return [...links];
}

function parseJsonLd(html: string): readonly unknown[] {
  return [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].flatMap((match) => {
    try {
      return [JSON.parse(match[1]) as unknown];
    } catch {
      return [];
    }
  });
}

function flattenJsonLd(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }
  if (!isRecord(value)) {
    return [];
  }
  return [
    value,
    ...(Array.isArray(value["@graph"])
      ? value["@graph"].flatMap(flattenJsonLd)
      : []),
  ];
}

function parseDimensionMm(value: unknown): number | undefined {
  if (isRecord(value)) {
    const amount = numberFromStringOrNumber(value.value);
    const unit =
      stringValue(value.unitCode)?.toUpperCase() ??
      stringValue(value.unitText)?.toLowerCase();
    if (amount === undefined || unit === undefined) {
      return undefined;
    }
    if (unit === "MMT" || unit === "mm" || unit === "millimeter") {
      return Math.round(amount);
    }
    if (unit === "CMT" || unit === "cm" || unit === "centimeter") {
      return Math.round(amount * 10);
    }
    if (
      unit === "INH" ||
      unit === "in" ||
      unit === "inch" ||
      unit === "inches"
    ) {
      return Math.round(amount * 25.4);
    }
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value * 25.4);
  }
  const text = stringValue(value);
  if (text === undefined) {
    return undefined;
  }
  const explicit = text.match(
    /^([\d.]+)\s*(mm|millimeters?|cm|centimeters?|in|inches?|["″])$/i,
  );
  if (explicit !== null) {
    const amount = Number.parseFloat(explicit[1]);
    const unit = explicit[2].toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0) {
      return undefined;
    }
    if (unit.startsWith("mm")) {
      return Math.round(amount);
    }
    if (unit.startsWith("cm")) {
      return Math.round(amount * 10);
    }
    return Math.round(amount * 25.4);
  }
  const inches = parseInches(text);
  return inches === undefined ? undefined : Math.round(inches * 25.4);
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.find(isRecord);
  }
  return undefined;
}

function firstImageUrl(value: unknown): string | undefined {
  if (typeof value === "string") {
    return normalizeHttpsUrl(value);
  }
  if (isRecord(value)) {
    return (
      normalizeOptionalUrl(value.contentUrl) ??
      normalizeOptionalUrl(value.url)
    );
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = firstImageUrl(entry);
      if (url !== undefined) {
        return url;
      }
    }
  }
  return undefined;
}

function normalizeOptionalUrl(value: unknown): string | undefined {
  const parsed = stringValue(value);
  return parsed === undefined ? undefined : normalizeHttpsUrl(parsed);
}

function schemaTypes(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function stringList(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function numberFromStringOrNumber(value: unknown): number | undefined {
  const direct = numberValue(value);
  if (direct !== undefined && direct > 0) {
    return direct;
  }
  const text = stringValue(value);
  if (text === undefined) {
    return undefined;
  }
  const parsed = Number.parseFloat(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function firstDefinedString(...values: readonly unknown[]): string | undefined {
  return values.map(stringValue).find((value) => value !== undefined);
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}
