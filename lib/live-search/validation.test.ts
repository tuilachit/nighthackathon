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
  it("normalizes a prompt intent and de-duplicates the bounded retailer selection", () => {
    const result = validateCreateLiveSearchRequest({
      intent: {
        kind: "prompt",
        text: "  narrow oak bookcase  ",
        retailers: ["ikea-au", "kmart-au", "ikea-au"],
      },
      measurement: {
        widthMm: 900,
        heightMm: 1_800,
        depthMm: 350,
        uncertaintyMm: 25,
        accessWidthMm: null,
        source: "manual",
      },
      cachePolicy: "prefer-recent",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        intent: {
          kind: "prompt",
          text: "narrow oak bookcase",
          retailers: ["ikea-au", "kmart-au"],
        },
        measurement: {
          widthMm: 900,
          heightMm: 1_800,
          depthMm: 350,
          uncertaintyMm: 25,
          source: "manual",
        },
        cachePolicy: "prefer-recent",
      },
      errors: [],
    });
  });

  it("accepts a syntactically valid HTTPS product-link intent without retailer allowlisting", () => {
    const result = validateCreateLiveSearchRequest({
      intent: {
        kind: "product-link",
        url: "https://furniture.example/products/oak-shelf#dimensions",
      },
      measurement: {
        widthMm: 900,
        heightMm: 1_800,
        depthMm: 350,
        uncertaintyMm: 25,
        source: "manual",
      },
      cachePolicy: "force-refresh",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        intent: {
          kind: "product-link",
          url: "https://furniture.example/products/oak-shelf",
        },
        measurement: {
          widthMm: 900,
          heightMm: 1_800,
          depthMm: 350,
          uncertaintyMm: 25,
          source: "manual",
        },
        cachePolicy: "force-refresh",
      },
      errors: [],
    });
  });

  it.each([
    "not a URL",
    "http://furniture.example/products/oak-shelf",
    "https://user:secret@furniture.example/products/oak-shelf",
  ])("rejects malformed or unsafe product-link syntax: %s", (url) => {
    const result = validateCreateLiveSearchRequest({
      intent: { kind: "product-link", url },
      measurement: {
        widthMm: 900,
        heightMm: 1_800,
        depthMm: 350,
        uncertaintyMm: 25,
        source: "manual",
      },
      cachePolicy: "prefer-recent",
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("intent.url");
  });

  it("rejects malformed, implausible, and unsupported request fields", () => {
    const result = validateCreateLiveSearchRequest({
      intent: {
        kind: "prompt",
        text: "   ",
        retailers: ["ikea-au", "evil-retailer"],
      },
      measurement: {
        widthMm: 99,
        heightMm: 10_001,
        depthMm: -1,
        uncertaintyMm: 501,
        accessWidthMm: 0,
        source: "camera",
      },
      cachePolicy: "stale-forever",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("intent.text"),
      expect.stringContaining("measurement.widthMm"),
      expect.stringContaining("measurement.heightMm"),
      expect.stringContaining("measurement.depthMm"),
      expect.stringContaining("measurement.uncertaintyMm"),
      expect.stringContaining("measurement.accessWidthMm"),
      expect.stringContaining("measurement.source"),
      "Unsupported retailer: evil-retailer.",
      expect.stringContaining("cachePolicy"),
    ]));
  });
});

