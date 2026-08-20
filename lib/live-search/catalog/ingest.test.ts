import { describe, expect, it } from "vitest";
import type { FirecrawlProductExtraction } from "@/lib/live-search/providers/firecrawl";
import { validateBrowserSearchOutput } from "@/lib/live-search/validation";
import {
  buildCatalogObservation,
  deriveRetailerProductId,
  markdownContainsEvidence,
} from "./ingest";

const OBSERVED_AT = "2026-08-19T12:00:00.000Z";

function extraction(overrides: Partial<FirecrawlProductExtraction> = {}): FirecrawlProductExtraction {
  return {
    url: "https://www.ikea.com/au/en/p/billy-bookcase-white-30616558",
    name: "BILLY Bookcase, white",
    retailerProductId: "30616558",
    category: "Bookcase",
    imageUrl: "https://www.ikea.com/images/billy.jpg",
    imageCandidates: ["https://www.ikea.com/images/billy.jpg"],
    priceMinor: 5900,
    currency: "AUD",
    availability: "in_stock",
    dimensions: { widthMm: 400, heightMm: 1060, depthMm: 280 },
    dimensionsEvidence: "Width 40 cm, Depth 28 cm, Height 106 cm",
    markdown: "BILLY Bookcase, white. Measurements: Width 40 cm, Depth 28 cm, Height 106 cm. $59.00",
    ...overrides,
  };
}

const MARKDOWN = "BILLY Bookcase, white. Measurements: Width 40 cm, Depth 28 cm, Height 106 cm. $59.00";

describe("markdownContainsEvidence", () => {
  it("accepts evidence present on the page regardless of spacing and case", () => {
    expect(markdownContainsEvidence("Width 40 cm,  Depth  28 cm", "width 40 cm, depth 28 cm")).toBe(true);
  });

  it("rejects evidence the page never contained", () => {
    expect(markdownContainsEvidence("Width 40 cm", "Width 90 cm, Depth 30 cm, Height 200 cm")).toBe(false);
  });

  it("matches evidence against the page's JSON-styled dimension fields", () => {
    // The zero-credit IKEA path captures dimensions as raw page bytes like
    // "width":"40 cm"; the labelled evidence sentence must match them.
    const pageBytes = '"width":"40 cm"\n"height":"106 cm"\n"depth":"28 cm"';
    expect(markdownContainsEvidence(pageBytes, "Width: 40 cm; Height: 106 cm; Depth: 28 cm")).toBe(true);
    expect(markdownContainsEvidence(pageBytes, "Width: 90 cm; Height: 106 cm; Depth: 28 cm")).toBe(false);
  });

  it("rejects empty evidence", () => {
    expect(markdownContainsEvidence("anything", "   ")).toBe(false);
  });
});

describe("deriveRetailerProductId", () => {
  it("reads the IKEA article number", () => {
    expect(deriveRetailerProductId("ikea-au", "https://www.ikea.com/au/en/p/billy-bookcase-white-30616558")).toBe("30616558");
  });

  it("reads the Kmart product id", () => {
    expect(deriveRetailerProductId("kmart-au", "https://www.kmart.com.au/product/nate-bookshelf-black-43531905")).toBe("43531905");
  });
});

describe("buildCatalogObservation", () => {
  it("produces an observation that passes the shared validator", () => {
    const result = buildCatalogObservation({
      retailer: "ikea-au",
      categoryHint: "bookcase",
      extraction: extraction(),
      markdown: MARKDOWN,
      observedAt: OBSERVED_AT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const validated = validateBrowserSearchOutput({ products: [result.observation], partial: false, notes: [] });
    expect(validated.ok).toBe(true);
    expect(validated.value?.products[0]?.retailer.key).toBe("ikea-au");
    expect(validated.value?.products[0]?.priceMinor).toBe(5900);
  });

  it("derives category and retailerProductId when the extraction omits them", () => {
    const result = buildCatalogObservation({
      retailer: "kmart-au",
      categoryHint: "bookcase",
      extraction: extraction({
        url: "https://www.kmart.com.au/product/nate-bookshelf-black-43531905",
        retailerProductId: undefined,
        category: undefined,
        imageUrl: "https://kmartau.mo.cloudinary.net/nate.jpg",
        imageCandidates: ["https://kmartau.mo.cloudinary.net/nate.jpg"],
      }),
      markdown: MARKDOWN,
      observedAt: OBSERVED_AT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.observation.retailerProductId).toBe("43531905");
    expect(result.observation.category).toBe("Bookcase");
  });

  it("rejects a row whose evidence is not on the page", () => {
    const result = buildCatalogObservation({
      retailer: "ikea-au",
      categoryHint: "bookcase",
      extraction: extraction({ dimensionsEvidence: "Width 90 cm, Depth 30 cm, Height 200 cm" }),
      markdown: MARKDOWN,
      observedAt: OBSERVED_AT,
    });
    expect(result).toEqual({ ok: false, reason: "evidence_not_on_page" });
  });

  it.each([
    ["no_dimensions", { dimensions: undefined }],
    ["no_dimensions_evidence", { dimensionsEvidence: undefined }],
    ["no_image", { imageUrl: undefined, imageCandidates: undefined }],
    ["no_price", { priceMinor: undefined }],
    ["no_currency", { currency: undefined }],
  ])("rejects with reason %s", (reason, patch) => {
    const result = buildCatalogObservation({
      retailer: "ikea-au",
      categoryHint: "bookcase",
      extraction: extraction(patch as Partial<FirecrawlProductExtraction>),
      markdown: MARKDOWN,
      observedAt: OBSERVED_AT,
    });
    expect(result).toEqual({ ok: false, reason });
  });
});
