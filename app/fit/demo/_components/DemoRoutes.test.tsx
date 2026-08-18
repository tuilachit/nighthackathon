import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CatalogProduct } from "@/lib/catalog-types";
import { DEMO_SPACE_MEASUREMENT } from "@/lib/fit-config";
import { candidateFixture } from "@/components/fit/journey/test-support";
import { DemoComparisonRoute } from "./DemoComparisonRoute";
import { DemoResultsRoute } from "./DemoResultsRoute";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const products: readonly CatalogProduct[] = [
  productFixture("a-ikea-fit", "IKEA fit", "IKEA", {
    widthMm: 500,
    heightMm: 1000,
    depthMm: 250,
  }),
  productFixture("b-target-fit", "Target fit", "Target", {
    widthMm: 550,
    heightMm: 1000,
    depthMm: 250,
  }),
  productFixture("c-doorway", "Wide package shelf", "Wayfair", {
    widthMm: 800,
    heightMm: 1000,
    depthMm: 250,
  }),
  productFixture("d-near", "Oversized shelf", "IKEA", {
    widthMm: 1000,
    heightMm: 1000,
    depthMm: 250,
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("demo route client adapters", () => {
  it("keeps tier and comparison navigation URL-owned without live calls", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    const sessionReadSpy = vi.spyOn(Storage.prototype, "getItem");
    const sessionWriteSpy = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <DemoResultsRoute
        products={products}
        state={{
          selectedTier: "fits",
          pageIndex: 0,
          queryText: "bookcase",
          comparedProductIds: [],
          measurement: DEMO_SPACE_MEASUREMENT,
        }}
      />,
    );

    expect(screen.getByText("IKEA fit")).toBeInTheDocument();
    expect(screen.getAllByText("USD listed")).toHaveLength(2);
    await user.click(screen.getByRole("tab", { name: /Doorway/ }));
    expect(router.replace).toHaveBeenCalledWith(
      "/fit/demo/results?tier=access_issue&q=bookcase",
      { scroll: false },
    );

    await user.click(screen.getByRole("button", { name: /Compare (top matches|two)/ }));
    expect(router.push).toHaveBeenCalledWith(
      "/fit/demo/compare?tier=fits&q=bookcase&compare=a-ikea-fit%2Cb-target-fit",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sessionReadSpy).not.toHaveBeenCalled();
    expect(sessionWriteSpy).not.toHaveBeenCalled();
  });

  it("keeps the dedicated comparison route provider-free", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const first = {
      ...candidateFixture({ key: "a-ikea-fit", name: "IKEA fit" }),
      price: { minor: 10000, currency: "USD" },
    };
    const second = {
      ...candidateFixture({
        key: "b-target-fit",
        name: "Target fit",
        retailer: "kmart",
      }),
      retailer: { key: "target", label: "Target", host: "target.com" },
      price: { minor: 10000, currency: "USD" },
    };

    render(
      <DemoComparisonRoute
        measurement={DEMO_SPACE_MEASUREMENT}
        candidates={[first, second]}
        resultsHref="/fit/demo/results?tier=fits&q=bookcase"
      />,
    );

    expect(screen.getByRole("heading", { name: "Clearance comparison" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to demo results" }));
    expect(router.push).toHaveBeenCalledWith(
      "/fit/demo/results?tier=fits&q=bookcase",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function productFixture(
  id: string,
  name: string,
  retailer: CatalogProduct["retailer"],
  dimensions: CatalogProduct["dimensions"],
): CatalogProduct {
  const host = retailer === "IKEA"
    ? "www.ikea.com"
    : retailer === "Target"
      ? "www.target.com"
      : "www.wayfair.com";
  const productUrl = `https://${host}/products/${id}`;
  return {
    id,
    retailer,
    name,
    category: "bookcase",
    priceUsd: 100,
    dimensions,
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
