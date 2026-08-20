"use client";

import Link from "next/link";
import type {
  CandidateFitStatus,
  DecisionCandidate,
} from "@/lib/live-search/types";
import { DecisionCandidateCard } from "./DecisionCandidateCard";
import { selectDefaultCrossRetailerComparison } from "./comparison-selection";
import {
  TIER_ORDER,
  TIER_PRESENTATION,
} from "./presentation";

export const RESULTS_PAGE_SIZE = 6;

export interface DecisionResultsProps {
  readonly candidates: readonly DecisionCandidate[];
  readonly selectedTier: CandidateFitStatus;
  readonly pageIndex: number;
  readonly comparedKeys: readonly string[];
  readonly defaultComparisonKeys?: readonly string[];
  readonly defaultComparisonPending?: boolean;
  readonly onSelectTier: (tier: CandidateFitStatus) => void;
  readonly onPageChange: (pageIndex: number) => void;
  readonly onToggleCompare: (candidateKey: string) => void;
  readonly onOpenComparison: (
    candidateKeys: readonly [string, string],
  ) => void;
  readonly onRetailerOutbound?: (candidate: DecisionCandidate) => void;
}

/**
 * Presents evaluated candidates without re-running or altering fit, access, or
 * rank decisions. Pagination and tier selection are controlled by the route.
 */
