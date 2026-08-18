import type { DecisionCandidate } from "@/lib/live-search/types";

/**
 * Selects two candidates from an already-ranked list, preferring a second
 * retailer without changing the list's upstream rank order.
 */
export function selectDefaultCrossRetailerComparison(
  candidates: readonly DecisionCandidate[],
): readonly DecisionCandidate[] {
  const first = candidates[0];
  if (first === undefined) {
    return [];
  }

  const fromAnotherRetailer = candidates.find(
    (candidate) =>
      candidate.key !== first.key &&
      candidate.retailer.key !== first.retailer.key,
  );
  const second =
    fromAnotherRetailer ??
    candidates.find((candidate) => candidate.key !== first.key);

  return second === undefined ? [first] : [first, second];
}
