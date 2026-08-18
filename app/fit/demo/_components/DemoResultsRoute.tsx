"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CatalogProduct } from "@/lib/catalog-types";
import type { DecisionCandidate } from "@/lib/live-search/types";
import { DemoDecisionResults } from "@/components/fit/journey/DemoDecisionResults";
import {
  buildDemoComparisonHref,
  buildDemoResultsHref,
  type DemoResultsRouteState,
} from "../demo-route-state";

interface DemoResultsRouteProps {
  readonly products: readonly CatalogProduct[];
  readonly state: DemoResultsRouteState;
}

/** Binds URL-owned demo state to the deterministic result presentation only. */
export function DemoResultsRoute({
  products,
  state,
}: DemoResultsRouteProps): React.JSX.Element {
  const router = useRouter();
  const { measurement } = state;

  function replaceResults(nextState: DemoResultsRouteState): void {
    router.replace(buildDemoResultsHref(nextState), { scroll: false });
  }

  return (
    <main
      id="fit-main"
      data-fit-route-surface="demo-results"
      className="min-h-screen bg-[#f4f7f5] px-3 pb-20 pt-16 text-[#17221f] sm:px-5"
    >
      <div className="mx-auto w-full max-w-[760px]">
        <header className="mb-4 flex items-start justify-between gap-4 border-b border-[#17221f]/30 pb-4">
          <div>
            <p className="fit-data text-[9px] font-bold uppercase tracking-[0.09em] text-[#17221f]/65">
              Demo catalog · fixed measured envelope
            </p>
            <h1 className="fit-display mt-1 text-2xl font-bold tracking-[-0.035em]">
              See what clears the room and doorway
            </h1>
            <p className="fit-data mt-2 text-[10px] font-bold text-[#17221f]/65">
              {measurement.widthMm} W × {measurement.heightMm} H × {measurement.depthMm} D mm
              {measurement.accessWidthMm === undefined
                ? " · access not assessed"
                : ` · ${measurement.accessWidthMm} mm doorway`}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#17221f]/68">
              Request: “{state.queryText}”
            </p>
          </div>
          <Link
            href="/fit/space"
            className="inline-flex min-h-11 shrink-0 items-center border border-[#17221f]/35 bg-white px-3 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f]"
          >
            Use my space
          </Link>
        </header>

        <DemoDecisionResults
          products={products}
          measurement={measurement}
          queryText={state.queryText}
          selectedTier={state.selectedTier}
          pageIndex={state.pageIndex}
          comparedProductIds={state.comparedProductIds}
          onSelectTier={(selectedTier) => {
            replaceResults({ ...state, selectedTier, pageIndex: 0 });
          }}
          onPageChange={(pageIndex) => {
            replaceResults({ ...state, pageIndex });
          }}
          onToggleCompare={(productId) => {
            const comparedProductIds = state.comparedProductIds.includes(productId)
              ? state.comparedProductIds.filter((candidateId) => candidateId !== productId)
              : [...state.comparedProductIds, productId].slice(0, 2);
            replaceResults({ ...state, comparedProductIds });
          }}
          onOpenComparison={(candidates) => {
            router.push(buildDemoComparisonHref(state, candidateKeys(candidates)));
          }}
        />
      </div>
    </main>
  );
}

function candidateKeys(
  candidates: readonly [DecisionCandidate, DecisionCandidate],
): readonly [string, string] {
  return [candidates[0].key, candidates[1].key];
}
