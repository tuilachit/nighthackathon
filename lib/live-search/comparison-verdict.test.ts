import { describe, expect, it } from "vitest";
import type { DecisionCandidate } from "@/lib/live-search/types";
import { buildComparisonVerdict, shortName } from "./comparison-verdict";

function candidate(overrides: Partial<{
  key: string;
  name: string;
  priceMinor: number;
  fitStatus: DecisionCandidate["fitStatus"];
  minimumClearanceMm: number;
  reasons: readonly string[];
  widthMm: number;
  heightMm: number;
  depthMm: number;
}> = {}): DecisionCandidate {
  const {
    key = "a",
    name = "SKRUVBY Bookcase, black-blue, 60x140 cm",
    priceMinor = 12900,
    fitStatus = "fits",
    minimumClearanceMm = 34,
    reasons = [],
    widthMm = 600,
    heightMm = 1400,
    depthMm = 375,
  } = overrides;
  return {
    key,
    workflowId: "00000000-0000-4000-8000-000000000001",
    candidateId: key,
    retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
    name,
    price: { minor: priceMinor, currency: "AUD" },
    availability: "in_stock",
    assembledDimensions: { widthMm, heightMm, depthMm },
    packages: [],
    fitStatus,
    fit: {
      fits: fitStatus === "fits",
      orientation: "default",
      widthClearanceMm: minimumClearanceMm,
      heightClearanceMm: minimumClearanceMm,
      depthClearanceMm: minimumClearanceMm,
      minimumClearanceMm,
      confidence: "high",
      reasons,
    },
    access: { status: "skipped", passes: true, basis: "unknown" },
    provenance: {
      source: "retailer-page",
      evidence: "Width: 60 cm; Height: 140 cm; Depth: 37.5 cm",
      observedAt: "2026-08-20T00:00:00.000Z",
      freshness: "cached",
    },
    productUrl: "https://www.ikea.com/au/en/p/skruvby-1",
  } as DecisionCandidate;
}

describe("buildComparisonVerdict", () => {
  it("names the trade-off when one is safer and the other cheaper", () => {
    const safer = candidate({ key: "safer", name: "SKRUVBY Bookcase, black-blue", minimumClearanceMm: 55, priceMinor: 24900 });
    const cheaper = candidate({ key: "cheaper", name: "LAIVA Bookcase, black-brown", minimumClearanceMm: 21, priceMinor: 3599 });
    const verdict = buildComparisonVerdict(safer, cheaper);

    expect(verdict.factors.find((f) => f.kind === "clearance")?.leaderKey).toBe("safer");
    expect(verdict.factors.find((f) => f.kind === "price")?.leaderKey).toBe("cheaper");
    expect(verdict.summary).toBe(
      "Choose SKRUVBY Bookcase for the safer fit (34 mm more clearance); choose LAIVA Bookcase to save $213.01 AUD.",
    );
  });

  it("declares an outright leader when one wins fit margin and price", () => {
    const winner = candidate({ key: "w", name: "BILLY Bookcase, white", minimumClearanceMm: 80, priceMinor: 5900 });
    const loser = candidate({ key: "l", name: "HEMNES Bookcase, red", minimumClearanceMm: 20, priceMinor: 39900 });
    expect(buildComparisonVerdict(winner, loser).summary).toBe("BILLY Bookcase leads on both fit margin and price.");
  });

  it("is decisive when only one candidate fits", () => {
    const fits = candidate({ key: "f", name: "BILLY Bookcase, white" });
    const near = candidate({
      key: "n",
      name: "PAX Wardrobe, white",
      fitStatus: "near_miss",
      reasons: ["65 mm too tall after safety allowance."],
    });
    const verdict = buildComparisonVerdict(fits, near);
    expect(verdict.summary).toBe("BILLY Bookcase is the only one of the two that fits the measured space.");
    expect(verdict.factors).toHaveLength(1);
    expect(verdict.factors[0]?.statement).toContain("65 mm too tall");
  });

  it("never invents a difference between identical candidates", () => {
    const verdict = buildComparisonVerdict(candidate({ key: "a" }), candidate({ key: "b" }));
    expect(verdict.factors.filter((f) => f.kind !== "height")).toHaveLength(0);
    expect(verdict.summary).toBe("These two are equivalent on fit and price; decide on looks and storage layout.");
  });

  it("states floor-space and height differences with exact millimetres", () => {
    const slim = candidate({ key: "s", name: "Slim, x", widthMm: 400, depthMm: 280, heightMm: 2020 });
    const wide = candidate({ key: "w", name: "Wide, y", widthMm: 800, depthMm: 400, heightMm: 1060 });
    const verdict = buildComparisonVerdict(slim, wide);
    expect(verdict.factors.find((f) => f.kind === "footprint")?.statement).toBe(
      "Slim occupies less floor space (400 × 280 mm vs 800 × 400 mm).",
    );
    expect(verdict.factors.find((f) => f.kind === "height")?.statement).toBe("Slim stands 960 mm taller.");
  });
});

describe("shortName", () => {
  it("takes the head of the name and falls back to the full name", () => {
    expect(shortName(candidate({ name: "BILLY / OXBERG bookcase, white, 80x30 cm" }))).toBe("BILLY / OXBERG bookcase");
    expect(shortName(candidate({ name: "Plain name" }))).toBe("Plain name");
  });
});
