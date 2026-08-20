import { describe, expect, it } from "vitest";
import type { LiveProductObservation, LiveSearchIntent } from "@/lib/live-search/types";
import {
  catalogSearchOutput,
  parsePriceCapMinor,
  queryKeywords,
  rankCatalogMatches,
  scoreObservation,
} from "./relevance";

function observation(overrides: Partial<LiveProductObservation> = {}): LiveProductObservation {
  return {
    retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
    retailerProductId: "1",
    name: "BILLY Bookcase, black-brown",
    category: "Bookcase",
    productUrl: "https://www.ikea.com/au/en/p/billy-1",
    imageUrl: "https://www.ikea.com/images/billy.jpg",
    priceMinor: 5900,
    currency: "AUD",
    availability: "in_stock",
    assembledDimensions: { widthMm: 400, heightMm: 1060, depthMm: 280 },
    packages: [],
    dimensionsSource: "retailer-page",
    dimensionsEvidence: "Width 40 cm, Height 106 cm, Depth 28 cm",
    observedAt: "2026-08-19T12:00:00.000Z",
    confidence: "high",
    ...overrides,
  } as LiveProductObservation;
}

const PROMPT = (text: string): LiveSearchIntent => ({ kind: "prompt", text, retailers: ["ikea-au", "kmart-au"] });

describe("parsePriceCapMinor", () => {
  it.each([
    ["black bookshelf under $250", 25000],
    ["shelf below 120", 12000],
    ["something for $99.95", 9995],
    ["max $1,000", 100000],
  ])("parses %s", (text, expected) => {
    expect(parsePriceCapMinor(text)).toBe(expected);
  });

  it("returns undefined when no price is present", () => {
    expect(parsePriceCapMinor("oak bookshelf")).toBeUndefined();
  });
});

describe("queryKeywords", () => {
  it("drops stopwords and the price phrase", () => {
    expect(queryKeywords("a black bookshelf under $250")).toEqual(["black", "bookshelf"]);
  });
});

describe("scoreObservation", () => {
  it("matches a bookshelf query to a product named bookcase via synonyms", () => {
    expect(scoreObservation(observation(), ["bookshelf"])).toBeGreaterThan(0);
  });

  it("rewards a colour match on top of the category", () => {
    const withColour = scoreObservation(observation(), ["black", "bookshelf"]);
    const categoryOnly = scoreObservation(observation(), ["bookshelf"]);
    expect(withColour).toBeGreaterThan(categoryOnly);
  });

  it("does not return a bookcase for a desk query that shares only its colour", () => {
    // Reported from the preview: "black desk" returned SKRUVBY and LAIVA
    // bookcases because "desk" was not a known kind, so "black" alone qualified.
    expect(scoreObservation(observation({ name: "SKRUVBY Bookcase, black-blue", category: "Furniture" }), ["black", "desk"])).toBe(0);
    expect(scoreObservation(observation({ name: "LAIVA Bookcase, black-brown", category: "Bookcase" }), ["black", "desk"])).toBe(0);
  });

  it.each([
    ["wardrobe"], ["nightstand"], ["sofa"], ["dining table"], ["mirror"],
  ])("returns nothing from a bookcase catalog for a %s query", (kind) => {
    const keywords = queryKeywords(`black ${kind}`);
    expect(scoreObservation(observation({ name: "BILLY Bookcase, black-brown", category: "Bookcase" }), keywords)).toBe(0);
  });

  it("requires every word to match when the query names no known kind", () => {
    // "black lacquered" is not a kind we know; a product matching only "black"
    // must not qualify, or the catalog answers unknown queries with colour.
    expect(scoreObservation(observation({ name: "BILLY Bookcase, black-brown", category: "Bookcase" }), ["black", "lacquered"])).toBe(0);
    expect(scoreObservation(observation({ name: "BILLY Bookcase, black-brown", category: "Bookcase" }), ["black", "brown"])).toBeGreaterThan(0);
  });

  it("matches whole words so bed does not match bedroom", () => {
    expect(scoreObservation(observation({ name: "Storage cabinet bedroom black", category: "Furniture" }), ["bed"])).toBe(0);
  });

  it("rejects a product of the wrong kind even when a colour matches", () => {
    const sideboard = observation({ name: "Black sideboard", category: "Sideboard" });
    expect(scoreObservation(sideboard, ["black", "bookshelf"])).toBe(0);
  });
});

