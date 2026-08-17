import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PublicSharedComparison,
  type PublicDecisionCandidate,
  type PublicSharedComparisonSnapshot,
} from "./PublicSharedComparison";

const fitCandidate: PublicDecisionCandidate = {
  key: "shared-1",
  retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
  name: "Narrow oak shelf",
  imageUrl: "https://www.ikea.com/au/en/images/products/narrow-oak-shelf.jpg",
  price: { minor: 12900, currency: "AUD" },
  availability: "in_stock",
  assembledDimensions: { widthMm: 600, heightMm: 1700, depthMm: 280 },
  packages: [{ widthMm: 650, heightMm: 100, depthMm: 300, label: "Flat pack" }],
  fitStatus: "fits",
  fit: {
    fits: true,
    orientation: "default",
    widthClearanceMm: 235,
    heightClearanceMm: 65,
    depthClearanceMm: 25,
    minimumClearanceMm: 25,
    confidence: "high",
    reasons: [],
  },
  access: {
    status: "passed",
    passes: true,
    basis: "package",
    accessWidthMm: 820,
    crossSection: [
      { axis: "height", sizeMm: 100 },
      { axis: "depth", sizeMm: 300 },
    ],
    clearanceMm: 455,
    controllingPackageIndex: 0,
    controllingPackageLabel: "Flat pack",
  },
  provenance: {
    source: "retailer-page",
    evidence: "Width 60 cm, height 170 cm, depth 28 cm.",
    observedAt: "2026-08-17T00:00:00.000Z",
    freshness: "live",
  },
  productUrl: "https://www.ikea.com/au/en/p/narrow-oak-shelf/",
};

const snapshot: PublicSharedComparisonSnapshot = {
  measurement: {
    widthMm: 900,
    heightMm: 1800,
    depthMm: 350,
    accessWidthMm: 820,
    uncertaintyMm: 25,
    source: "manual",
  },
  intent: {
    kind: "prompt",
    text: "narrow oak shelf under $300",
    retailers: ["ikea-au", "kmart-au"],
  },
  candidates: [fitCandidate],
  checkedAt: "2026-08-17T00:01:00.000Z",
  isPartial: true,
  coverageNotes: ["Kmart Australia returned no dimension-complete match."],
};

describe("PublicSharedComparison", () => {
  it("lands directly on an immutable comparison with warnings and source facts", () => {
    render(<PublicSharedComparison snapshot={snapshot} />);

    expect(screen.getByRole("heading", { name: "Clearance comparison" })).toBeInTheDocument();
    expect(screen.getByText("Narrow oak shelf")).toBeInTheDocument();
    expect(screen.getAllByText("25", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText(/advice, not a fit guarantee/i)).toBeInTheDocument();
    expect(screen.getByText(/Kmart Australia returned no dimension-complete match/)).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Technical measurement envelope diagram" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Narrow oak shelf retailer product photo" })).toHaveAttribute(
      "src",
      fitCandidate.imageUrl,
    );
    expect(screen.getByText("Listed in stock")).toBeInTheDocument();
    expect(screen.getByText(/Flat pack · 650 W × 100 H × 300 D mm/)).toBeInTheDocument();
    expect(screen.getByText(/Passed using Flat pack/)).toBeInTheDocument();
    expect(screen.getByText(fitCandidate.provenance.evidence)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View retailer source ↗" })).toHaveAttribute(
      "href",
      fitCandidate.productUrl,
    );
  });

  it("does not expose owner search or generation authority", () => {
    render(<PublicSharedComparison snapshot={snapshot} />);

    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /search/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Measure and start my search" })).toHaveAttribute(
      "href",
      "/fit?new=1",
    );
  });

  it("states when delivery access was not checked", () => {
    render(
      <PublicSharedComparison
        snapshot={{
          ...snapshot,
          measurement: { ...snapshot.measurement, accessWidthMm: undefined },
          candidates: [
            {
              ...fitCandidate,
              access: { status: "skipped", passes: true, basis: "unknown" },
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByText(/Access not checked/).length).toBeGreaterThan(0);
  });
});
