import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogProduct } from "@/lib/catalog-types";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  loadCatalog: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/catalog-source", () => ({
  loadFurnitureCatalog: mocks.loadCatalog,
}));

import FitDemoPage from "./page";
import DemoComparisonPage from "./compare/page";
import DemoResultsPage from "./results/page";

const products: readonly CatalogProduct[] = [
  productFixture("ikea-one", "IKEA shelf", "IKEA", 500),
  productFixture("target-two", "Target shelf", "Target", 550),
];

describe("dedicated demo routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCatalog.mockResolvedValue({
      products,
      source: "bundled",
      retailerCount: 2,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("canonicalizes the short demo path", () => {
    expect(() => FitDemoPage()).toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/fit/demo/results?tier=fits");
  });

  it("loads only the bundled catalog for tier results", async () => {
    const element = await DemoResultsPage({
      searchParams: Promise.resolve({
        tier: "near_miss",
        q: "white shelf",
      }),
    });

    expect(mocks.loadCatalog).toHaveBeenCalledOnce();
    expect(element.props.products).toBe(products);
    expect(element.props.state).toMatchObject({
      selectedTier: "near_miss",
      queryText: "white shelf",
      measurement: { source: "demo" },
    });
  });

  it("resolves an exact two-product comparison without workflow or provider state", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const element = await DemoComparisonPage({
      searchParams: Promise.resolve({
        tier: "fits",
        q: "bookcase",
        compare: "ikea-one,target-two",
      }),
    });

    expect(element.props.candidates.map((candidate: { key: string }) => candidate.key)).toEqual([
      "ikea-one",
      "target-two",
    ]);
    expect(element.props.candidates.every(
      (candidate: { price: { currency: string } }) => candidate.price.currency === "USD",
    )).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("redirects malformed comparisons back to readable results", async () => {
    await expect(DemoComparisonPage({
      searchParams: Promise.resolve({ tier: "fits", compare: "ikea-one" }),
    })).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringMatching(/^\/fit\/demo\/results\?tier=fits/),
    );
  });
});

function productFixture(
  id: string,
  name: string,
  retailer: CatalogProduct["retailer"],
  widthMm: number,
): CatalogProduct {
  const host = retailer === "IKEA" ? "www.ikea.com" : "www.target.com";
  const productUrl = `https://${host}/products/${id}`;
  return {
    id,
    retailer,
    name,
    category: "bookcase",
    priceUsd: 100,
    dimensions: { widthMm, heightMm: 1000, depthMm: 250 },
    materials: ["wood"],
    colors: ["white"],
    styles: ["minimalist"],
    keywords: ["bookcase"],
    imagePath: "/products/test.svg",
    productUrl,
    verification: { sourceUrl: productUrl, verifiedAt: "2026-07-25T00:00:00.000Z" },
    provenance: {
      dimensionsSource: "json-ld",
      sourceUrl: productUrl,
      extractedAt: "2026-07-25T00:00:00.000Z",
      confidence: "high",
    },
  };
}
