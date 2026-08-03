import { describe, expect, it } from "vitest";
import {
  averagePoint,
  cornerSkewDegrees,
  inchesToMm,
  manualSpaceMeasurement,
  measureFootprint,
  mmToInches,
  mmToMeters,
  metersToMm,
  planarDistanceMm,
  toSpaceMeasurement,
  WEBXR_BASE_UNCERTAINTY_MM,
} from "./measurement-geometry";
import type { Point3 } from "./measurement-geometry";

describe("unit conversions", () => {
  it("converts metres and millimetres both ways", () => {
    expect(metersToMm(1.2)).toBeCloseTo(1200);
    expect(mmToMeters(1200)).toBeCloseTo(1.2);
  });

  it("converts millimetres and inches both ways", () => {
    expect(mmToInches(25.4)).toBeCloseTo(1);
    expect(inchesToMm(1)).toBeCloseTo(25.4);
  });
});

describe("averagePoint", () => {
  it("averages noisy samples toward the true point", () => {
    const samples: readonly Point3[] = [
      { x: 0.98, y: 0, z: 2.02 },
      { x: 1.02, y: 0.01, z: 1.98 },
      { x: 1.0, y: -0.01, z: 2.0 },
    ];

    expect(averagePoint(samples)).toEqual({ x: 1, y: 0, z: 2 });
  });

  it("throws on an empty sample window", () => {
    expect(() => averagePoint([])).toThrow(RangeError);
  });
});

describe("planarDistanceMm", () => {
  it("ignores vertical noise and measures the floor-plane distance", () => {
    const a: Point3 = { x: 0, y: 0, z: 0 };
    const b: Point3 = { x: 0.3, y: 5, z: 0.4 };

    expect(planarDistanceMm(a, b)).toBeCloseTo(500);
  });
});

describe("cornerSkewDegrees", () => {
  it("returns zero for a perfect right angle", () => {
    const corner: Point3 = { x: 0, y: 0, z: 0 };
    const armA: Point3 = { x: 1, y: 0, z: 0 };
    const armB: Point3 = { x: 0, y: 0, z: 1 };

    expect(cornerSkewDegrees(corner, armA, armB)).toBeCloseTo(0);
  });

  it("reports the deviation from 90 degrees for a skewed corner", () => {
    const corner: Point3 = { x: 0, y: 0, z: 0 };
    const armA: Point3 = { x: 1, y: 0, z: 0 };
    const armB: Point3 = { x: 1, y: 0, z: 1 };

    expect(cornerSkewDegrees(corner, armA, armB)).toBeCloseTo(45);
  });
});

describe("measureFootprint", () => {
  it("derives width and depth from a square corner and keeps the base uncertainty", () => {
    const taps = {
      backLeft: [{ x: 0, y: 0, z: 0 }],
      backRight: [{ x: 0.812, y: 0, z: 0 }],
      frontRight: [{ x: 0.812, y: 0, z: 0.405 }],
    };

    const footprint = measureFootprint(taps);

    expect(footprint.widthMm).toBe(812);
    expect(footprint.depthMm).toBe(405);
    expect(footprint.cornerSkewDegrees).toBeCloseTo(0);
    expect(footprint.uncertaintyMm).toBe(WEBXR_BASE_UNCERTAINTY_MM);
  });

  it("adds extra uncertainty when the captured corner is not square", () => {
    const taps = {
      backLeft: [{ x: 0, y: 0, z: 0 }],
      backRight: [{ x: 1, y: 0, z: 0 }],
      frontRight: [{ x: 1.1, y: 0, z: 1 }],
    };

    const footprint = measureFootprint(taps);

    expect(footprint.cornerSkewDegrees).toBeGreaterThan(0);
    expect(footprint.uncertaintyMm).toBeGreaterThan(WEBXR_BASE_UNCERTAINTY_MM);
  });

  it("averages multiple samples per tap before measuring", () => {
    const taps = {
      backLeft: [
        { x: -0.01, y: 0, z: 0 },
        { x: 0.01, y: 0, z: 0 },
      ],
      backRight: [
        { x: 0.8, y: 0, z: -0.01 },
        { x: 0.8, y: 0, z: 0.01 },
      ],
      frontRight: [{ x: 0.8, y: 0, z: 0.4 }],
    };

    const footprint = measureFootprint(taps);

    expect(footprint.widthMm).toBe(800);
    expect(footprint.depthMm).toBe(400);
  });
});

describe("space measurement builders", () => {
  it("builds a webxr space measurement from a footprint and manual height", () => {
    const footprint = { widthMm: 812, depthMm: 405, cornerSkewDegrees: 0, uncertaintyMm: 25 };

    expect(toSpaceMeasurement(footprint, 900.4)).toEqual({
      widthMm: 812,
      depthMm: 405,
      heightMm: 900,
      uncertaintyMm: 25,
      source: "webxr",
    });
  });

  it("builds a manual space measurement with the manual uncertainty default", () => {
    const space = manualSpaceMeasurement({ widthMm: 812, depthMm: 405, heightMm: 900 });

    expect(space.source).toBe("manual");
    expect(space.uncertaintyMm).toBe(25);
  });
});
