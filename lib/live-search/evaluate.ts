import "server-only";

import type { SpaceMeasurement } from "@/lib/catalog-types";
import { evaluateProductAccess } from "@/lib/access-fit";
import { evaluateProductFit } from "@/lib/fit-engine";
import { DEFAULT_CLEARANCE_POLICY } from "@/lib/fit-config";
import { sha256Hex, stableJson } from "./hashing";
import type {
  BrowserSearchOutput,
  CandidateFitStatus,
  VerifiedLiveCandidateRecord,
} from "./types";

/** Runs the existing pure physical predicates over every validated live observation. */
export function evaluateLiveProducts(
  output: BrowserSearchOutput,
  measurement: SpaceMeasurement,
): readonly VerifiedLiveCandidateRecord[] {
  const evaluated = output.products.map((observation) => {
    const fit = evaluateProductFit(
      observation.assembledDimensions,
      measurement,
      DEFAULT_CLEARANCE_POLICY,
    );
    const access = fit.fits
      ? evaluateProductAccess(
          observation.assembledDimensions,
          measurement.accessWidthMm,
          measurement.uncertaintyMm,
          DEFAULT_CLEARANCE_POLICY,
        )
      : ({ status: "skipped", passes: true } as const);
    const fitStatus: CandidateFitStatus = !fit.fits
      ? "near_miss"
      : access.status === "failed"
        ? "access_issue"
        : "fits";
    return {
      observation,
      fitStatus,
      fit,
      access,
      snapshotHash: sha256Hex(stableJson(stableProductFacts(observation))),
    };
  });

  return [...evaluated]
    .sort(compareCandidates)
    .map((candidate, rank) => ({ ...candidate, rank }));
}

function stableProductFacts(
  observation: BrowserSearchOutput["products"][number],
): Omit<BrowserSearchOutput["products"][number], "observedAt"> {
  const { observedAt, ...facts } = observation;
  void observedAt;
  return facts;
}

function compareCandidates(
  left: Omit<VerifiedLiveCandidateRecord, "rank">,
  right: Omit<VerifiedLiveCandidateRecord, "rank">,
): number {
  const statusOrder: Readonly<Record<CandidateFitStatus, number>> = {
    fits: 0,
    access_issue: 1,
    near_miss: 2,
  };
  if (left.fitStatus !== right.fitStatus) {
    return statusOrder[left.fitStatus] - statusOrder[right.fitStatus];
  }
  const availability = availabilityRank(left.observation.availability) - availabilityRank(right.observation.availability);
  if (availability !== 0) {
    return availability;
  }
  if (left.fitStatus === "fits" && left.fit.minimumClearanceMm !== right.fit.minimumClearanceMm) {
    return right.fit.minimumClearanceMm - left.fit.minimumClearanceMm;
  }
  if (left.fitStatus === "access_issue") {
    const leftDeficit = left.access.status === "failed" ? left.access.deficitMm : Number.MAX_SAFE_INTEGER;
    const rightDeficit = right.access.status === "failed" ? right.access.deficitMm : Number.MAX_SAFE_INTEGER;
    if (leftDeficit !== rightDeficit) {
      return leftDeficit - rightDeficit;
    }
  }
  if (left.fitStatus === "near_miss" && left.fit.minimumClearanceMm !== right.fit.minimumClearanceMm) {
    return right.fit.minimumClearanceMm - left.fit.minimumClearanceMm;
  }
  return (
    left.observation.priceMinor - right.observation.priceMinor ||
    left.observation.retailer.localeCompare(right.observation.retailer) ||
    left.observation.retailerProductId.localeCompare(right.observation.retailerProductId)
  );
}

function availabilityRank(value: "in_stock" | "out_of_stock" | "unknown"): number {
  return value === "in_stock" ? 0 : value === "unknown" ? 1 : 2;
}
