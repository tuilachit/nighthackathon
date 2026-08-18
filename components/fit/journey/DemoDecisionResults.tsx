"use client";

import { useCallback, useMemo } from "react";
import type {
  CatalogProduct,
  SpaceMeasurement,
} from "@/lib/catalog-types";
import type {
  CandidateFitStatus,
  DecisionCandidate,
} from "@/lib/live-search/types";
import { searchProducts } from "@/lib/product-ranker";
import { parseFurnitureQuery } from "@/lib/query-parser";
import { DecisionResults } from "./DecisionResults";
import { adaptProductSearchResultsToDecisionCandidates } from "./demo-adapter";

export interface DemoDecisionResultsProps {
  readonly products: readonly CatalogProduct[];
  readonly measurement: SpaceMeasurement;
  readonly queryText: string;
  readonly selectedTier: CandidateFitStatus;
  readonly pageIndex: number;
  readonly comparedProductIds: readonly string[];
  readonly onSelectTier: (tier: CandidateFitStatus) => void;
  readonly onPageChange: (pageIndex: number) => void;
  readonly onToggleCompare: (productId: string) => void;
  readonly onOpenComparison: (
    candidates: readonly [DecisionCandidate, DecisionCandidate],
  ) => void;
  readonly onRetailerOutbound?: (candidate: DecisionCandidate) => void;
}

/**
 * Runs the existing offline parser and product ranker, then presents their
 * immutable output through the unified results UI. It performs no I/O.
 */
export function DemoDecisionResults({
  products,
  measurement,
  queryText,
  selectedTier,
  pageIndex,
  comparedProductIds,
  onSelectTier,
  onPageChange,
  onToggleCompare,
  onOpenComparison,
  onRetailerOutbound,
}: DemoDecisionResultsProps): React.JSX.Element {
  const candidates = useMemo(
    () => adaptProductSearchResultsToDecisionCandidates(
      searchProducts(products, measurement, parseFurnitureQuery(queryText)),
    ),
    [measurement, products, queryText],
  );
  const candidateByKey = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.key, candidate])),
    [candidates],
  );
  const handleOpenComparison = useCallback((
    candidateKeys: readonly [string, string],
  ) => {
    const first = candidateByKey.get(candidateKeys[0]);
    const second = candidateByKey.get(candidateKeys[1]);
    if (first !== undefined && second !== undefined) {
      onOpenComparison([first, second]);
    }
  }, [candidateByKey, onOpenComparison]);

  return (
    <DecisionResults
      candidates={candidates}
      selectedTier={selectedTier}
      pageIndex={pageIndex}
      comparedKeys={comparedProductIds}
      onSelectTier={onSelectTier}
      onPageChange={onPageChange}
      onToggleCompare={onToggleCompare}
      onOpenComparison={handleOpenComparison}
      onRetailerOutbound={onRetailerOutbound}
    />
  );
}