describe("validateBrowserSearchOutput", () => {
  it("accepts a complete current observation from an approved retailer host", () => {
    const result = validateBrowserSearchOutput(JSON.stringify(browserOutput(validObservation({
      retailer: {
        key: "ikea-au",
        label: "IKEA Australia",
        host: "ikea.com",
      },
    }))));

    expect(result.ok).toBe(true);
    expect(result.value?.products).toHaveLength(1);
    expect(result.value?.products[0]).toMatchObject({
      retailer: {
        key: "ikea-au",
        label: "IKEA Australia",
        host: "ikea.com",
      },
      currency: "AUD",
      confidence: "high",
      assembledDimensions: { widthMm: 700, heightMm: 1_600, depthMm: 280 },
      packages: [],
    });
  });

  it.each([
    ["www.ikea.com", "IKEA Australia"],
    ["ikea.com", "IKEA"],
    ["au.ikea.com", "IKEA AU"],
  ])("normalizes an imprecise registered identity (host %s, label %s)", (host, label) => {
    // Production dropped whole batches with "products[0].retailer does not match
    // the registered ikea-au identity" because the provider was asked to reproduce
    // the canonical strings exactly. The server owns that identity; productUrl and
    // imageUrl remain the real host boundary.
    const result = validateBrowserSearchOutput(browserOutput(validObservation({
      retailer: { key: "ikea-au", label, host },
    })));

    expect(result.ok).toBe(true);
    expect(result.value?.products[0]?.retailer).toEqual({
      key: "ikea-au",
      label: "IKEA Australia",
      host: "ikea.com",
    });
  });

  it("still rejects a product URL off the registered retailer domain", () => {
    const result = validateBrowserSearchOutput(browserOutput(validObservation({
      retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
      productUrl: "https://www.not-ikea.example/au/en/p/billy-ikea-001/",
    })));

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("not on the declared ikea-au domain");
  });

  it("accepts a generalized retailer identity for product-link observations", () => {
    const result = validateBrowserSearchOutput(browserOutput(validObservation({
      retailer: {
        key: "example-furniture-au",
        label: "Example Furniture",
        host: "furniture.example",
      },
      retailerProductId: "example-001",
      productUrl: "https://www.furniture.example/products/example-001",
      imageUrl: "https://images.example-cdn.test/example-001.png",
    })));

    expect(result.ok).toBe(true);
    expect(result.value?.products[0]?.retailer).toEqual({
      key: "example-furniture-au",
      label: "Example Furniture",
      host: "furniture.example",
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
    "https://www.ikea.com/images/billy.webp",
    "https://www.ikea.com/images/render?id=billy-001",
  ])("accepts a safe retailer image URL before server-side byte validation: %s", (imageUrl) => {
    const result = validateBrowserSearchOutput(browserOutput(validObservation({ imageUrl })));
    expect(result.ok).toBe(true);
  });

  it.each([
    ["a lookalike retailer domain", { productUrl: "https://ikea.com.evil.example/product" }, "declared ikea-au domain"],
    ["an insecure product URL", { productUrl: "http://www.ikea.com/au/en/p/item" }, "HTTPS URL"],
    ["credentials in a product URL", { productUrl: "https://user:pass@www.ikea.com/au/en/p/item" }, "HTTPS URL"],
    ["a lowercase currency", { currency: "aud" }, "uppercase ISO-4217"],
    ["an unknown currency", { currency: "XYZ" }, "uppercase ISO-4217"],
    ["a non-high-confidence record", { confidence: "medium" }, "confidence must be high"],
    ["a missing assembled axis", { assembledDimensions: { widthMm: 700, heightMm: 1_600 } }, "depthMm"],
    ["a fractional assembled axis", { assembledDimensions: { widthMm: 700.5, heightMm: 1_600, depthMm: 280 } }, "widthMm"],
    ["an unsupported dimensions source", { dimensionsSource: "agent-guess" }, "dimensionsSource is invalid"],
    ["an image on an untrusted host", { imageUrl: "https://tracker.example/billy.jpg" }, "approved ikea-au image host"],
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

  it("normalizes a legacy complete package and accepts complete package arrays", () => {
    const legacy = validateBrowserSearchOutput(browserOutput(validObservation({
      packageDimensions: { widthMm: 730, heightMm: 1_650, depthMm: 120 },
    })));
    const array = validateBrowserSearchOutput(browserOutput(validObservation({
      packageDimensions: null,
      packages: [
        { widthMm: 730, heightMm: 1_650, depthMm: 120, label: "Box 1 of 2" },
        { widthMm: 500, heightMm: 300, depthMm: 200, label: "Box 2 of 2" },
      ],
    })));

    expect(legacy.ok).toBe(true);
    expect(legacy.value?.products[0]?.packages).toEqual([
      { widthMm: 730, heightMm: 1_650, depthMm: 120 },
    ]);
    expect(array.ok).toBe(true);
    expect(array.value?.products[0]?.packages).toHaveLength(2);
  });

  it("rejects an incomplete member of a package array", () => {
    const result = validateBrowserSearchOutput(browserOutput(validObservation({
      packageDimensions: null,
      packages: [{ widthMm: 730, heightMm: 1_650, label: "Incomplete" }],
    })));

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("packages[0].depthMm");
  });

  it("accepts other real uppercase ISO-4217 currencies", () => {
    const result = validateBrowserSearchOutput(browserOutput(validObservation({ currency: "NZD" })));

    expect(result.ok).toBe(true);
    expect(result.value?.products[0]?.currency).toBe("NZD");
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
          imageUrl: "https://tracker.example/unsupported.webp",
        }),
      ],
      partial: false,
      notes: [],
    });

    expect(result.ok).toBe(true);
    expect(result.value?.products.map((product) => product.retailerProductId)).toEqual(["ikea-001"]);
    expect(result.value?.partial).toBe(true);
    expect(result.value?.notes.join(" ")).toContain("approved ikea-au image host");
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
