import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  CatalogProduct,
  SpaceMeasurement,
} from "@/lib/catalog-types";
import { DemoDecisionResults, type DemoDecisionResultsProps } from "./DemoDecisionResults";

const measurement: SpaceMeasurement = {
  widthMm: 900,
  heightMm: 1800,
  depthMm: 350,
  uncertaintyMm: 25,
  accessWidthMm: 820,
  source: "demo",
};
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
  productFixture("d-near-miss", "Oversized shelf", "IKEA", {
    widthMm: 1000,
    heightMm: 1000,
    depthMm: 250,
  }),
];

function defaultProps(
  overrides: Partial<DemoDecisionResultsProps> = {},
): DemoDecisionResultsProps {
  return {
    products,
    measurement,
    queryText: "bookcase",
    selectedTier: "fits",
    pageIndex: 0,
    comparedProductIds: [],
    onSelectTier: vi.fn(),
    onPageChange: vi.fn(),
    onToggleCompare: vi.fn(),
    onOpenComparison: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DemoDecisionResults", () => {
  it("isolates Fits, Doorway, and Near misses using the deterministic catalog output", () => {
    const props = defaultProps();
    const { rerender } = render(<DemoDecisionResults {...props} />);

    expect(screen.getByText("IKEA fit")).toBeInTheDocument();
    expect(screen.getByText("Target fit")).toBeInTheDocument();
    expect(screen.queryByText("Wide package shelf")).not.toBeInTheDocument();
    expect(screen.queryByText("Oversized shelf")).not.toBeInTheDocument();

    rerender(<DemoDecisionResults {...props} selectedTier="access_issue" />);
    expect(screen.getByText("Wide package shelf")).toBeInTheDocument();
    expect(screen.queryByText("IKEA fit")).not.toBeInTheDocument();
    expect(screen.queryByText("Oversized shelf")).not.toBeInTheDocument();

    rerender(<DemoDecisionResults {...props} selectedTier="near_miss" />);
    expect(screen.getByText("Oversized shelf")).toBeInTheDocument();
    expect(screen.queryByText("Wide package shelf")).not.toBeInTheDocument();
    expect(screen.queryByText("Target fit")).not.toBeInTheDocument();
  });

  it("keeps the legacy catalog currency visibly USD", () => {
    render(<DemoDecisionResults {...defaultProps()} />);

    expect(screen.getAllByText("USD listed")).toHaveLength(2);
    expect(screen.getAllByText(/^USD/)).not.toHaveLength(0);
  });

  it("emits the default cross-retailer comparison as full candidates", async () => {
    const user = userEvent.setup();
    const onOpenComparison = vi.fn();
    render(
      <DemoDecisionResults
        {...defaultProps({ onOpenComparison })}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Compare top matches" }),
    );

    expect(onOpenComparison).toHaveBeenCalledOnce();
    const pair = onOpenComparison.mock.calls[0][0];
    expect(pair).toHaveLength(2);
    expect(new Set(pair.map((candidate: { retailer: { key: string } }) => candidate.retailer.key)).size).toBe(2);
    expect(pair.map((candidate: { price: { currency: string } }) => candidate.price.currency)).toEqual([
      "USD",
      "USD",
    ]);
  });

  it("does not start a live session or make provider/network calls", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    const onSelectTier = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <DemoDecisionResults
        {...defaultProps({ onSelectTier })}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /Doorway/ }));
    await user.click(
      screen.getByRole("button", { name: "Compare top matches" }),
    );

    expect(onSelectTier).toHaveBeenCalledWith("access_issue");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function productFixture(
  id: string,
  name: string,
  retailer: CatalogProduct["retailer"],
  dimensions: CatalogProduct["dimensions"],
): CatalogProduct {
  const retailerDetails = retailer === "IKEA"
    ? { host: "www.ikea.com", path: "us/en/p" }
    : retailer === "Target"
      ? { host: "www.target.com", path: "p" }
      : { host: "www.wayfair.com", path: "furniture/pdp" };
  const productUrl = `https://${retailerDetails.host}/${retailerDetails.path}/${id}`;
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
    verification: {
      sourceUrl: productUrl,
      verifiedAt: "2026-07-25T00:00:00.000Z",
    },
    provenance: {
      dimensionsSource: "json-ld",
      sourceUrl: productUrl,
      extractedAt: "2026-07-25T00:00:00.000Z",
      confidence: "high",
    },
  };
}
