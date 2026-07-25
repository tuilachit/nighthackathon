import { roundMm } from "./measurement-geometry";
import type { ProductDimensions, SpaceMeasurement } from "./measurement-geometry";

export type FitOrientation = "default" | "rotated-90";
export type FitConfidence = "high" | "medium" | "low";

export interface ClearancePolicy {
  readonly sideMm: number;
  readonly backMm: number;
  readonly topMm: number;
}

export interface FitEvaluation {
  readonly fits: boolean;
  readonly orientation: FitOrientation;
  readonly widthClearanceMm: number;
  readonly heightClearanceMm: number;
  readonly depthClearanceMm: number;
  readonly minimumClearanceMm: number;
  readonly confidence: FitConfidence;
  readonly reasons: readonly string[];
}

export const DEFAULT_CLEARANCE_POLICY: ClearancePolicy = {
  sideMm: 20,
  backMm: 20,
  topMm: 10,
};

const INVALID_MEASUREMENT_REASON = "Measurement or product dimensions are invalid.";

interface OrientationResult {
  readonly orientation: FitOrientation;
  readonly widthClearanceMm: number;
  readonly depthClearanceMm: number;
  readonly heightClearanceMm: number;
  readonly minimumClearanceMm: number;
}

function isPositiveFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidSpaceMeasurement(space: SpaceMeasurement): boolean {
  return (
    isPositiveFiniteNumber(space.widthMm) &&
    isPositiveFiniteNumber(space.depthMm) &&
    isPositiveFiniteNumber(space.heightMm) &&
    Number.isFinite(space.uncertaintyMm) &&
    space.uncertaintyMm >= 0
  );
}

function isValidProductDimensions(product: ProductDimensions): boolean {
  return (
    isPositiveFiniteNumber(product.widthMm) &&
    isPositiveFiniteNumber(product.depthMm) &&
    isPositiveFiniteNumber(product.heightMm)
  );
}

function evaluateOrientation(
  space: SpaceMeasurement,
  product: ProductDimensions,
  policy: ClearancePolicy,
  orientation: FitOrientation,
): OrientationResult {
  const availableWidthMm = space.widthMm - space.uncertaintyMm;
  const availableDepthMm = space.depthMm - space.uncertaintyMm;
  const availableHeightMm = space.heightMm - space.uncertaintyMm;

  const footprintWidthMm = orientation === "default" ? product.widthMm : product.depthMm;
  const footprintDepthMm = orientation === "default" ? product.depthMm : product.widthMm;

  const requiredWidthMm = footprintWidthMm + 2 * policy.sideMm;
  const requiredDepthMm = footprintDepthMm + policy.backMm;
  const requiredHeightMm = product.heightMm + policy.topMm;

  const widthClearanceMm = roundMm(availableWidthMm - requiredWidthMm);
  const depthClearanceMm = roundMm(availableDepthMm - requiredDepthMm);
  const heightClearanceMm = roundMm(availableHeightMm - requiredHeightMm);

  return {
    orientation,
    widthClearanceMm,
    depthClearanceMm,
    heightClearanceMm,
    minimumClearanceMm: Math.min(widthClearanceMm, depthClearanceMm, heightClearanceMm),
  };
}

function reasonsForOrientation(result: OrientationResult): readonly string[] {
  const reasons: string[] = [];

  if (result.widthClearanceMm < 0) {
    reasons.push(`${Math.abs(result.widthClearanceMm)} mm too wide`);
  }
  if (result.depthClearanceMm < 0) {
    reasons.push(`${Math.abs(result.depthClearanceMm)} mm too deep`);
  }
  if (result.heightClearanceMm < 0) {
    reasons.push(`${Math.abs(result.heightClearanceMm)} mm too tall`);
  }

  return reasons;
}

function confidenceFor(minimumClearanceMm: number, uncertaintyMm: number): FitConfidence {
  if (uncertaintyMm <= 0) {
    return minimumClearanceMm >= 0 ? "high" : "low";
  }
  if (minimumClearanceMm >= 2 * uncertaintyMm) {
    return "high";
  }
  if (minimumClearanceMm >= uncertaintyMm) {
    return "medium";
  }
  return "low";
}

/**
 * Evaluates whether a product fits a measured space. Uncertainty is subtracted from
 * the available envelope and clearance is added to the product footprint *before*
 * comparing — never the other way around — so a "Fits" result is always conservative.
 * Height never rotates; only width/depth are tested in both orientations, and the
 * orientation with the larger minimum clearance wins (ties favor "default").
 */
export function evaluateFit(
  space: SpaceMeasurement,
  product: ProductDimensions,
  policy: ClearancePolicy = DEFAULT_CLEARANCE_POLICY,
): FitEvaluation {
  if (!isValidSpaceMeasurement(space) || !isValidProductDimensions(product)) {
    return {
      fits: false,
      orientation: "default",
      widthClearanceMm: 0,
      depthClearanceMm: 0,
      heightClearanceMm: 0,
      minimumClearanceMm: 0,
      confidence: "low",
      reasons: [INVALID_MEASUREMENT_REASON],
    };
  }

  const defaultResult = evaluateOrientation(space, product, policy, "default");
  const rotatedResult = evaluateOrientation(space, product, policy, "rotated-90");

  const chosen =
    rotatedResult.minimumClearanceMm > defaultResult.minimumClearanceMm ? rotatedResult : defaultResult;

  return {
    fits: chosen.minimumClearanceMm >= 0,
    orientation: chosen.orientation,
    widthClearanceMm: chosen.widthClearanceMm,
    depthClearanceMm: chosen.depthClearanceMm,
    heightClearanceMm: chosen.heightClearanceMm,
    minimumClearanceMm: chosen.minimumClearanceMm,
    confidence: confidenceFor(chosen.minimumClearanceMm, space.uncertaintyMm),
    reasons: reasonsForOrientation(chosen),
  };
}

/** Formats a stable, human-readable summary for comparison lists and AR overlays. */
export function formatFitLabel(evaluation: FitEvaluation): string {
  if (evaluation.fits) {
    return `Fits · ${evaluation.minimumClearanceMm} mm clear`;
  }
  return evaluation.reasons.length > 0 ? `Near miss · ${evaluation.reasons[0]}` : "Doesn't fit";
}
