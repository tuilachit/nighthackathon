/**
 * Pure delivery-access checks. This module intentionally models one narrowest
 * opening, not turns, packaging, disassembly, or a complete delivery route.
 */

import type {
  AccessCrossSectionDimension,
  AccessEvaluation,
  ClearancePolicy,
  ProductAxis,
  ProductDimensions,
} from "./catalog-types";

const AXIS_TIE_ORDER: Readonly<Record<ProductAxis, number>> = {
  width: 0,
  depth: 1,
  height: 2,
};

/**
 * Evaluates whether the product's smallest transport cross-section clears the
 * supplied opening after uncertainty and side allowances.
 */
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
  const controllingDimensionMm = Math.max(
    crossSection[0].sizeMm,
    crossSection[1].sizeMm,
  );
  const requiredWidthMm =
    controllingDimensionMm + uncertaintyMm + policy.sideMm * 2;
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

/**
 * Returns the two smallest product axes, using width, depth, then height as the
 * deterministic tie order.
 */
export function getSmallestCrossSection(
  dimensions: ProductDimensions,
): readonly [
  AccessCrossSectionDimension,
  AccessCrossSectionDimension,
] {
  const axes: AccessCrossSectionDimension[] = [
    { axis: "width", sizeMm: dimensions.widthMm },
    { axis: "depth", sizeMm: dimensions.depthMm },
    { axis: "height", sizeMm: dimensions.heightMm },
  ];

  axes.sort(
    (left, right) =>
      left.sizeMm - right.sizeMm ||
      AXIS_TIE_ORDER[left.axis] - AXIS_TIE_ORDER[right.axis],
  );
  return [axes[0], axes[1]];
}
