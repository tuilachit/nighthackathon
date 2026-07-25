import { describe, expect, it } from "vitest";
import {
  computeBoxScale,
  formatScaleAttribute,
  getPlacementScale,
  getPlacementSource,
  IDENTITY_SCALE,
  iosTrueScaleAvailable,
  isHeroModel,
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
