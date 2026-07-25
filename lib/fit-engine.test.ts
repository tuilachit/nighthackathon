import { describe, expect, it } from "vitest";
import { DEFAULT_CLEARANCE_POLICY, evaluateFit, formatFitLabel } from "./fit-engine";
import type { ProductDimensions } from "./measurement-geometry";
import type { SpaceMeasurement } from "./measurement-geometry";

function space(overrides: Partial<SpaceMeasurement> = {}): SpaceMeasurement {
  return { widthMm: 800, depthMm: 400, heightMm: 900, uncertaintyMm: 0, source: "manual", ...overrides };
}

function product(overrides: Partial<ProductDimensions> = {}): ProductDimensions {
  return { widthMm: 760, depthMm: 380, heightMm: 890, ...overrides };
}

describe("evaluateFit — boundary behavior", () => {
  it("fits exactly when every clearance lands on zero", () => {
    const result = evaluateFit(space(), product(), DEFAULT_CLEARANCE_POLICY);

    expect(result.fits).toBe(true);
    expect(result.widthClearanceMm).toBe(0);
    expect(result.depthClearanceMm).toBe(0);
    expect(result.heightClearanceMm).toBe(0);
    expect(result.minimumClearanceMm).toBe(0);
  });
});

describe("evaluateFit — orientation selection", () => {
  it("fits by default orientation when the rotated orientation cannot work", () => {
    const result = evaluateFit(space({ uncertaintyMm: 0 }), product({ widthMm: 700, depthMm: 300, heightMm: 850 }));

    expect(result.fits).toBe(true);
    expect(result.orientation).toBe("default");
    expect(result.minimumClearanceMm).toBe(40);
  });

  it("fits only when rotated 90 degrees", () => {
    const narrowDeepSpace = space({ widthMm: 400, depthMm: 800, heightMm: 900, uncertaintyMm: 0 });
    const result = evaluateFit(narrowDeepSpace, product({ widthMm: 380, depthMm: 200, heightMm: 850 }));

    expect(result.fits).toBe(true);
    expect(result.orientation).toBe("rotated-90");
    expect(result.minimumClearanceMm).toBe(40);
  });
});

describe("evaluateFit — height never rotates", () => {
  it("fails on height regardless of orientation", () => {
    const squareSpace = space({ widthMm: 800, depthMm: 800, heightMm: 900, uncertaintyMm: 0 });
    const tallProduct = product({ widthMm: 200, depthMm: 200, heightMm: 895 });
    const result = evaluateFit(squareSpace, tallProduct);

    expect(result.fits).toBe(false);
    expect(result.orientation).toBe("default");
    expect(result.heightClearanceMm).toBe(-5);
    expect(result.reasons).toEqual(["5 mm too tall"]);
  });
});

describe("evaluateFit — uncertainty and clearance policy can flip a nominal fit", () => {
  it("turns a zero-margin fit into a near miss once scan uncertainty is applied", () => {
    const nominal = evaluateFit(space({ uncertaintyMm: 0 }), product());
    const withUncertainty = evaluateFit(space({ uncertaintyMm: 10 }), product());

    expect(nominal.fits).toBe(true);
    expect(withUncertainty.fits).toBe(false);
    expect(withUncertainty.widthClearanceMm).toBe(-10);
  });

  it("turns a zero-margin fit into a near miss under a stricter clearance policy", () => {
    const nominal = evaluateFit(space({ uncertaintyMm: 0 }), product(), DEFAULT_CLEARANCE_POLICY);
    const stricter = evaluateFit(space({ uncertaintyMm: 0 }), product(), { ...DEFAULT_CLEARANCE_POLICY, sideMm: 30 });

    expect(nominal.fits).toBe(true);
    expect(stricter.fits).toBe(false);
    expect(stricter.reasons).toEqual(["20 mm too wide"]);
  });
});

describe("evaluateFit — invalid input", () => {
  it("rejects a zero-width space instead of dividing by an empty envelope", () => {
    const result = evaluateFit(space({ widthMm: 0 }), product());
    expect(result.fits).toBe(false);
    expect(result.confidence).toBe("low");
    expect(result.reasons).toEqual(["Measurement or product dimensions are invalid."]);
  });

  it("rejects negative product dimensions", () => {
    const result = evaluateFit(space(), product({ depthMm: -10 }));
    expect(result.fits).toBe(false);
    expect(result.reasons).toEqual(["Measurement or product dimensions are invalid."]);
  });

  it("rejects non-finite (missing/NaN) measurements", () => {
    const result = evaluateFit(space({ heightMm: Number.NaN }), product());
    expect(result.fits).toBe(false);
    expect(result.reasons).toEqual(["Measurement or product dimensions are invalid."]);
  });
});

describe("evaluateFit — stable reasons and minimum clearance", () => {
  it("reports every failing dimension with a stable, human-readable reason", () => {
    const tightSpace = space({ widthMm: 700, depthMm: 350, heightMm: 850, uncertaintyMm: 0 });
    const result = evaluateFit(tightSpace, product());

    expect(result.fits).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.minimumClearanceMm).toBe(Math.min(result.widthClearanceMm, result.depthClearanceMm, result.heightClearanceMm));
  });

  it("returns no reasons when the product fits", () => {
    const result = evaluateFit(space({ uncertaintyMm: 0 }), product({ widthMm: 700, depthMm: 300, heightMm: 850 }));
    expect(result.fits).toBe(true);
    expect(result.reasons).toEqual([]);
  });
});

describe("evaluateFit — confidence tiers relative to measurement uncertainty", () => {
  const roomySpace = space({ widthMm: 900, depthMm: 500, heightMm: 1000, uncertaintyMm: 25 });

  it("is high confidence when the margin is at least twice the uncertainty", () => {
    const result = evaluateFit(roomySpace, product({ widthMm: 700, depthMm: 300, heightMm: 800 }));
    expect(result.minimumClearanceMm).toBeGreaterThanOrEqual(50);
    expect(result.confidence).toBe("high");
  });

  it("is medium confidence when the margin sits between one and two times the uncertainty", () => {
    const result = evaluateFit(roomySpace, product({ widthMm: 805, depthMm: 300, heightMm: 800 }));
    expect(result.minimumClearanceMm).toBe(30);
    expect(result.confidence).toBe("medium");
  });

  it("is low confidence when the margin is inside the uncertainty band, even if it still fits", () => {
    const result = evaluateFit(roomySpace, product({ widthMm: 825, depthMm: 300, heightMm: 800 }));
    expect(result.minimumClearanceMm).toBe(10);
    expect(result.fits).toBe(true);
    expect(result.confidence).toBe("low");
  });
});

describe("formatFitLabel", () => {
  it("summarizes a fit with its minimum clearance", () => {
    const result = evaluateFit(space({ uncertaintyMm: 0 }), product({ widthMm: 700, depthMm: 300, heightMm: 850 }));
    expect(formatFitLabel(result)).toBe("Fits · 40 mm clear");
  });

  it("summarizes a near miss with the first stable reason", () => {
    const squareSpace = space({ widthMm: 800, depthMm: 800, heightMm: 900, uncertaintyMm: 0 });
    const result = evaluateFit(squareSpace, product({ widthMm: 200, depthMm: 200, heightMm: 895 }));
    expect(formatFitLabel(result)).toBe("Near miss · 5 mm too tall");
  });
});
