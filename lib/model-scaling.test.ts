import { describe, expect, it } from "vitest";
import {
  computeBoxScale,
  computeScaleFromMeasuredSize,
  formatScaleAttribute,
  getPlacementScale,
  getPlacementSource,
  IDENTITY_SCALE,
  iosTrueScaleAvailable,
  isHeroModel,
  needsRuntimeScaleMeasurement,
} from "./model-scaling";
import type { PlacementModel } from "./model-scaling";

describe("computeBoxScale", () => {
  it("stretches the unit box per axis to match exact product dimensions", () => {
    const scale = computeBoxScale({ widthMm: 778, depthMm: 280, heightMm: 840 });
    expect(scale).toEqual({ x: 0.778, y: 0.84, z: 0.28 });
  });

  it("returns identity scale when the target matches the unit box", () => {
    const scale = computeBoxScale({ widthMm: 1000, depthMm: 1000, heightMm: 1000 });
    expect(scale).toEqual(IDENTITY_SCALE);
  });
});

describe("formatScaleAttribute", () => {
  it("formats as a space-separated model-viewer scale string", () => {
    expect(formatScaleAttribute({ x: 0.778, y: 0.84, z: 0.28 })).toBe("0.778 0.84 0.28");
  });
});

describe("hero vs placeholder placement models", () => {
  const heroModel: PlacementModel = {
    dimensions: { widthMm: 778, depthMm: 280, heightMm: 840 },
    glbUrl: "/models/oakridge-3-shelf.glb",
    iosUsdzUrl: "/models/oakridge-3-shelf.usdz",
    placeholderBoxGlbUrl: "/models/unit-box.glb",
  };

  const placeholderModel: PlacementModel = {
    dimensions: { widthMm: 778, depthMm: 280, heightMm: 840 },
    placeholderBoxGlbUrl: "/models/unit-box.glb",
  };

  it("treats a model with a hero GLB as already true-to-scale", () => {
    expect(isHeroModel(heroModel)).toBe(true);
    expect(getPlacementScale(heroModel)).toEqual(IDENTITY_SCALE);
    expect(getPlacementSource(heroModel)).toBe("/models/oakridge-3-shelf.glb");
  });

  it("stretches the placeholder box when there is no hero GLB", () => {
    expect(isHeroModel(placeholderModel)).toBe(false);
    expect(getPlacementScale(placeholderModel)).toEqual({ x: 0.778, y: 0.84, z: 0.28 });
    expect(getPlacementSource(placeholderModel)).toBe("/models/unit-box.glb");
  });

  it("only trusts iOS true scale when a real USDZ is provided", () => {
    expect(iosTrueScaleAvailable(heroModel)).toBe(true);
    expect(iosTrueScaleAvailable(placeholderModel)).toBe(false);
  });
});

describe("generated (Meshy) models never get a static identity scale", () => {
  const generatedModel: PlacementModel = {
    dimensions: { widthMm: 778, depthMm: 280, heightMm: 840 },
    glbUrl: "https://assets.meshy.ai/task/output/model.glb",
    iosUsdzUrl: "https://assets.meshy.ai/task/output/model.usdz",
    placeholderBoxGlbUrl: "/models/unit-box.glb",
    scaleSource: "generated",
  };

  it("is not treated as a trustworthy hero model even though it has a glbUrl", () => {
    expect(isHeroModel(generatedModel)).toBe(false);
    expect(needsRuntimeScaleMeasurement(generatedModel)).toBe(true);
  });

  it("does not need runtime measurement once it is verified", () => {
    expect(needsRuntimeScaleMeasurement({ ...generatedModel, scaleSource: "verified" })).toBe(false);
  });

  it("computes a stretch scale from whatever native size the loaded model actually measures", () => {
    const measuredNativeMm = { widthMm: 500, depthMm: 500, heightMm: 500 };
    const scale = computeScaleFromMeasuredSize(generatedModel.dimensions, measuredNativeMm);
    expect(scale).toEqual({ x: 1.556, y: 1.68, z: 0.56 });
  });
});
