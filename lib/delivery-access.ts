/**
 * Package-aware delivery access built on the existing single-opening predicate.
 * It does not model turns, diagonals, disassembly, or a complete delivery route.
 */

import type {
  ClearancePolicy,
  ProductDimensions,
} from "./catalog-types";
import { evaluateProductAccess } from "./access-fit";
import type {
  DeliveryAccessEvaluation,
  DeliveryPackage,
} from "./live-search/types";

/**
 * Evaluates every known complete package and returns the worst package result.
 * When package data is unavailable, assembled dimensions are checked as an
 * explicitly advisory fallback.
 */
export function evaluateDeliveryAccess(
  assembledDimensions: ProductDimensions,
  packages: readonly DeliveryPackage[] | null | undefined,
  accessWidthMm: number | null | undefined,
  uncertaintyMm: number,
  policy: ClearancePolicy,
): DeliveryAccessEvaluation {
  if (accessWidthMm === null || accessWidthMm === undefined) {
    return { status: "skipped", passes: true, basis: "unknown" };
  }

  if (packages === null || packages === undefined || packages.length === 0) {
    const evaluation = evaluateProductAccess(
      assembledDimensions,
      accessWidthMm,
      uncertaintyMm,
      policy,
    );
    if (evaluation.status === "skipped") {
      return { status: "skipped", passes: true, basis: "unknown" };
    }
    return { ...evaluation, basis: "assembled-advisory" };
  }

  const evaluations = packages.map((deliveryPackage, index) => ({
    index,
    label: deliveryPackage.label,
    evaluation: evaluateProductAccess(
      deliveryPackage,
      accessWidthMm,
      uncertaintyMm,
      policy,
    ),
  }));
  const controlling = [...evaluations].sort((left, right) => {
    const leftEvaluation = left.evaluation;
    const rightEvaluation = right.evaluation;
    if (leftEvaluation.status === "failed" && rightEvaluation.status !== "failed") {
      return -1;
    }
    if (leftEvaluation.status !== "failed" && rightEvaluation.status === "failed") {
      return 1;
    }
    if (leftEvaluation.status === "failed" && rightEvaluation.status === "failed") {
      return rightEvaluation.deficitMm - leftEvaluation.deficitMm || left.index - right.index;
    }
    if (leftEvaluation.status === "passed" && rightEvaluation.status === "passed") {
      return leftEvaluation.clearanceMm - rightEvaluation.clearanceMm || left.index - right.index;
    }
    return left.index - right.index;
  })[0];

  if (controlling === undefined || controlling.evaluation.status === "skipped") {
    return { status: "skipped", passes: true, basis: "unknown" };
  }
  return {
    ...controlling.evaluation,
    basis: "package",
    controllingPackageIndex: controlling.index,
    ...(controlling.label === undefined
      ? {}
      : { controllingPackageLabel: controlling.label }),
  };
}
