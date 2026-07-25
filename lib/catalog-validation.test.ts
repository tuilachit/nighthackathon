import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import rawCatalog from "@/public/data/catalog.json";
import { validateCatalog } from "./catalog-validation";

describe("runtime furniture catalog", () => {
  it("contains 18 fully verified products", () => {
    const result = validateCatalog(rawCatalog);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.products).toHaveLength(18);
      expect(new Set(result.products.map((product) => product.retailer))).toEqual(
        new Set(["IKEA", "Target", "Wayfair"]),
      );
      expect(result.products.every((product) => product.verification.sourceUrl.length > 0)).toBe(true);
      const models = result.products.flatMap((product) =>
        product.model === undefined ? [] : [{ product, model: product.model }],
      );
      expect(models).toHaveLength(6);
      expect(new Set(models.map(({ model }) => model.glbPath))).toHaveLength(6);
      expect(models.filter(({ model }) => model.usdzPath !== undefined)).toHaveLength(3);

      for (const { product, model } of models) {
        expect(model.nativeDimensionsMm).toEqual(product.dimensions);
        const glbPath = resolve(process.cwd(), "public", model.glbPath.slice(1));
        expect(existsSync(glbPath), `${model.glbPath} should exist`).toBe(true);
        expect(readGlbDimensionsMm(glbPath)).toEqual(product.dimensions);
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
          "https://example.supabase.co/storage/v1/object/public/product-images/item.jpg",
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

function readGlbDimensionsMm(path: string): {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number;
} {
  const file = readFileSync(path);
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString("utf8").trim()) as {
    accessors: readonly [
      {
        readonly min: readonly [number, number, number];
        readonly max: readonly [number, number, number];
      },
    ];
  };
  const bounds = json.accessors[0];
  return {
    widthMm: Math.round((bounds.max[0] - bounds.min[0]) * 1000),
    heightMm: Math.round((bounds.max[1] - bounds.min[1]) * 1000),
    depthMm: Math.round((bounds.max[2] - bounds.min[2]) * 1000),
  };
}
