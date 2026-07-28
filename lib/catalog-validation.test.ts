import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import rawCatalog from "@/public/catalog.json";
import { validateCatalog } from "./catalog-validation";

describe("runtime furniture catalog", () => {
  it("contains 120 fully verified products", () => {
    const result = validateCatalog(rawCatalog);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.products).toHaveLength(120);
      expect(new Set(result.products.map((product) => product.retailer))).toEqual(
        new Set(["IKEA", "Target", "Wayfair"]),
      );
      expect(result.products.every((product) => product.verification.sourceUrl.length > 0)).toBe(true);
      expect(
        result.products.every(
          (product) =>
            product.provenance.confidence === "high" &&
            product.provenance.sourceUrl.length > 0,
        ),
      ).toBe(true);
      const models = result.products.flatMap((product) =>
        product.model === undefined ? [] : [{ product, model: product.model }],
      );
      expect(models.length).toBeGreaterThanOrEqual(6);
      expect(new Set(models.map(({ model }) => model.glbPath))).toHaveLength(
        models.length,
      );

      for (const { product, model } of models) {
        expect(model.nativeDimensionsMm).toEqual(product.dimensions);
        const glbPath = resolve(process.cwd(), "public", model.glbPath.slice(1));
        expect(existsSync(glbPath), `${model.glbPath} should exist`).toBe(true);
        if (model.usdzPath !== undefined) {
          expect(
            existsSync(resolve(process.cwd(), "public", model.usdzPath.slice(1))),
            `${model.usdzPath} should exist`,
          ).toBe(true);
        }
      }
    }
  });

  it("rejects a product without verification metadata", () => {
    const invalid = [{ ...rawCatalog[0], verification: undefined }];
    const result = validateCatalog(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("verification is required");
    }
  });

  it("rejects missing or non-high-confidence provenance", () => {
    const missing = [{ ...rawCatalog[0], provenance: undefined }];
    const lowConfidence = [
      {
        ...rawCatalog[0],
        provenance: { ...rawCatalog[0].provenance, confidence: "low" },
      },
    ];

    const missingResult = validateCatalog(missing);
    const lowConfidenceResult = validateCatalog(lowConfidence);
    expect(missingResult.ok).toBe(false);
    expect(lowConfidenceResult.ok).toBe(false);
    if (!missingResult.ok) {
      expect(missingResult.errors.join(" ")).toContain("provenance is required");
    }
    if (!lowConfidenceResult.ok) {
      expect(lowConfidenceResult.errors.join(" ")).toContain(
        "confidence must be high",
      );
    }
  });

  it("rejects duplicate IDs and invalid dimensions", () => {
    const invalid = [
      rawCatalog[0],
      {
        ...rawCatalog[0],
        dimensions: { ...rawCatalog[0].dimensions, widthMm: 0 },
      },
    ];
    const result = validateCatalog(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("widthMm must be a positive number");
    }
  });

  it("requires source metadata for cached HTTPS retailer images", () => {
    const invalid = [
      {
        ...rawCatalog[0],
        imagePath:
          "https://cdn.example.com/product-images/item.jpg",
        imageSourceUrl: undefined,
        imageAttribution: undefined,
      },
    ];
    const result = validateCatalog(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain(
        "imageSourceUrl and imageAttribution",
      );
    }
  });
});
