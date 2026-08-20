import { describe, expect, it } from "vitest";
import {
  classifyCategory,
  parseSitemapUrls,
  retailerForProductUrl,
  selectCatalogCandidates,
} from "./enumerate";

describe("parseSitemapUrls", () => {
  it("extracts and entity-decodes loc URLs", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://www.ikea.com/au/en/p/billy-bookcase-white-30616558/</loc></url>
      <url><loc>https://www.kmart.com.au/product/nate-bookshelf-black-43531905?a=1&amp;b=2</loc></url>
    </urlset>`;
    expect(parseSitemapUrls(xml)).toEqual([
      "https://www.ikea.com/au/en/p/billy-bookcase-white-30616558/",
      "https://www.kmart.com.au/product/nate-bookshelf-black-43531905?a=1&b=2",
    ]);
  });

  it("returns nothing for a document without loc entries", () => {
    expect(parseSitemapUrls("<urlset></urlset>")).toEqual([]);
  });
});

describe("retailerForProductUrl", () => {
  it.each([
    ["https://www.ikea.com/au/en/p/billy-bookcase-white-30616558/", "ikea-au"],
    ["https://www.kmart.com.au/product/nate-bookshelf-black-43531905", "kmart-au"],
  ])("recognises %s as %s", (url, expected) => {
    expect(retailerForProductUrl(url)).toBe(expected);
  });

  it.each([
    "https://www.ikea.com/au/en/cat/bookcases-10382/", // category, not product
    "https://www.kmart.com.au/category/furniture/", // category, not product
    "http://www.ikea.com/au/en/p/billy-123/", // not https
    "https://www.notikea.com/au/en/p/billy-123/", // wrong domain
    "https://www.ikea.com/us/en/p/billy-123/", // wrong market path
  ])("rejects %s", (url) => {
    expect(retailerForProductUrl(url)).toBeUndefined();
  });
});

describe("classifyCategory", () => {
  it.each([
    ["https://www.ikea.com/au/en/p/billy-bookcase-white-30616558/", "bookcase"],
    ["https://www.kmart.com.au/product/nate-bookshelf-black-43531905", "bookcase"],
    ["https://www.ikea.com/au/en/p/kallax-shelving-unit-white-80275887/", "shelving"],
    ["https://www.ikea.com/au/en/p/besta-sideboard-white-s09328722/", "sideboard"],
    ["https://www.ikea.com/au/en/p/malm-chest-of-6-drawers-white-40354644/", "drawers"],
    ["https://www.ikea.com/au/en/p/hemnes-tv-bench-white-40616666/", "tv-unit"],
  ])("classifies %s as %s", (url, expected) => {
    expect(classifyCategory(url)).toBe(expected);
  });

  it("returns undefined for a non-storage product", () => {
    expect(classifyCategory("https://www.ikea.com/au/en/p/zebrasaev-pendant-lamp-white-50580068/")).toBeUndefined();
  });

  it("classifies chest-of-drawers as drawers rather than a generic match", () => {
    expect(classifyCategory("https://www.ikea.com/au/en/p/koppang-chest-of-3-drawers-white-70470306/")).toBe("drawers");
  });
});

describe("selectCatalogCandidates", () => {
  it("keeps storage products, canonicalises, and drops tracking-only duplicates", () => {
    const result = selectCatalogCandidates([
      "https://www.kmart.com.au/product/nate-bookshelf-black-43531905?srsltid=AAA",
      "https://www.kmart.com.au/product/nate-bookshelf-black-43531905?srsltid=BBB",
      "https://www.ikea.com/au/en/p/billy-bookcase-white-30616558/",
      "https://www.ikea.com/au/en/p/zebrasaev-pendant-lamp-white-50580068/", // not storage
      "https://www.ikea.com/au/en/cat/bookcases-10382/", // not a product
    ]);
    expect(result).toEqual([
      { retailer: "kmart-au", canonicalUrl: "https://www.kmart.com.au/product/nate-bookshelf-black-43531905", categoryHint: "bookcase" },
      { retailer: "ikea-au", canonicalUrl: "https://www.ikea.com/au/en/p/billy-bookcase-white-30616558", categoryHint: "bookcase" },
    ]);
  });
});
