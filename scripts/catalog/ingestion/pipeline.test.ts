import { describe, expect, it } from "vitest";
import type {
  ClaudeProductExtraction,
  ProductTextExtractor,
} from "./claude-extractor";
import type { FetchedPage } from "./fetchers";
import {
  buildCandidateFromPage,
  type ProductPageSeed,
} from "./pipeline";

const seed: ProductPageSeed = {
  retailerId: "ikea",
  externalId: "12345678",
  productUrl: "https://www.ikea.com/us/en/p/example-12345678/",
};

describe("catalog extraction order", () => {
  it("uses complete JSON-LD without making a Claude call", async () => {
    let called = false;
    const extractor: ProductTextExtractor = {
      async extract(): Promise<ClaudeProductExtraction> {
        called = true;
        throw new Error("Claude should not be called.");
      },
    };
    const candidate = await buildCandidateFromPage(
      seed,
      pageWithJsonLd(`
        {
          "@type":"Product",
          "sku":"12345678",
          "name":"Oak Bookcase",
          "width":"24",
          "height":"65",
          "depth":"10",
          "image":"https://www.ikea.com/images/bookcase.jpg",
          "offers":{
            "price":"99",
            "priceCurrency":"USD",
            "url":"${seed.productUrl}"
          }
        }
      `),
      extractor,
    );

    expect(called).toBe(false);
    expect(candidate).toMatchObject({
      dimensionsSource: "json-ld",
      confidence: "high",
      dimensions: { widthMm: 610, heightMm: 1651, depthMm: 254 },
    });
  });

  it("uses high-confidence Claude output only when JSON-LD is incomplete", async () => {
    const extractor = fixedExtractor({
      name: "White Narrow Bookcase",
      priceUsd: 89,
      dimensions: { widthMm: 500, heightMm: 1500, depthMm: 280 },
      materials: ["wood"],
      colors: ["white"],
      styles: ["minimalist"],
      imageUrl: "https://www.ikea.com/images/white-bookcase.jpg",
      productUrl: seed.productUrl,
      confidence: "high",
      dimensionsEvidence: "Overall: 59 H x 19.7 W x 11 D inches",
    });

    const candidate = await buildCandidateFromPage(
      seed,
      pageWithJsonLd(`{"@type":"Product","name":"White Narrow Bookcase"}`),
      extractor,
    );

    expect(candidate).toMatchObject({
      dimensionsSource: "llm-extracted",
      confidence: "high",
      dimensions: { widthMm: 500, heightMm: 1500, depthMm: 280 },
    });
  });

  it("rejects a below-high-confidence extraction", async () => {
    const candidate = await buildCandidateFromPage(
      seed,
      pageWithJsonLd(`{"@type":"Product","name":"Ambiguous Bookcase"}`),
      fixedExtractor({
        materials: [],
        colors: [],
        styles: [],
        confidence: "medium",
        dimensionsEvidence: "Dimensions were not axis-labelled.",
      }),
    );

    expect(candidate).toBeUndefined();
  });
});

function pageWithJsonLd(json: string): FetchedPage {
  return {
    source: "firecrawl",
    finalUrl: seed.productUrl,
    markdown: "Product page text",
    rawHtml: `<script type="application/ld+json">${json}</script>`,
    links: [],
    imageUrls: [],
  };
}

function fixedExtractor(
  result: ClaudeProductExtraction,
): ProductTextExtractor {
  return {
    async extract(): Promise<ClaudeProductExtraction> {
      return result;
    },
  };
}
