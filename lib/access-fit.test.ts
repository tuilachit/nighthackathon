import { describe, expect, it } from "vitest";
import type { ProductDimensions } from "./catalog-types";
import {
  evaluateProductAccess,
  getSmallestCrossSection,
} from "./access-fit";
import { DEFAULT_CLEARANCE_POLICY } from "./fit-config";

describe("evaluateProductAccess", () => {
  const product: ProductDimensions = {
    widthMm: 700,
    heightMm: 1600,
    depthMm: 280,
  };

  it.each([null, undefined])("skips a missing access width", (accessWidthMm) => {
    expect(
      evaluateProductAccess(
        product,
        accessWidthMm,
        25,
        DEFAULT_CLEARANCE_POLICY,
      ),
    ).toEqual({ status: "skipped", passes: true });
  });

  it("passes with positive access clearance", () => {
    const result = evaluateProductAccess(
      product,
      820,
      25,
      DEFAULT_CLEARANCE_POLICY,
    );
    expect(result.status).toBe("passed");
    if (result.status === "passed") {
      expect(result.clearanceMm).toBe(55);
    }
  });

  it("passes at the exact boundary", () => {
    const result = evaluateProductAccess(
      product,
      765,
      25,
      DEFAULT_CLEARANCE_POLICY,
    );
    expect(result.status).toBe("passed");
    if (result.status === "passed") {
      expect(result.clearanceMm).toBe(0);
    }
  });

  it("fails with a stable deficit reason", () => {
    const result = evaluateProductAccess(
      product,
      730,
      25,
      DEFAULT_CLEARANCE_POLICY,
    );
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.deficitMm).toBe(35);
      expect(result.reason).toBe(
        "Fits the space, but 35 mm too wide for the 730 mm access opening.",
      );
    }
  });

  it("selects the two smallest dimensions with deterministic ties", () => {
    expect(
      getSmallestCrossSection({
        widthMm: 300,
        heightMm: 900,
        depthMm: 300,
      }),
    ).toEqual([
      { axis: "width", sizeMm: 300 },
      { axis: "depth", sizeMm: 300 },
    ]);
    expect(
      getSmallestCrossSection({
        widthMm: 700,
        heightMm: 1600,
        depthMm: 280,
      }),
    ).toEqual([
      { axis: "depth", sizeMm: 280 },
      { axis: "width", sizeMm: 700 },
    ]);
  });
});
