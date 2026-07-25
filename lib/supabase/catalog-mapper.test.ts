import { describe, expect, it } from "vitest";
import { mapCatalogRows } from "./catalog-mapper";
import type { Tables } from "./database.types";

const VALID_ROW: Tables<"catalog_products"> = {
  id: "ikea-40178591",
  retailer: "IKEA",
  external_id: "40178591",
  name: "LAIVA Bookcase",
  category: "bookcase",
  variant_label: "Black-brown",
  variant_options: { color: "Black-brown" },
  price_usd: 29.99,
  currency: "USD",
  width_mm: 619,
  height_mm: 1651,
  depth_mm: 241,
  materials: ["particleboard"],
  colors: ["black", "brown"],
  styles: ["minimalist"],
  keywords: ["laiva", "bookcase"],
  image_source_url: "https://www.ikea.com/images/laiva.jpg",
  image_url:
    "https://example.supabase.co/storage/v1/object/public/product-images/ikea/laiva.jpg",
  image_attribution: "IKEA product photo",
  product_url:
    "https://www.ikea.com/us/en/p/laiva-bookcase-black-brown-40178591/",
  verification_source_url:
    "https://www.ikea.com/us/en/p/laiva-bookcase-black-brown-40178591/",
  verified_at: "2026-07-24T19:00:00.000Z",
  source_updated_at: null,
  last_seen_at: "2026-07-24T19:00:00.000Z",
  glb_path: null,
  usdz_path: null,
  native_width_mm: null,
  native_height_mm: null,
  native_depth_mm: null,
  scale_verified: null,
};

describe("Supabase catalog mapper", () => {
  it("maps verified database rows to runtime products", () => {
    expect(mapCatalogRows([VALID_ROW])).toEqual([
      expect.objectContaining({
        id: "ikea-40178591",
        retailer: "IKEA",
        imagePath: VALID_ROW.image_url,
        imageSourceUrl: VALID_ROW.image_source_url,
        imageAttribution: "IKEA product photo",
      }),
    ]);
  });

  it("fails the entire catalog when any row is unverified", () => {
    expect(() =>
      mapCatalogRows([{ ...VALID_ROW, verified_at: null }]),
    ).toThrow("Catalog validation failed");
  });

  it("fails when a cached retailer image lacks attribution", () => {
    expect(() =>
      mapCatalogRows([{ ...VALID_ROW, image_attribution: null }]),
    ).toThrow("imageSourceUrl and imageAttribution");
  });
});
