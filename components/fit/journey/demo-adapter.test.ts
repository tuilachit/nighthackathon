import { describe, expect, it } from "vitest";
import type {
  AccessEvaluation,
  CatalogProduct,
  EvaluatedProduct,
  FitEvaluation,
} from "@/lib/catalog-types";
import {
  adaptEvaluatedProductToDecisionCandidate,
  adaptProductSearchResultsToDecisionCandidates,
} from "./demo-adapter";

const passingFit: FitEvaluation = {
  fits: true,
  orientation: "default",
  widthClearanceMm: 235,
  heightClearanceMm: 65,
  depthClearanceMm: 25,
  minimumClearanceMm: 25,
  confidence: "high",
  reasons: [],
};
const passingAccess: AccessEvaluation = {
  status: "passed",
  passes: true,
  accessWidthMm: 820,
  crossSection: [
    { axis: "depth", sizeMm: 280 },
    { axis: "width", sizeMm: 600 },
  ],
  clearanceMm: 155,
};

describe("static decision adapter", () => {
  it("keeps USD, retailer identity, source truth, and verified model scale explicit", () => {
    const product = productFixture({
      id: "target-oak",
      retailer: "Target",
      productUrl: "https://www.target.com/p/target-oak",
      priceUsd: 129.5,
      dimensionsSource: "llm-extracted",
      model: {
        glbPath: "/models/glb/target-oak.glb",
        scaleVerified: true,
        nativeDimensionsMm: { widthMm: 600, heightMm: 1700, depthMm: 280 },
      },
    });

    const candidate = adaptEvaluatedProductToDecisionCandidate(
      evaluatedFixture(product, passingFit, passingAccess),
    );

    expect(candidate.key).toBe("target-oak");
    expect(candidate.retailer).toEqual({
      key: "target",
      label: "Target",
      host: "target.com",
    });
    expect(candidate.price).toEqual({ minor: 12950, currency: "USD" });
    expect(candidate.packages).toEqual([]);
    expect(candidate.access).toMatchObject({
      status: "passed",
      basis: "assembled-advisory",
      clearanceMm: 155,
    });
    expect(candidate.provenance).toMatchObject({
      source: "retailer-page",
      freshness: "cached",
    });
    expect(candidate.provenance.evidence).toMatch(/High-confidence structured extraction/);
    expect(candidate.asset).toEqual({
      id: "static:target-oak:glb",
      kind: "glb",
      url: "/models/glb/target-oak.glb",
      dimensions: product.dimensions,
      scaleVerified: true,
    });
  });

  it("maps all three static collections without changing their internal order", () => {
    const fit = evaluatedFixture(productFixture({ id: "fit" }), passingFit, passingAccess);
    const doorway = evaluatedFixture(
      productFixture({ id: "doorway", retailer: "Wayfair", productUrl: "https://www.wayfair.com/furniture/pdp/doorway" }),
      passingFit,
      {
        status: "failed",
        passes: false,
        accessWidthMm: 820,
        crossSection: [
          { axis: "depth", sizeMm: 280 },
          { axis: "width", sizeMm: 800 },
        ],
        deficitMm: 45,
        reason: "Fits the space, but 45 mm too wide for the 820 mm access opening.",
      },
    );
    const missFit: FitEvaluation = {
      ...passingFit,
      fits: false,
      widthClearanceMm: -15,
      minimumClearanceMm: -15,
      reasons: ["15 mm too wide for the measured space."],
    };
    const miss = evaluatedFixture(
      productFixture({ id: "miss" }),
      missFit,
      { status: "skipped", passes: true },
    );

    const candidates = adaptProductSearchResultsToDecisionCandidates({
      fits: [fit],
      fitsSpaceButFailsAccess: [doorway],
      nearMisses: [miss],
    });

    expect(candidates.map((candidate) => [candidate.key, candidate.fitStatus])).toEqual([
      ["fit", "fits"],
      ["doorway", "access_issue"],
      ["miss", "near_miss"],
    ]);
    expect(candidates[1].retailer).toMatchObject({
      key: "wayfair",
      label: "Wayfair",
      host: "wayfair.com",
    });
    expect(candidates[2].access).toEqual({
      status: "skipped",
      passes: true,
      basis: "unknown",
    });
  });
});

function productFixture(
  overrides: Partial<CatalogProduct> & {
    readonly dimensionsSource?: CatalogProduct["provenance"]["dimensionsSource"];
  } = {},
): CatalogProduct {
  const { dimensionsSource: sourceOverride, ...productOverrides } = overrides;
  const dimensions = overrides.dimensions ?? {
    widthMm: 600,
    heightMm: 1700,
    depthMm: 280,
  };
  const dimensionsSource = sourceOverride ?? overrides.provenance?.dimensionsSource ?? "json-ld";
  return {
    id: "ikea-oak",
    retailer: "IKEA",
    name: "Narrow oak shelf",
    category: "bookcase",
    priceUsd: 129,
    dimensions,
    materials: ["wood"],
    colors: ["oak"],
    styles: ["narrow"],
    keywords: ["shelf"],
    imagePath: "/products/ikea-oak.jpg",
    productUrl: "https://www.ikea.com/us/en/p/ikea-oak/",
    verification: {
      sourceUrl: "https://www.ikea.com/us/en/p/ikea-oak/",
      verifiedAt: "2026-07-25T00:00:00.000Z",
    },
    provenance: {
      dimensionsSource,
      sourceUrl: overrides.productUrl ?? "https://www.ikea.com/us/en/p/ikea-oak/",
      extractedAt: "2026-07-25T00:00:00.000Z",
      confidence: "high",
    },
    ...productOverrides,
  };
}

function evaluatedFixture(
  product: CatalogProduct,
  fit: FitEvaluation,
  access: AccessEvaluation,
): EvaluatedProduct {
  return {
    product,
    fit,
    access,
    preferenceScore: 0,
    matchedPreferences: [],
  };
}
