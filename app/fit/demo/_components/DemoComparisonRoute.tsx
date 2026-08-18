"use client";

import { useRouter } from "next/navigation";
import type { SpaceMeasurement } from "@/lib/catalog-types";
import type { DecisionCandidate } from "@/lib/live-search/types";
import { DecisionComparisonScreen } from "@/components/fit/journey/DecisionComparisonScreen";

interface DemoComparisonRouteProps {
  readonly measurement: SpaceMeasurement;
  readonly candidates: readonly [DecisionCandidate, DecisionCandidate];
  readonly resultsHref: string;
}

/** Keeps the static comparison on its own URL without starting a workflow. */
export function DemoComparisonRoute({
  measurement,
  candidates,
  resultsHref,
}: DemoComparisonRouteProps): React.JSX.Element {
  const router = useRouter();
  return (
    <main
      id="fit-main"
      data-fit-route-surface="demo-comparison"
      className="min-h-screen bg-[#f4f7f5] px-3 pb-20 pt-16 text-[#17221f] sm:px-5"
    >
      <div className="mx-auto w-full max-w-[760px]">
        <DecisionComparisonScreen
          measurement={measurement}
          candidates={candidates}
          onContinue={() => router.push(resultsHref)}
          continueLabel="Back to demo results"
        />
      </div>
    </main>
  );
}
