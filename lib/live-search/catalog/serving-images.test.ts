import { describe, expect, it } from "vitest";
import { validateCatalogObservations } from "@/lib/live-search/validation";
import {
  prepareCatalogRowsForValidation,
  restoreCachedCatalogImages,
} from "./serving-images";

const ORIGIN = "https://example-project.supabase.co";
const HASH = "a".repeat(64);
const CACHED_URL = `${ORIGIN}/storage/v1/object/public/product-images-public/${HASH}.png`;

/** A stored catalog row exactly as a prior serve recorded it: cached display image plus provenance. */
function servedRow(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
    retailerProductId: "s59417474",
    name: "LAGKAPTEN / ADILS desk, black-brown/black, 140x60 cm",
    category: "Desk",
    productUrl: "https://www.ikea.com/au/en/p/lagkapten-adils-desk-black-brown-black-s59417474",
    imageUrl: CACHED_URL,
    sourceImageUrl: "https://www.ikea.com/au/en/images/products/lagkapten-adils-desk__0976118_pe813034_s5.jpg",
    sourceImageHash: HASH,
    priceMinor: 6900,
    currency: "AUD",
    availability: "in_stock",
    assembledDimensions: { widthMm: 600, heightMm: 730, depthMm: 1400 },
    packages: [],
    dimensionsSource: "retailer-page",
    dimensionsEvidence: "Width: 60 cm; Height: 73 cm; Depth: 140 cm",
    observedAt: new Date().toISOString(),
    confidence: "high",
    ...overrides,
  };
}

describe("catalog serving images", () => {
  it("revalidates an already-served row and restores its verified cached image", () => {
    // Regression: a serve records our cached copy as the row's display image.
    // Validating that host against the retailer image allowlist rejected every
    // previously-served row, so the catalog burned down as it was used —
    // "study desk" found one desk left out of twenty-five.
    const prepared = prepareCatalogRowsForValidation([servedRow()]);
    const validated = validateCatalogObservations(prepared.rows);
    expect(validated).toHaveLength(1);

    const restored = restoreCachedCatalogImages(validated, prepared.cachedImages, ORIGIN);
    expect(restored[0]?.imageUrl).toBe(CACHED_URL);
    // Provenance rides along so the downstream discovery-cache payload can be built.
    expect((restored[0] as unknown as Record<string, unknown>).sourceImageHash).toBe(HASH);
  });

  it("keeps the validated retailer image when the cached claim fails verification", () => {
    const row = servedRow({ imageUrl: "https://evil.example.com/storage/v1/object/public/product-images-public/" + HASH + ".png" });
    const prepared = prepareCatalogRowsForValidation([row]);
    const validated = validateCatalogObservations(prepared.rows);
    expect(validated).toHaveLength(1);

    const restored = restoreCachedCatalogImages(validated, prepared.cachedImages, ORIGIN);
    expect(restored[0]?.imageUrl).toBe(row.sourceImageUrl);
  });

  it("leaves a never-served row untouched", () => {
    const fresh = servedRow({
      retailerProductId: "80494069",
      productUrl: "https://www.ikea.com/au/en/p/ridspoe-desk-oak-80494069",
      imageUrl: "https://www.ikea.com/au/en/images/products/ridspoe-desk-oak__1188767_pe899574_s5.jpg",
      sourceImageUrl: undefined,
      sourceImageHash: undefined,
    });
    const prepared = prepareCatalogRowsForValidation([fresh]);
    expect(prepared.cachedImages.size).toBe(0);

    const validated = validateCatalogObservations(prepared.rows);
    const restored = restoreCachedCatalogImages(validated, prepared.cachedImages, ORIGIN);
    expect(restored[0]?.imageUrl).toBe(fresh.imageUrl);
  });
});
