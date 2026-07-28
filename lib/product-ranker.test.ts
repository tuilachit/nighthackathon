import { describe, expect, it } from "vitest";
import { FURNITURE_CATALOG } from "./catalog";
import type { CatalogProduct, SpaceMeasurement } from "./catalog-types";
import { CACHED_FURNITURE_QUERIES, DEMO_SPACE_MEASUREMENT } from "./fit-config";
import { searchProducts } from "./product-ranker";
import { parseFurnitureQuery } from "./query-parser";

describe("searchProducts", () => {
  it.each(CACHED_FURNITURE_QUERIES)(
    "keeps the cached demo query reliable: %s",
    (queryText) => {
      const results = searchProducts(
        FURNITURE_CATALOG,
        DEMO_SPACE_MEASUREMENT,
        parseFurnitureQuery(queryText),
      );
      expect(results.fits.length).toBeGreaterThanOrEqual(3);
      expect(
        new Set(results.fits.slice(0, 3).map((entry) => entry.product.retailer))
          .size,
      ).toBeGreaterThanOrEqual(2);
      expect(results.fitsSpaceButFailsAccess.length).toBeGreaterThanOrEqual(1);
      expect(results.nearMisses.length).toBeGreaterThanOrEqual(1);
      expect(results.nearMisses[0]?.fit.reasons[0]).toMatch(/mm too/);
    },
  );

  it("surfaces the 820 mm access constraint in its own collection", () => {
    const results = searchProducts(
      FURNITURE_CATALOG,
      DEMO_SPACE_MEASUREMENT,
      parseFurnitureQuery(CACHED_FURNITURE_QUERIES[0]),
    );
    expect(results.fitsSpaceButFailsAccess.length).toBeGreaterThanOrEqual(1);
    expect(results.fitsSpaceButFailsAccess[0]?.fit.fits).toBe(true);
    expect(results.fitsSpaceButFailsAccess[0]?.access.status).toBe("failed");
  });

  it("skips access and places space-fitting products in fits when access is absent", () => {
    const withoutAccess: SpaceMeasurement = {
      ...DEMO_SPACE_MEASUREMENT,
      accessWidthMm: undefined,
    };
    const results = searchProducts(FURNITURE_CATALOG, withoutAccess, parseFurnitureQuery("bookcase"));
    expect(results.fitsSpaceButFailsAccess).toHaveLength(0);
    expect(results.fits.every((entry) => entry.access.status === "skipped")).toBe(true);
  });

  it("partitions space failures before access evaluation", () => {
    const products: readonly CatalogProduct[] = [
      createProduct("passes-both", { widthMm: 500, heightMm: 1000, depthMm: 250 }),
      createProduct("fails-access", { widthMm: 800, heightMm: 1000, depthMm: 250 }),
      createProduct("fails-space", { widthMm: 1000, heightMm: 1000, depthMm: 250 }),
    ];
    const results = searchProducts(products, DEMO_SPACE_MEASUREMENT, parseFurnitureQuery("bookcase"));

    expect(results.fits.map((entry) => entry.product.id)).toEqual(["passes-both"]);
    expect(results.fitsSpaceButFailsAccess.map((entry) => entry.product.id)).toEqual(["fails-access"]);
    expect(results.nearMisses.map((entry) => entry.product.id)).toEqual(["fails-space"]);
    expect(results.nearMisses[0]?.access.status).toBe("skipped");
  });

  it("ranks access failures by intent before the smallest deficit", () => {
    const products: readonly CatalogProduct[] = [
      {
        ...createProduct("preferred-large-deficit", {
          widthMm: 800,
          heightMm: 1000,
          depthMm: 250,
        }),
        category: "shelving-unit",
      },
      {
        ...createProduct("preferred-small-deficit", {
          widthMm: 760,
          heightMm: 1000,
          depthMm: 250,
        }),
        category: "shelving-unit",
      },
      createProduct("other-category-tiny-deficit", {
        widthMm: 756,
        heightMm: 1000,
        depthMm: 250,
      }),
    ];
    const results = searchProducts(
      products,
      DEMO_SPACE_MEASUREMENT,
      parseFurnitureQuery("shelving unit"),
    );

    expect(results.fitsSpaceButFailsAccess.map((entry) => entry.product.id)).toEqual([
      "preferred-small-deficit",
      "preferred-large-deficit",
      "other-category-tiny-deficit",
    ]);
  });
});

function createProduct(id: string, dimensions: CatalogProduct["dimensions"]): CatalogProduct {
  return {
    id,
    retailer: "IKEA",
    name: id,
    category: "bookcase",
    priceUsd: 100,
    dimensions,
    materials: ["wood"],
    colors: ["white"],
    styles: ["minimalist"],
    keywords: ["bookcase"],
    imagePath: "/images/products/billy-low.svg",
    productUrl: "https://example.com/product",
    verification: {
      sourceUrl: "https://example.com/product",
      verifiedAt: "2026-07-24",
    },
    provenance: {
      dimensionsSource: "json-ld",
      sourceUrl: "https://example.com/product",
      extractedAt: "2026-07-24",
      confidence: "high",
    },
  };
}
