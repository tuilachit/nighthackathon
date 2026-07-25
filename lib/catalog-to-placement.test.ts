import { describe, expect, it } from "vitest";
import { buildMeshyPromptForProduct, catalogProductToPlacementCandidate } from "./catalog-to-placement";
import type { CatalogProduct, FitEvaluation } from "./catalog-types";

const fits: FitEvaluation = {
  fits: true,
  orientation: "default",
  widthClearanceMm: 34,
  heightClearanceMm: 120,
  depthClearanceMm: 60,
  minimumClearanceMm: 34,
  confidence: "high",
  reasons: [],
};

function buildProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "ikea-laiva-40178591",
    retailer: "IKEA",
    name: "LAIVA Bookcase",
    category: "bookcase",
    priceUsd: 39.99,
    dimensions: { widthMm: 619, heightMm: 1651, depthMm: 241 },
    materials: ["particleboard"],
    colors: ["black"],
    styles: ["slim"],
    keywords: ["bookcase"],
    imagePath: "/images/products/laiva.svg",
    productUrl: "https://www.ikea.com/us/en/p/laiva-bookcase-black-brown-40178591/",
    verification: { sourceUrl: "https://www.ikea.com/...", verifiedAt: "2026-07-24" },
    ...overrides,
  };
}

describe("catalogProductToPlacementCandidate", () => {
  it("trusts the catalog model's native scale when one is verified", () => {
    const product = buildProduct({
      model: {
        glbPath: "/models/glb/ikea-laiva.glb",
        usdzPath: "/models/usdz/ikea-laiva.usdz",
        scaleVerified: true,
        nativeDimensionsMm: { widthMm: 619, heightMm: 1651, depthMm: 241 },
      },
    });

    const candidate = catalogProductToPlacementCandidate(product, fits);

    expect(candidate.model.glbUrl).toBe("/models/glb/ikea-laiva.glb");
    expect(candidate.model.iosUsdzUrl).toBe("/models/usdz/ikea-laiva.usdz");
    expect(candidate.model.scaleSource).toBe("verified");
    expect(candidate.retailerUrl).toBe(product.productUrl);
    expect(candidate.fitLabel).toBe("Fits · 34 mm clear");
  });

  it("falls back to the placeholder box when the catalog has no model yet", () => {
    const product = buildProduct();
    const candidate = catalogProductToPlacementCandidate(product, fits);

    expect(candidate.model.glbUrl).toBeUndefined();
    expect(candidate.model.placeholderBoxGlbUrl).toBe("/models/unit-box.glb");
    expect(candidate.model.dimensions).toEqual(product.dimensions);
  });
});

describe("buildMeshyPromptForProduct", () => {
  it("builds a descriptive prompt from the catalog's own verified attributes", () => {
    const product = buildProduct({
      materials: ["particleboard", "wood"],
      colors: ["black", "brown"],
      styles: ["slim", "minimalist"],
    });

    expect(buildMeshyPromptForProduct(product)).toBe(
      "LAIVA Bookcase, bookcase, particleboard, wood, black, brown, slim, minimalist",
    );
  });
});
