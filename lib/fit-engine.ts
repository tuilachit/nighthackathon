import type {
  AccessCrossSectionDimension,
  AccessEvaluation,
  ClearancePolicy,
  FitEvaluation,
  ProductAxis,
  ProductDimensions,
  ProductOrientation,
  SpaceMeasurement,
} from "./catalog-types";

interface OrientationDimensions {
  readonly orientation: ProductOrientation;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number;
}

const AXIS_TIE_ORDER: Record<ProductAxis, number> = {
  width: 0,
  depth: 1,
  height: 2,
};

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

export function evaluateProductAccess(
  dimensions: ProductDimensions,
  accessWidthMm: number | null | undefined,
  uncertaintyMm: number,
  policy: ClearancePolicy,
): AccessEvaluation {
  if (accessWidthMm === null || accessWidthMm === undefined) {
    return { status: "skipped", passes: true };
  }

  const crossSection = getSmallestCrossSection(dimensions);
  const controllingDimensionMm = Math.max(crossSection[0].sizeMm, crossSection[1].sizeMm);
  const requiredWidthMm = controllingDimensionMm + uncertaintyMm + policy.sideMm * 2;
  const clearanceMm = Math.round(accessWidthMm - requiredWidthMm);

  if (clearanceMm >= 0) {
    return {
      status: "passed",
      passes: true,
      accessWidthMm,
      crossSection,
      clearanceMm,
    };
  }

  const deficitMm = Math.abs(clearanceMm);
  return {
    status: "failed",
    passes: false,
    accessWidthMm,
    crossSection,
    deficitMm,
    reason: `Fits the space, but ${deficitMm} mm too wide for the ${Math.round(accessWidthMm)} mm access opening.`,
  };
}

export function getSmallestCrossSection(
  dimensions: ProductDimensions,
): readonly [AccessCrossSectionDimension, AccessCrossSectionDimension] {
  const axes: AccessCrossSectionDimension[] = [
    { axis: "width", sizeMm: dimensions.widthMm },
    { axis: "depth", sizeMm: dimensions.depthMm },
    { axis: "height", sizeMm: dimensions.heightMm },
  ];

  axes.sort((left, right) => left.sizeMm - right.sizeMm || AXIS_TIE_ORDER[left.axis] - AXIS_TIE_ORDER[right.axis]);
  return [axes[0], axes[1]];
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
