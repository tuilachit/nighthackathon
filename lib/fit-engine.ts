/**
 * Pure destination-space fit evaluation. It applies measurement uncertainty,
 * safety clearances, and deterministic upright orientation selection.
 */

import type {
  ClearancePolicy,
  FitEvaluation,
  ProductDimensions,
  ProductOrientation,
  SpaceMeasurement,
} from "./catalog-types";
import { DEFAULT_CLEARANCE_POLICY } from "./fit-config";
import type {
  ProductDimensions as MeasurementProductDimensions,
  SpaceMeasurement as MeasurementSpaceMeasurement,
} from "./measurement-geometry";

export { DEFAULT_CLEARANCE_POLICY } from "./fit-config";
export type { ClearancePolicy, FitEvaluation } from "./catalog-types";

interface OrientationDimensions {
  readonly orientation: ProductOrientation;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number;
}

/**
 * Evaluates both upright orientations and returns the candidate with the
 * greatest minimum clearance, or the least-bad stable near miss.
 */
export function evaluateProductFit(
  dimensions: ProductDimensions,
  measurement: SpaceMeasurement,
  policy: ClearancePolicy,
): FitEvaluation {
  const validationReason = getValidationReason(dimensions, measurement, policy);
  if (validationReason !== undefined) {
    return {
      fits: false,
      orientation: "default",
      widthClearanceMm: Number.NEGATIVE_INFINITY,
      heightClearanceMm: Number.NEGATIVE_INFINITY,
      depthClearanceMm: Number.NEGATIVE_INFINITY,
      minimumClearanceMm: Number.NEGATIVE_INFINITY,
      confidence: "low",
      reasons: [validationReason],
    };
  }

  const candidates = getOrientations(dimensions).map((candidate) =>
    evaluateOrientation(candidate, measurement, policy),
  );

  return [...candidates].sort(compareFitCandidates)[0];
}

/**
 * Compatibility entry point for the XR lane. Both measurement contracts share
 * the same dimensional shape; the search engine remains the single fit policy.
 */
export function evaluateFit(
  measurement: MeasurementSpaceMeasurement,
  dimensions: MeasurementProductDimensions,
  policy: ClearancePolicy = DEFAULT_CLEARANCE_POLICY,
): FitEvaluation {
  return evaluateProductFit(dimensions, measurement, policy);
}

/** Formats a compact result for the XR placement view. */
export function formatFitLabel(evaluation: FitEvaluation): string {
  if (evaluation.fits) {
    return `Fits · ${evaluation.minimumClearanceMm} mm clear`;
  }
  const reason = evaluation.reasons[0]?.replace(" after safety allowance.", "");
  return reason === undefined ? "Doesn't fit" : `Near miss · ${reason}`;
}

function getOrientations(dimensions: ProductDimensions): readonly OrientationDimensions[] {
  return [
    {
      orientation: "default",
      widthMm: dimensions.widthMm,
      heightMm: dimensions.heightMm,
      depthMm: dimensions.depthMm,
    },
    {
      orientation: "rotated-90",
      widthMm: dimensions.depthMm,
      heightMm: dimensions.heightMm,
      depthMm: dimensions.widthMm,
    },
  ];
}

function evaluateOrientation(
  dimensions: OrientationDimensions,
  measurement: SpaceMeasurement,
  policy: ClearancePolicy,
): FitEvaluation {
  const widthClearanceMm = Math.round(
    measurement.widthMm - measurement.uncertaintyMm - dimensions.widthMm - policy.sideMm * 2,
  );
  const heightClearanceMm = Math.round(
    measurement.heightMm - measurement.uncertaintyMm - dimensions.heightMm - policy.topMm,
  );
  const depthClearanceMm = Math.round(
    measurement.depthMm - measurement.uncertaintyMm - dimensions.depthMm - policy.backMm,
  );
  const minimumClearanceMm = Math.min(widthClearanceMm, heightClearanceMm, depthClearanceMm);
  const reasons = getFailureReasons(widthClearanceMm, heightClearanceMm, depthClearanceMm);

  return {
    fits: reasons.length === 0,
    orientation: dimensions.orientation,
    widthClearanceMm,
    heightClearanceMm,
    depthClearanceMm,
    minimumClearanceMm,
    confidence: getConfidence(minimumClearanceMm),
    reasons,
  };
}

function getFailureReasons(
  widthClearanceMm: number,
  heightClearanceMm: number,
  depthClearanceMm: number,
): readonly string[] {
  const reasons: string[] = [];
  if (widthClearanceMm < 0) {
    reasons.push(`${Math.abs(widthClearanceMm)} mm too wide after safety allowance.`);
  }
  if (heightClearanceMm < 0) {
    reasons.push(`${Math.abs(heightClearanceMm)} mm too tall after safety allowance.`);
  }
  if (depthClearanceMm < 0) {
    reasons.push(`${Math.abs(depthClearanceMm)} mm too deep after safety allowance.`);
  }
  return reasons;
}

function getConfidence(minimumClearanceMm: number): FitEvaluation["confidence"] {
  if (minimumClearanceMm >= 50) {
    return "high";
  }
  if (minimumClearanceMm >= 20) {
    return "medium";
  }
  return "low";
}

function compareFitCandidates(left: FitEvaluation, right: FitEvaluation): number {
  if (left.fits !== right.fits) {
    return left.fits ? -1 : 1;
  }
  if (left.minimumClearanceMm !== right.minimumClearanceMm) {
    return right.minimumClearanceMm - left.minimumClearanceMm;
  }
  return left.orientation === "default" ? -1 : 1;
}

function getValidationReason(
  dimensions: ProductDimensions,
  measurement: SpaceMeasurement,
  policy: ClearancePolicy,
): string | undefined {
  const values = [
    dimensions.widthMm,
    dimensions.heightMm,
    dimensions.depthMm,
    measurement.widthMm,
    measurement.heightMm,
    measurement.depthMm,
  ];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return "Product and space dimensions must be positive numbers.";
  }
  if (!Number.isFinite(measurement.uncertaintyMm) || measurement.uncertaintyMm < 0) {
    return "Measurement uncertainty must be zero or greater.";
  }
  if ([policy.sideMm, policy.backMm, policy.topMm].some((value) => !Number.isFinite(value) || value < 0)) {
    return "Clearance policy values must be zero or greater.";
  }
  return undefined;
}
