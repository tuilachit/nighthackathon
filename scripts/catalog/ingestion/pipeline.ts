import type {
  CatalogProduct,
  DimensionsSource,
  Retailer,
} from "../../../lib/catalog-types";
import type { ProductTextExtractor } from "./claude-extractor";
import type { FetchedPage } from "./fetchers";
import { extractJsonLdProduct } from "./json-ld";
import {
  inferCategory,
  inferColors,
  inferStyles,
  keywordsFromName,
  normalizeHttpsUrl,
} from "./shared";
import type {
  ProductCandidate,
  ProductDiscoveryTarget,
  RetailerId,
} from "./types";

const RETAILER_NAMES: Readonly<Record<RetailerId, Retailer>> = {
  ikea: "IKEA",
  target: "Target",
  wayfair: "Wayfair",
};

const RETAILER_DOMAINS: Readonly<Record<RetailerId, readonly string[]>> = {
  ikea: ["ikea.com"],
  target: ["target.com"],
  wayfair: ["wayfair.com"],
};

export interface ProductPageSeed extends ProductDiscoveryTarget {
  readonly retailerId: RetailerId;
}

/**
 * Builds one high-confidence candidate from JSON-LD first, then Claude only
 * when the structured retailer data is incomplete.
 */
export async function buildCandidateFromPage(
  seed: ProductPageSeed,
  page: FetchedPage,
  claude: ProductTextExtractor,
): Promise<ProductCandidate | undefined> {
  const jsonLd =
    page.rawHtml.length === 0
      ? undefined
      : extractJsonLdProduct(page.rawHtml);
  const needsClaude =
    jsonLd?.name === undefined ||
    jsonLd.priceUsd === undefined ||
    jsonLd.dimensions === undefined ||
    jsonLd.imageUrl === undefined ||
    jsonLd.productUrl === undefined;
  const extracted = needsClaude
    ? await claude.extract(
        [
          page.markdown,
          ...(page.imageUrls.length === 0
            ? []
            : [
                "\nDirect product image candidates:",
                ...page.imageUrls.slice(0, 12),
              ]),
        ].join("\n"),
        page.finalUrl,
      )
    : undefined;

  if (needsClaude && extracted?.confidence !== "high") {
    return undefined;
  }

  const name = jsonLd?.name ?? extracted?.name;
  const priceUsd = jsonLd?.priceUsd ?? extracted?.priceUsd;
  const dimensions = jsonLd?.dimensions ?? extracted?.dimensions;
  const imageSourceUrl =
    jsonLd?.imageUrl ?? extracted?.imageUrl ?? page.imageUrls[0];
  const productUrl =
    canonicalRetailerUrl(
      seed.retailerId,
      jsonLd?.productUrl ?? extracted?.productUrl ?? page.finalUrl,
    ) ?? canonicalRetailerUrl(seed.retailerId, seed.productUrl);
  if (
    name === undefined ||
    priceUsd === undefined ||
    !Number.isFinite(priceUsd) ||
    priceUsd <= 0 ||
    dimensions === undefined ||
    imageSourceUrl === undefined ||
    productUrl === undefined
  ) {
    return undefined;
  }

  const normalizedImageUrl = normalizeHttpsUrl(imageSourceUrl);
  if (normalizedImageUrl === undefined) {
    return undefined;
  }
  const materials = uniqueTags([
    ...(jsonLd?.materials ?? []),
    ...(extracted?.materials ?? []),
  ]);
  const colors = uniqueTags([
    ...(jsonLd?.colors ?? []),
    ...(extracted?.colors ?? []),
    ...inferColors(name),
  ]);
  const styles = uniqueTags([
    ...(extracted?.styles ?? []),
    ...inferStyles(name),
  ]);
  const dimensionsSource: DimensionsSource =
    jsonLd?.dimensions === undefined ? "llm-extracted" : "json-ld";
  const extractedAt = new Date().toISOString();

  return {
    retailerId: seed.retailerId,
    externalId:
      normalizeExternalId(jsonLd?.externalId) ??
      normalizeExternalId(seed.externalId) ??
      stableExternalId(productUrl),
    name,
    category: inferCategory(name),
    priceUsd,
    dimensions,
    materials,
    colors,
    styles,
    keywords: keywordsFromName(
      `${name} ${materials.join(" ")} ${colors.join(" ")}`,
    ),
    imageSourceUrl: normalizedImageUrl,
    imageAltText: name,
    productUrl,
    verificationSourceUrl: productUrl,
    dimensionsSource,
    extractedAt,
    confidence: "high",
    variantLabel: colors[0],
    variantOptions: colors.length === 0 ? {} : { color: colors.join(", ") },
    sourcePayload: {
      pageProvider: page.source,
      dimensionsEvidence:
        dimensionsSource === "json-ld"
          ? "schema.org Product width, height, and depth"
          : extracted?.dimensionsEvidence ?? null,
    },
  };
}

/** Maps an ingestion candidate into the runtime catalog contract. */
export function toCatalogProduct(candidate: ProductCandidate): CatalogProduct {
  const retailer = RETAILER_NAMES[candidate.retailerId];
  return {
    id: `${candidate.retailerId}-${candidate.externalId.toLowerCase()}`,
    retailer,
    name: candidate.name,
    category: candidate.category,
    priceUsd: candidate.priceUsd,
    dimensions: candidate.dimensions,
    materials: candidate.materials,
    colors: candidate.colors,
    styles: candidate.styles,
    keywords: candidate.keywords,
    imagePath: candidate.imageSourceUrl,
    imageSourceUrl: candidate.imageSourceUrl,
    imageAttribution: `${retailer} product photo`,
    productUrl: candidate.productUrl,
    verification: {
      sourceUrl: candidate.verificationSourceUrl,
      verifiedAt: candidate.extractedAt,
    },
    provenance: {
      dimensionsSource: candidate.dimensionsSource,
      sourceUrl: candidate.verificationSourceUrl,
      extractedAt: candidate.extractedAt,
      confidence: candidate.confidence,
    },
  };
}

function canonicalRetailerUrl(
  retailerId: RetailerId,
  value: string,
): string | undefined {
  const normalized = normalizeHttpsUrl(value);
  if (normalized === undefined) {
    return undefined;
  }
  const url = new URL(normalized);
  const allowed = RETAILER_DOMAINS[retailerId].some(
    (domain) =>
      url.hostname === domain || url.hostname.endsWith(`.${domain}`),
  );
  if (!allowed) {
    return undefined;
  }
  url.hash = "";
  return url.toString();
}

function normalizeExternalId(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.toLowerCase().replace(/[^a-z0-9-]+/g, "");
  return normalized.length === 0 ? undefined : normalized;
}

function stableExternalId(productUrl: string): string {
  const value = new URL(productUrl).pathname
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replace(/\.[a-z]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "");
  if (value === undefined || value.length === 0) {
    throw new Error(`Could not derive a stable id from ${productUrl}.`);
  }
  return value;
}

function uniqueTags(values: readonly string[]): readonly string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
