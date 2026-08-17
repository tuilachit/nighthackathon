import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import type { SpaceMeasurement } from "@/lib/catalog-types";
import type { BrowserSearchOutput, LiveProductObservation } from "./types";
import { evaluateLiveProducts } from "./evaluate";

const measurement: SpaceMeasurement = {
  widthMm: 900,
  heightMm: 1_800,
  depthMm: 350,
  uncertaintyMm: 25,
  accessWidthMm: 820,
  source: "manual",
};

function observation(
  retailerProductId: string,
  assembledDimensions: LiveProductObservation["assembledDimensions"],
  overrides: Partial<LiveProductObservation> = {},
): LiveProductObservation {
  return {
    retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
    retailerProductId,
    name: `Product ${retailerProductId}`,
    category: "bookcase",
    productUrl: `https://www.ikea.com/au/en/p/${retailerProductId}/`,
    imageUrl: `https://www.ikea.com/images/${retailerProductId}.jpg`,
    priceMinor: 10_000,
    currency: "AUD",
    availability: "in_stock",
    assembledDimensions,
    packages: [],
    dimensionsSource: "retailer-page",
    dimensionsEvidence: "Explicit dimensions",
    observedAt: "2026-08-16T00:00:00.000Z",
    confidence: "high",
    ...overrides,
  };
}

describe("evaluateLiveProducts", () => {
  it("partitions passing, access-failing, and space-failing observations without mutation", () => {
    const fit = observation("fits", { widthMm: 700, heightMm: 1_600, depthMm: 280 });
    const accessIssue = observation("access", { widthMm: 800, heightMm: 1_600, depthMm: 280 });
    const nearMiss = observation("near", { widthMm: 850, heightMm: 1_600, depthMm: 280 });
    const output: BrowserSearchOutput = {
      products: [nearMiss, accessIssue, fit],
      partial: false,
      notes: [],
    };
    const originalOrder = output.products.map((product) => product.retailerProductId);

    const result = evaluateLiveProducts(output, measurement);

    expect(result.map((candidate) => candidate.fitStatus)).toEqual([
      "fits",
      "access_issue",
      "near_miss",
    ]);
    expect(result.map((candidate) => candidate.rank)).toEqual([0, 1, 2]);
    expect(result[0]?.fit.fits).toBe(true);
    expect(result[0]?.access).toMatchObject({
      status: "passed",
      passes: true,
      basis: "assembled-advisory",
    });
    expect(result[1]?.fit.fits).toBe(true);
    expect(result[1]?.access).toMatchObject({
      status: "failed",
      passes: false,
      basis: "assembled-advisory",
      deficitMm: 45,
      reason: "Fits the space, but 45 mm too wide for the 820 mm access opening.",
    });
    expect(result[2]?.fit.fits).toBe(false);
    expect(result[2]?.access).toEqual({
      status: "skipped",
      passes: true,
      basis: "unknown",
    });
    expect(output.products.map((product) => product.retailerProductId)).toEqual(originalOrder);
  });

  it("skips access evaluation entirely when the measurement has no access width", () => {
    const output: BrowserSearchOutput = {
      products: [
        observation("wide-cross-section", { widthMm: 800, heightMm: 1_600, depthMm: 280 }),
      ],
      partial: false,
      notes: [],
    };

    const result = evaluateLiveProducts(output, { ...measurement, accessWidthMm: undefined });

    expect(result[0]?.fitStatus).toBe("fits");
    expect(result[0]?.access).toEqual({
      status: "skipped",
      passes: true,
      basis: "unknown",
    });
  });

  it("uses the worst complete delivery package instead of assembled dimensions", () => {
    const output: BrowserSearchOutput = {
      products: [
        observation(
          "flat-pack",
          { widthMm: 800, heightMm: 1_600, depthMm: 280 },
          {
            packages: [
              { widthMm: 700, heightMm: 300, depthMm: 150, label: "Box 1" },
              { widthMm: 900, heightMm: 850, depthMm: 300, label: "Box 2" },
            ],
          },
        ),
      ],
      partial: false,
      notes: [],
    };

    const result = evaluateLiveProducts(output, measurement);

    expect(result[0]?.fitStatus).toBe("access_issue");
    expect(result[0]?.access).toMatchObject({
      status: "failed",
      basis: "package",
      deficitMm: 95,
      controllingPackageIndex: 1,
      controllingPackageLabel: "Box 2",
    });
  });

  it("orders each tier deterministically and produces stable snapshot hashes", () => {
    const expensive = observation(
      "b-product",
      { widthMm: 700, heightMm: 1_600, depthMm: 280 },
      { priceMinor: 15_000 },
    );
    const cheap = observation(
      "a-product",
      { widthMm: 700, heightMm: 1_600, depthMm: 280 },
      { priceMinor: 9_000 },
    );
    const output: BrowserSearchOutput = {
      products: [expensive, cheap],
      partial: false,
      notes: [],
    };

    const first = evaluateLiveProducts(output, measurement);
    const second = evaluateLiveProducts({ ...output, products: [...output.products].reverse() }, measurement);

    expect(first.map((candidate) => candidate.observation.retailerProductId)).toEqual([
      "a-product",
      "b-product",
    ]);
    expect(second.map((candidate) => candidate.observation.retailerProductId)).toEqual([
      "a-product",
      "b-product",
    ]);
    expect(second.map((candidate) => candidate.snapshotHash)).toEqual(
      first.map((candidate) => candidate.snapshotHash),
    );
  });
});