export function DecisionResults({
  candidates,
  selectedTier,
  pageIndex,
  comparedKeys,
  defaultComparisonKeys,
  defaultComparisonPending = false,
  onSelectTier,
  onPageChange,
  onToggleCompare,
  onOpenComparison,
  onRetailerOutbound,
}: DecisionResultsProps): React.JSX.Element {
  const tierCounts = countTiers(candidates);
  const activeCandidates = candidates.filter(
    (candidate) => candidate.fitStatus === selectedTier,
  );
  const pageCount = Math.max(1, Math.ceil(activeCandidates.length / RESULTS_PAGE_SIZE));
  const activePageIndex = Math.min(Math.max(pageIndex, 0), pageCount - 1);
  const pageStart = activePageIndex * RESULTS_PAGE_SIZE;
  const visibleCandidates = activeCandidates.slice(
    pageStart,
    pageStart + RESULTS_PAGE_SIZE,
  );
  const comparePair = resolveComparePair(
    candidates,
    comparedKeys,
    defaultComparisonKeys,
  );
  const compareState = comparisonState(
    comparedKeys,
    comparePair,
    defaultComparisonPending,
  );

  return (
    <section aria-labelledby="decision-results-title" className="relative">
      <div className="flex items-end justify-between gap-3 border-b border-[#17221f]/30 pb-3">
        <div>
          <h2
            id="decision-results-title"
            className="fit-display text-xl font-bold tracking-[-0.03em] text-[#17221f]"
          >
            Products checked against your space
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#17221f]/65">
            Every dimension and price comes from the retailer’s page.
          </p>
        </div>
        <span className="fit-data shrink-0 text-[9px] font-bold uppercase tracking-[0.08em] text-[#17221f]/65">
          {candidates.length} checked
        </span>
      </div>

      <div
        role="tablist"
        aria-label="Product result tiers"
        className="mt-3 grid grid-cols-3 border border-[#17221f]/25 bg-white"
      >
        {TIER_ORDER.map((tierKey) => {
          const presentation = TIER_PRESENTATION[tierKey];
          const isSelected = tierKey === selectedTier;
          return (
            <button
              key={tierKey}
              type="button"
              role="tab"
              id={`decision-tier-tab-${tierKey}`}
              aria-selected={isSelected}
              aria-controls={`decision-tier-panel-${tierKey}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelectTier(tierKey)}
              onKeyDown={(event) => {
                if (
                  event.key !== "ArrowLeft" &&
                  event.key !== "ArrowRight" &&
                  event.key !== "Home" &&
                  event.key !== "End"
                ) {
                  return;
                }
                event.preventDefault();
                const nextTier = keyboardTier(tierKey, event.key);
                onSelectTier(nextTier);
                document.getElementById(`decision-tier-tab-${nextTier}`)?.focus();
              }}
              className={`min-h-12 cursor-pointer border-b-[3px] px-2 py-2 text-left focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#17221f] ${
                isSelected
                  ? `${presentation.borderClass} ${presentation.surfaceClass}`
                  : "border-transparent bg-white hover:bg-[#f4f7f5]"
              }`}
            >
              <span className="block text-[11px] font-bold text-[#17221f]">
                {presentation.label}
              </span>
              <span className={`fit-data mt-0.5 block text-[9px] font-bold ${isSelected ? presentation.textClass : "text-[#17221f]/65"}`}>
                {tierCounts[tierKey]}
              </span>
            </button>
          );
        })}
      </div>

      <section
        role="tabpanel"
        id={`decision-tier-panel-${selectedTier}`}
        aria-labelledby={`decision-tier-tab-${selectedTier}`}
        className="mt-3"
      >
        <div className="flex min-h-8 items-center justify-between gap-3">
          <p className="fit-data text-[9px] font-bold uppercase tracking-[0.08em] text-[#17221f]/65">
            {TIER_PRESENTATION[selectedTier].label} · {activeCandidates.length}
          </p>
          {activeCandidates.length > RESULTS_PAGE_SIZE ? (
            <p className="fit-data text-[9px] font-bold text-[#17221f]/65">
              {pageStart + 1}–{Math.min(pageStart + RESULTS_PAGE_SIZE, activeCandidates.length)} of {activeCandidates.length}
            </p>
          ) : null}
        </div>

        {visibleCandidates.length === 0 ? (
          <EmptyTier tier={selectedTier} />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {visibleCandidates.map((candidate) => {
              const isCompared = comparedKeys.includes(candidate.key);
              return (
                <DecisionCandidateCard
                  key={candidate.key}
                  candidate={candidate}
                  isCompared={isCompared}
                  compareDisabled={comparedKeys.length >= 2 && !isCompared}
                  onToggleCompare={onToggleCompare}
                  onRetailerOutbound={onRetailerOutbound}
                />
              );
            })}
          </div>
        )}

        {activeCandidates.length > RESULTS_PAGE_SIZE ? (
          <nav
            aria-label={`${TIER_PRESENTATION[selectedTier].label} result pages`}
            className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-y border-[#17221f]/20 py-2"
          >
            <button
              type="button"
              disabled={activePageIndex === 0}
              onClick={() => onPageChange(activePageIndex - 1)}
              className="min-h-11 cursor-pointer justify-self-start border border-[#17221f]/30 bg-white px-3 text-xs font-bold text-[#17221f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous 6
            </button>
            <span className="fit-data text-[9px] font-bold text-[#17221f]/65">
              {activePageIndex + 1} / {pageCount}
            </span>
            <button
              type="button"
              disabled={activePageIndex >= pageCount - 1}
              onClick={() => onPageChange(activePageIndex + 1)}
              className="min-h-11 cursor-pointer justify-self-end border border-[#17221f]/30 bg-white px-3 text-xs font-bold text-[#17221f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next 6
            </button>
          </nav>
        ) : null}
      </section>

      {candidates.length < 2 ? (
        <div className="mt-4 flex items-center justify-between gap-3 border border-[#17221f]/30 bg-[#f4f7f5] p-3">
          <div className="min-w-0">
            <p className="fit-data text-[8px] font-bold uppercase tracking-[0.09em] text-[#17221f]/65">
              One validated match
            </p>
            <p className="mt-1 text-xs font-bold text-[#17221f]">
              Refine the search to compare products.
            </p>
          </div>
          <Link
            href="/fit/search"
            className="flex min-h-11 shrink-0 items-center border border-[#17221f] bg-white px-3 text-xs font-bold text-[#17221f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f]"
          >
            Refine search
          </Link>
        </div>
      ) : (
        <div className="fit-comparison-tray sticky bottom-3 z-20 mt-4 flex items-center justify-between gap-3 border border-[#17221f] bg-white p-2.5">
          <div className="min-w-0">
            <p className="fit-data text-[8px] font-bold uppercase tracking-[0.09em] text-[#17221f]/65">
              Compare in one envelope
            </p>
            <p className="mt-1 truncate text-xs font-bold text-[#17221f]">
              {compareState.label}
            </p>
          </div>
          <button
            type="button"
            disabled={comparePair.length !== 2 || compareState.disabled}
            onClick={() => {
              if (comparePair.length === 2) {
                onOpenComparison([comparePair[0].key, comparePair[1].key]);
              }
            }}
            className="min-h-11 shrink-0 cursor-pointer bg-[#17221f] px-4 text-xs font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f] disabled:cursor-not-allowed disabled:bg-[#17221f]/35"
          >
            {comparedKeys.length === 0
              ? "Compare top matches"
              : comparedKeys.length === 2
                ? "Compare 2 selected"
                : "Select one more"}
          </button>
        </div>
      )}
    </section>
  );
}

function countTiers(
  candidates: readonly DecisionCandidate[],
): Readonly<Record<CandidateFitStatus, number>> {
  return {
    fits: candidates.filter((candidate) => candidate.fitStatus === "fits").length,
    access_issue: candidates.filter(
      (candidate) => candidate.fitStatus === "access_issue",
    ).length,
    near_miss: candidates.filter(
      (candidate) => candidate.fitStatus === "near_miss",
    ).length,
  };
}

function keyboardTier(
  currentTier: CandidateFitStatus,
  key: "ArrowLeft" | "ArrowRight" | "Home" | "End",
): CandidateFitStatus {
  if (key === "Home") {
    return TIER_ORDER[0];
  }
  if (key === "End") {
    return TIER_ORDER[TIER_ORDER.length - 1];
  }
  const currentIndex = TIER_ORDER.indexOf(currentTier);
  const direction = key === "ArrowRight" ? 1 : -1;
  return TIER_ORDER[(currentIndex + direction + TIER_ORDER.length) % TIER_ORDER.length];
}

function resolveComparePair(
  candidates: readonly DecisionCandidate[],
  comparedKeys: readonly string[],
  defaultComparisonKeys?: readonly string[],
): readonly DecisionCandidate[] {
  if (comparedKeys.length > 0) {
    return comparedKeys
      .map((key) => candidates.find((candidate) => candidate.key === key))
      .filter((candidate): candidate is DecisionCandidate => candidate !== undefined);
  }
  if (defaultComparisonKeys !== undefined) {
    return defaultComparisonKeys
      .map((key) => candidates.find((candidate) => candidate.key === key))
      .filter((candidate): candidate is DecisionCandidate => candidate !== undefined);
  }
  const tierPrioritized = [
    ...candidates.filter((candidate) => candidate.fitStatus === "fits"),
    ...candidates.filter((candidate) => candidate.fitStatus === "access_issue"),
    ...candidates.filter((candidate) => candidate.fitStatus === "near_miss"),
  ];
  return selectDefaultCrossRetailerComparison(
    tierPrioritized,
  );
}

function comparisonState(
  comparedKeys: readonly string[],
  comparePair: readonly DecisionCandidate[],
  defaultComparisonPending: boolean,
): { readonly label: string; readonly disabled: boolean } {
  if (comparedKeys.length === 0) {
    if (defaultComparisonPending) {
      return { label: "Restoring linked product", disabled: true };
    }
    return comparePair.length === 2
      ? { label: "Two top matches ready", disabled: false }
      : { label: "Two products are needed", disabled: true };
  }
  if (comparedKeys.length === 1) {
    return { label: "Choose one more product", disabled: true };
  }
  if (comparedKeys.length === 2 && comparePair.length === 2) {
    return { label: "Two products ready", disabled: false };
  }
  return { label: "Choose exactly two products", disabled: true };
}

function EmptyTier({
  tier,
}: {
  readonly tier: CandidateFitStatus;
}): React.JSX.Element {
  const copy = tier === "fits"
    ? "No products cleared both checks in this search."
    : tier === "access_issue"
      ? "No products fit the room while failing the supplied access check."
      : "No measured-envelope near misses in this search.";

  return (
    <div className="border border-dashed border-[#17221f]/35 bg-white px-4 py-8 text-center">
      <p className="text-sm font-bold text-[#17221f]">{copy}</p>
    </div>
  );
}
