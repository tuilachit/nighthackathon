import type {
  AccessEvaluation,
  CatalogProduct,
  EvaluatedProduct,
  ProductSearchResults,
} from "@/lib/catalog-types";
import type {
  DecisionCandidate,
  DeliveryAccessEvaluation,
  RetailerIdentity,
} from "@/lib/live-search/types";

const STATIC_RETAILER_KEYS: Readonly<Record<CatalogProduct["retailer"], string>> = {
  IKEA: "ikea",
  Target: "target",
  Wayfair: "wayfair",
};

/**
 * Adapts one already-evaluated static catalog result into the shared decision
 * presentation contract without changing its fit, access, price, or rank.
 */
export function adaptEvaluatedProductToDecisionCandidate(
  evaluated: EvaluatedProduct,
): DecisionCandidate {
  const { product } = evaluated;
  return {
    key: product.id,
    workflowId: "static-catalog",
    candidateId: product.id,
    retailer: retailerIdentity(product),
    name: product.name,
    imageUrl: product.imagePath,
    price: {
      minor: Math.round(product.priceUsd * 100),
      currency: "USD",
    },
    availability: "unknown",
    assembledDimensions: product.dimensions,
    packages: [],
    fitStatus: evaluated.fit.fits
      ? evaluated.access.status === "failed"
        ? "access_issue"
        : "fits"
      : "near_miss",
    fit: evaluated.fit,
    access: adaptStaticAccessEvaluation(evaluated.access),
    provenance: {
      source: product.provenance.dimensionsSource === "llm-extracted"
        ? "retailer-page"
        : product.provenance.dimensionsSource,
      evidence: provenanceEvidence(product),
      observedAt: product.provenance.extractedAt,
      freshness: "cached",
    },
    productUrl: product.productUrl,
    ...(product.model === undefined
      ? {}
      : {
          asset: {
            id: `static:${product.id}:glb`,
            kind: "glb" as const,
            url: product.model.glbPath,
            dimensions: product.model.nativeDimensionsMm,
            scaleVerified: product.model.scaleVerified,
          },
        }),
  };
}

/** Preserves the existing deterministic order within each static result tier. */
export function adaptProductSearchResultsToDecisionCandidates(
  results: ProductSearchResults,
): readonly DecisionCandidate[] {
  return [
    ...results.fits,
    ...results.fitsSpaceButFailsAccess,
    ...results.nearMisses,
  ].map(adaptEvaluatedProductToDecisionCandidate);
}

function retailerIdentity(product: CatalogProduct): RetailerIdentity {
  return {
    key: STATIC_RETAILER_KEYS[product.retailer],
    label: product.retailer,
    host: new URL(product.productUrl).hostname.replace(/^www\./, ""),
  };
}

function adaptStaticAccessEvaluation(
  access: AccessEvaluation,
): DeliveryAccessEvaluation {
  if (access.status === "skipped") {
    return { status: "skipped", passes: true, basis: "unknown" };
  }
  if (access.status === "passed") {
    return {
      ...access,
      basis: "assembled-advisory",
    };
  }
  return {
    ...access,
    basis: "assembled-advisory",
  };
}

function provenanceEvidence(product: CatalogProduct): string {
  const source = product.provenance.dimensionsSource;
  if (source === "llm-extracted") {
    return `High-confidence structured extraction from the retailer page: ${product.provenance.sourceUrl}`;
  }
  if (source === "retailer-api") {
    return `Dimensions supplied by the retailer API: ${product.provenance.sourceUrl}`;
  }
  return `Dimensions supplied in retailer JSON-LD: ${product.provenance.sourceUrl}`;
}
