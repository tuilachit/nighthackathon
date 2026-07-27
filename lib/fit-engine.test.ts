import { describe, expect, it } from "vitest";
import type { SpaceMeasurement } from "./catalog-types";
import { evaluateProductFit } from "./fit-engine";
import { DEFAULT_CLEARANCE_POLICY } from "./fit-config";

const measurement: SpaceMeasurement = {
  widthMm: 900,
  heightMm: 1800,
  depthMm: 350,
  uncertaintyMm: 25,
  accessWidthMm: 820,
  source: "demo",
};

describe("evaluateProductFit", () => {
  it("passes an exact safety boundary", () => {
    const result = evaluateProductFit(
      { widthMm: 835, heightMm: 1765, depthMm: 305 },
      measurement,
      DEFAULT_CLEARANCE_POLICY,
    );
    expect(result.fits).toBe(true);
    expect(result.minimumClearanceMm).toBe(0);
  });

  it("chooses a rotated orientation when only it fits", () => {
    const result = evaluateProductFit(
      { widthMm: 300, heightMm: 1200, depthMm: 700 },
      { ...measurement, widthMm: 800, depthMm: 380 },
      DEFAULT_CLEARANCE_POLICY,
    );
    expect(result.fits).toBe(true);
    expect(result.orientation).toBe("rotated-90");
  });

  it("reports a stable height failure", () => {
    const result = evaluateProductFit(
      { widthMm: 400, heightMm: 1800, depthMm: 250 },
      measurement,
      DEFAULT_CLEARANCE_POLICY,
    );
    expect(result.fits).toBe(false);
    expect(result.reasons).toContain("35 mm too tall after safety allowance.");
  });

  it("allows uncertainty to turn a nominal fit into a near miss", () => {
    const result = evaluateProductFit(
      { widthMm: 850, heightMm: 1200, depthMm: 250 },
      measurement,
      DEFAULT_CLEARANCE_POLICY,
    );
    expect(result.fits).toBe(false);
    expect(result.reasons[0]).toBe("15 mm too wide after safety allowance.");
  });

  it("rejects invalid dimensions", () => {
    const result = evaluateProductFit(
      { widthMm: 0, heightMm: 100, depthMm: 100 },
      measurement,
      DEFAULT_CLEARANCE_POLICY,
    );
    expect(result.fits).toBe(false);
    expect(result.reasons[0]).toBe("Product and space dimensions must be positive numbers.");
  });
});
