import type {
  AccessEvaluation,
  CatalogProduct,
  EvaluatedProduct,
  FurnitureQuery,
  ProductSearchResults,
  SpaceMeasurement,
} from "./catalog-types";
import { evaluateProductAccess, evaluateProductFit } from "./fit-engine";
import { DEFAULT_CLEARANCE_POLICY } from "./fit-config";

export function searchProducts(
  products: readonly CatalogProduct[],
  measurement: SpaceMeasurement,
  query: FurnitureQuery,
): ProductSearchResults {
  const evaluated = products.map((product) => evaluateProduct(product, measurement, query));
  const nearMisses = evaluated
    .filter((entry) => !entry.fit.fits)
    .sort(compareNearMisses);
  const spaceFits = evaluated.filter((entry) => entry.fit.fits);
  const fitsSpaceButFailsAccess = spaceFits
    .filter((entry) => entry.access.status === "failed")
    .sort((left, right) => compareAccessFailures(left, right, query));
  const fits = spaceFits
    .filter((entry) => entry.access.status !== "failed")
    .sort((left, right) => comparePreferences(left, right, query));

  return { fits, fitsSpaceButFailsAccess, nearMisses };
}

function evaluateProduct(
  product: CatalogProduct,
  measurement: SpaceMeasurement,
  query: FurnitureQuery,
): EvaluatedProduct {
  const fit = evaluateProductFit(product.dimensions, measurement, DEFAULT_CLEARANCE_POLICY);
  const access: AccessEvaluation = fit.fits
    ? evaluateProductAccess(
        product.dimensions,
        measurement.accessWidthMm,
        measurement.uncertaintyMm,
        DEFAULT_CLEARANCE_POLICY,
      )
    : { status: "skipped", passes: true };
  const matchedPreferences = getMatchedPreferences(product, query);

  return {
    product,
    fit,
    access,
    preferenceScore: getPreferenceScore(product, query, matchedPreferences),
    matchedPreferences,
  };
}

function comparePreferences(
  left: EvaluatedProduct,
  right: EvaluatedProduct,
  query: FurnitureQuery,
): number {
  const intentComparison = compareIntentPreferences(left, right, query);
  if (intentComparison !== 0) {
    return intentComparison;
  }

  const confidenceOrder = { high: 2, medium: 1, low: 0 } as const;
  if (left.fit.confidence !== right.fit.confidence) {
    return confidenceOrder[right.fit.confidence] - confidenceOrder[left.fit.confidence];
  }
  if (left.fit.minimumClearanceMm !== right.fit.minimumClearanceMm) {
    return right.fit.minimumClearanceMm - left.fit.minimumClearanceMm;
  }
  if (left.product.priceUsd !== right.product.priceUsd) {
    return left.product.priceUsd - right.product.priceUsd;
  }
  return left.product.id.localeCompare(right.product.id);
}

function compareIntentPreferences(
  left: EvaluatedProduct,
  right: EvaluatedProduct,
  query: FurnitureQuery,
): number {
  const leftCategory = query.category === undefined || left.product.category === query.category ? 1 : 0;
  const rightCategory = query.category === undefined || right.product.category === query.category ? 1 : 0;
  if (leftCategory !== rightCategory) {
    return rightCategory - leftCategory;
  }

  const leftBudget = query.maxPrice === undefined || left.product.priceUsd <= query.maxPrice ? 1 : 0;
  const rightBudget = query.maxPrice === undefined || right.product.priceUsd <= query.maxPrice ? 1 : 0;
  if (leftBudget !== rightBudget) {
    return rightBudget - leftBudget;
  }
  if (left.preferenceScore !== right.preferenceScore) {
    return right.preferenceScore - left.preferenceScore;
  }
  return 0;
}

function compareAccessFailures(
  left: EvaluatedProduct,
  right: EvaluatedProduct,
  query: FurnitureQuery,
): number {
  const intentComparison = compareIntentPreferences(left, right, query);
  if (intentComparison !== 0) {
    return intentComparison;
  }
  const leftDeficit = left.access.status === "failed" ? left.access.deficitMm : 0;
  const rightDeficit = right.access.status === "failed" ? right.access.deficitMm : 0;
  return (
    leftDeficit - rightDeficit ||
    left.product.priceUsd - right.product.priceUsd ||
    left.product.id.localeCompare(right.product.id)
  );
}

function compareNearMisses(left: EvaluatedProduct, right: EvaluatedProduct): number {
  return (
    right.fit.minimumClearanceMm - left.fit.minimumClearanceMm ||
    right.preferenceScore - left.preferenceScore ||
    left.product.id.localeCompare(right.product.id)
  );
}

function getPreferenceScore(
  product: CatalogProduct,
  query: FurnitureQuery,
  matchedPreferences: readonly string[],
): number {
  const categoryScore = query.category === product.category ? 100 : 0;
  const budgetScore =
    query.maxPrice === undefined ? 0 : product.priceUsd <= query.maxPrice ? 40 : -Math.ceil(product.priceUsd - query.maxPrice);
  return categoryScore + budgetScore + matchedPreferences.length * 10;
}

function getMatchedPreferences(product: CatalogProduct, query: FurnitureQuery): readonly string[] {
  const searchable = new Set(
    [
      ...product.materials,
      ...product.colors,
      ...product.styles,
      ...product.keywords,
      product.name.toLowerCase(),
    ].flatMap((value) => value.split(/\s+/)),
  );

  return [...query.materials, ...query.colors, ...query.styles, ...query.keywords].filter((value) =>
    searchable.has(value.toLowerCase()),
  );
}