describe("rankCatalogMatches", () => {
  const products = [
    observation({ retailerProductId: "1", name: "BILLY Bookcase, black-brown", priceMinor: 5900 }),
    observation({ retailerProductId: "2", name: "BILLY Bookcase, white", priceMinor: 5900 }),
    observation({ retailerProductId: "3", name: "KALLAX Shelving unit, black", priceMinor: 12900 }),
    observation({ retailerProductId: "4", name: "MALM Bed frame, black", category: "Bed" }),
    observation({ retailerProductId: "5", name: "BESTA Sideboard", category: "Sideboard", priceMinor: 30000 }),
  ];

  it("keeps only relevant products under the price cap and ranks colour matches first", () => {
    const matches = rankCatalogMatches(products, PROMPT("black bookshelf under $250"));
    const names = matches.map((m) => m.observation.name);
    // MALM (bed) and BESTA (sideboard, over cap) excluded; black items rank above white.
    expect(names).toEqual([
      "BILLY Bookcase, black-brown",
      "KALLAX Shelving unit, black",
      "BILLY Bookcase, white",
    ]);
  });

  it("excludes products over the price cap", () => {
    const matches = rankCatalogMatches(products, PROMPT("bookshelf under $100"));
    expect(matches.every((m) => m.observation.priceMinor <= 10000)).toBe(true);
  });

  it("respects retailer scope", () => {
    const kmartOnly: LiveSearchIntent = { kind: "prompt", text: "black bookshelf", retailers: ["kmart-au"] };
    expect(rankCatalogMatches(products, kmartOnly)).toEqual([]);
  });

  it("returns nothing for an exact product-link intent", () => {
    const link: LiveSearchIntent = { kind: "product-link", url: "https://www.ikea.com/au/en/p/billy-1" } as LiveSearchIntent;
    expect(rankCatalogMatches(products, link)).toEqual([]);
  });

  it("never serves mounting hardware even when its name matches the query kind", () => {
    // Stored from a real page: a $5 wardrobe *connector* whose name contains
    // "wardrobe". Size is the only signal that it is not furniture.
    const connector = observation({
      retailerProductId: "6",
      name: "SKÅDIS connector for wardrobe, white",
      category: "Wardrobe",
      priceMinor: 500,
      assembledDimensions: { widthMm: 55, heightMm: 45, depthMm: 22 },
    });
    const wardrobe = observation({
      retailerProductId: "7",
      name: "PAX Wardrobe, white",
      category: "Wardrobe",
      priceMinor: 29900,
      assembledDimensions: { widthMm: 1000, heightMm: 2011, depthMm: 580 },
    });
    const names = rankCatalogMatches([connector, wardrobe], PROMPT("white wardrobe"))
      .map((m) => m.observation.name);
    expect(names).toEqual(["PAX Wardrobe, white"]);
  });

  it("keeps genuinely low furniture like a wide TV bench", () => {
    const bench = observation({
      retailerProductId: "8",
      name: "BESTÅ TV bench, white",
      category: "TV unit",
      assembledDimensions: { widthMm: 1200, heightMm: 380, depthMm: 400 },
    });
    expect(rankCatalogMatches([bench], PROMPT("tv bench"))).toHaveLength(1);
  });
});

describe("catalogSearchOutput", () => {
  it("caps the product count and marks the output complete", () => {
    const matches = rankCatalogMatches(
      Array.from({ length: 10 }, (_, i) => observation({ retailerProductId: String(i), name: `BILLY Bookcase ${i}` })),
      PROMPT("bookshelf"),
    );
    const output = catalogSearchOutput(matches, 6);
    expect(output.products).toHaveLength(6);
    expect(output.partial).toBe(false);
  });
});
