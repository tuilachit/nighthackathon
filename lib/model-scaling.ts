import type { ProductDimensions } from "./measurement-geometry";

export interface Scale3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const IDENTITY_SCALE: Scale3 = { x: 1, y: 1, z: 1 };

/**
 * Assumed authored size of the shared placeholder box GLB used for catalog
 * products that don't have a hero model yet (a 1 metre cube). Non-hero GLBs
 * are stretched per-axis to the product's exact dimensions instead of guessing.
 */
export const UNIT_BOX_SIZE_MM: ProductDimensions = { widthMm: 1000, depthMm: 1000, heightMm: 1000 };

export interface PlacementModel {
  readonly dimensions: ProductDimensions;
  /** Hero GLB authored at true 1:1 real-world scale (metres), if one exists for this product. */
  readonly glbUrl?: string;
  /** Author-provided USDZ for iOS Quick Look. Auto-generated USDZ does not honor ar-scale="fixed". */
  readonly iosUsdzUrl?: string;
  /** Generic unit-box GLB used when no hero model exists; stretched to exact dimensions. */
  readonly placeholderBoxGlbUrl: string;
}

export function computeBoxScale(
  targetMm: ProductDimensions,
  unitBoxMm: ProductDimensions = UNIT_BOX_SIZE_MM,
): Scale3 {
  return {
    x: targetMm.widthMm / unitBoxMm.widthMm,
    y: targetMm.heightMm / unitBoxMm.heightMm,
    z: targetMm.depthMm / unitBoxMm.depthMm,
  };
}

export function formatScaleAttribute(scale: Scale3): string {
  return `${scale.x} ${scale.y} ${scale.z}`;
}

/** A hero GLB is authored true-to-scale already, so it never needs stretching. */
export function isHeroModel(model: PlacementModel): boolean {
  return model.glbUrl !== undefined;
}

export function getPlacementScale(model: PlacementModel): Scale3 {
  return isHeroModel(model) ? IDENTITY_SCALE : computeBoxScale(model.dimensions);
}

export function getPlacementSource(model: PlacementModel): string {
  return model.glbUrl ?? model.placeholderBoxGlbUrl;
}

/**
 * Quick Look only honors ar-scale="fixed" with an author-provided USDZ — auto-generated
 * USDZ silently ignores the fixed scale, so we only claim true scale on iOS when a real
 * ios-src is available. Otherwise iOS falls back to an auto-scaled (resizable) preview.
 */
export function iosTrueScaleAvailable(model: PlacementModel): boolean {
  return model.iosUsdzUrl !== undefined;
}
