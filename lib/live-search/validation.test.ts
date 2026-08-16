import { describe, expect, it } from "vitest";
import {
  validateBrowserSearchOutput,
  validateCreateLiveSearchRequest,
} from "./validation";

function validObservation(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    retailer: "ikea-au",
    retailerProductId: "ikea-001",
    name: "BILLY bookcase",
    category: "bookcase",
    productUrl: "https://www.ikea.com/au/en/p/billy-bookcase-ikea-001/",
    imageUrl: "https://www.ikea.com/images/billy.jpg",
    priceMinor: 12_900,
    currency: "AUD",
    availability: "in_stock",
    assembledDimensions: {
      widthMm: 700,
      heightMm: 1_600,
      depthMm: 280,
    },
    packageDimensions: null,
    dimensionsSource: "retailer-page",
    dimensionsEvidence: "Width: 70 cm; Height: 160 cm; Depth: 28 cm",
    observedAt: new Date().toISOString(),
    confidence: "high",
    ...overrides,
  };
}

function browserOutput(product: Record<string, unknown>): Record<string, unknown> {
  return { products: [product], partial: false, notes: [] };
}

describe("validateCreateLiveSearchRequest", () => {
  it("normalizes a valid request and de-duplicates retailer selection", () => {
    const result = validateCreateLiveSearchRequest({
      queryText: "  narrow oak bookcase  ",
      measurement: {
        widthMm: 900,
        heightMm: 1_800,
        depthMm: 350,
        uncertaintyMm: 25,
        accessWidthMm: null,
        source: "manual",
      },
      retailers: ["ikea-au", "kmart-au", "ikea-au"],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        queryText: "narrow oak bookcase",
        measurement: {
          widthMm: 900,
          heightMm: 1_800,
          depthMm: 350,
          uncertaintyMm: 25,
          source: "manual",
        },
        retailers: ["ikea-au", "kmart-au"],
      },
      errors: [],
    });
  });

  it("rejects malformed, implausible, and unsupported request fields", () => {
    const result = validateCreateLiveSearchRequest({
      queryText: "   ",
      measurement: {
        widthMm: 99,
        heightMm: 10_001,
        depthMm: -1,
        uncertaintyMm: 501,
        accessWidthMm: 0,
        source: "camera",
      },
      retailers: ["ikea-au", "evil-retailer"],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("queryText"),
      expect.stringContaining("measurement.widthMm"),
      expect.stringContaining("measurement.heightMm"),
      expect.stringContaining("measurement.depthMm"),
      expect.stringContaining("measurement.uncertaintyMm"),
      expect.stringContaining("measurement.accessWidthMm"),
      expect.stringContaining("measurement.source"),
      "Unsupported retailer: evil-retailer.",
    ]));
  });
});

describe("validateBrowserSearchOutput", () => {
  it("accepts a complete current observation from an approved retailer host", () => {
    const result = validateBrowserSearchOutput(JSON.stringify(browserOutput(validObservation())));

    expect(result.ok).toBe(true);
    expect(result.value?.products).toHaveLength(1);
    expect(result.value?.products[0]).toMatchObject({
      retailer: "ikea-au",
      currency: "AUD",
      confidence: "high",
      assembledDimensions: { widthMm: 700, heightMm: 1_600, depthMm: 280 },
    });
  });

  it("accepts Kmart's exact production image CDN and rejects lookalike neighbours", () => {
    const accepted = validateBrowserSearchOutput(browserOutput(validObservation({
      retailer: "kmart-au",
      retailerProductId: "43538270",
      productUrl: "https://www.kmart.com.au/product/blake-bookshelf-43538270/",
      imageUrl: "https://kmartau.mo.cloudinary.net/c1f1f681-549e-4f93-ab7a-009f27396946.jpg?tx=w_600,h_600",
    })));
    const rejected = validateBrowserSearchOutput(browserOutput(validObservation({
      retailer: "kmart-au",
      retailerProductId: "43538270",
      productUrl: "https://www.kmart.com.au/product/blake-bookshelf-43538270/",
      imageUrl: "https://kmartau.mo.cloudinary.net.evil.example/product.jpg",
    })));

    expect(accepted.ok).toBe(true);
    expect(rejected.ok).toBe(false);
    expect(rejected.errors.join(" ")).toContain("approved kmart-au image host");
  });

  it.each([
    ["a lookalike retailer domain", { productUrl: "https://ikea.com.evil.example/product" }, "approved ikea-au domain"],
    ["an insecure product URL", { productUrl: "http://www.ikea.com/au/en/p/item" }, "HTTPS URL"],
    ["credentials in a product URL", { productUrl: "https://user:pass@www.ikea.com/au/en/p/item" }, "HTTPS URL"],
    ["a non-AUD price", { currency: "USD" }, "currency must be AUD"],
    ["a non-high-confidence record", { confidence: "medium" }, "confidence must be high"],
    ["a missing assembled axis", { assembledDimensions: { widthMm: 700, heightMm: 1_600 } }, "depthMm"],
    ["a fractional assembled axis", { assembledDimensions: { widthMm: 700.5, heightMm: 1_600, depthMm: 280 } }, "widthMm"],
    ["an unsupported dimensions source", { dimensionsSource: "agent-guess" }, "dimensionsSource is invalid"],
    ["an image on an untrusted host", { imageUrl: "https://tracker.example/billy.jpg" }, "approved ikea-au image host"],
    ["a Meshy-incompatible image", { imageUrl: "https://www.ikea.com/images/billy.webp" }, "supported by Meshy"],
  ])("rejects %s", (_label, override, errorFragment) => {
    const result = validateBrowserSearchOutput(browserOutput(validObservation(override)));

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain(errorFragment);
  });

  it("rejects incomplete optional package dimensions instead of mixing dimensions", () => {
    const result = validateBrowserSearchOutput(browserOutput(validObservation({
      packageDimensions: { widthMm: 730, heightMm: 1_650 },
    })));

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("packageDimensions.depthMm");
  });

  it.each([
    ["stale", new Date(Date.now() - 24 * 60 * 60_000 - 1).toISOString()],
    ["too far in the future", new Date(Date.now() + 5 * 60_000 + 2_000).toISOString()],
    ["invalid", "not-a-date"],
  ])("rejects a %s observation timestamp", (_label, observedAt) => {
    const result = validateBrowserSearchOutput(browserOutput(validObservation({ observedAt })));

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("observedAt");
  });

  it("rejects provider output above the bounded result cap", () => {
    const product = validObservation();
    const result = validateBrowserSearchOutput({
      products: Array.from({ length: 51 }, (_, index) => ({
        ...product,
        retailerProductId: `ikea-${index}`,
      })),
      partial: true,
      notes: [],
    });

    expect(result).toEqual({
      ok: false,
      errors: ["Browser output may contain at most 50 products."],
    });
  });

  it("keeps valid rows while dropping duplicate retailer product ids", () => {
    const product = validObservation();
    const result = validateBrowserSearchOutput({
      products: [product, { ...product, productUrl: `${product.productUrl}?duplicate=1` }],
      partial: false,
      notes: [],
    });

    expect(result.ok).toBe(true);
    expect(result.value?.products).toHaveLength(1);
    expect(result.value?.partial).toBe(true);
    expect(result.value?.notes.join(" ")).toContain("duplicate product ikea-au:ikea-001");
  });

  it("keeps valid rows and explains a rejected observation", () => {
    const result = validateBrowserSearchOutput({
      products: [
        validObservation(),
        validObservation({
          retailerProductId: "ikea-invalid",
          imageUrl: "https://www.ikea.com/images/unsupported.webp",
        }),
      ],
      partial: false,
      notes: [],
    });

    expect(result.ok).toBe(true);
    expect(result.value?.products.map((product) => product.retailerProductId)).toEqual(["ikea-001"]);
    expect(result.value?.partial).toBe(true);
    expect(result.value?.notes.join(" ")).toContain("supported by Meshy");
  });

  it("accepts a 300-character coverage note and rejects 301 characters", () => {
    const accepted = validateBrowserSearchOutput({
      products: [validObservation()],
      partial: true,
      notes: ["a".repeat(300)],
    });
    const rejected = validateBrowserSearchOutput({
      products: [validObservation()],
      partial: true,
      notes: ["a".repeat(301)],
    });

    expect(accepted.ok).toBe(true);
    expect(rejected.ok).toBe(false);
    expect(rejected.errors.join(" ")).toContain("at most 300 characters");
  });

  it("caps provider coverage notes at ten", () => {
    const accepted = validateBrowserSearchOutput({
      products: [validObservation()],
      partial: true,
      notes: Array.from({ length: 10 }, (_, index) => `note ${index}`),
    });
    const rejected = validateBrowserSearchOutput({
      products: [validObservation()],
      partial: true,
      notes: Array.from({ length: 11 }, (_, index) => `note ${index}`),
    });

    expect(accepted.ok).toBe(true);
    expect(rejected.ok).toBe(false);
    expect(rejected.errors.join(" ")).toContain("at most 10 strings");
  });

  it("rejects evidence whose labelled dimensions do not match the record", () => {
    const result = validateBrowserSearchOutput(browserOutput(validObservation({
      dimensionsEvidence: "Width: 70 cm; Height: 160 cm; Depth: 38 cm",
    })));

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("explicitly match Width/Height/Depth or W/H/D");
  });

  it.each([
    [
      "a value list with a W/D/H legend",
      "Dimensions: 61cm x 15cm x 3.8cm (W x D x H)",
      { widthMm: 610, heightMm: 38, depthMm: 150 },
    ],
    [
      "axis-labelled values with one shared unit",
      "Dimensions: 1220 W x 610 D x 1830 H mm",
      { widthMm: 1_220, heightMm: 1_830, depthMm: 610 },
    ],
  ])("accepts %s", (_label, dimensionsEvidence, assembledDimensions) => {
    const result = validateBrowserSearchOutput(browserOutput(validObservation({
      dimensionsEvidence,
      assembledDimensions,
    })));

    expect(result.ok).toBe(true);
  });

  it("rejects an ambiguous L/W/H dimension legend", () => {
    const result = validateBrowserSearchOutput(browserOutput(validObservation({
      dimensionsEvidence: "Dimensions: 80cm x 30cm x 82.5cm (L x W x H)",
      assembledDimensions: { widthMm: 300, heightMm: 825, depthMm: 800 },
    })));

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("explicitly match Width/Height/Depth or W/H/D");
  });
});
