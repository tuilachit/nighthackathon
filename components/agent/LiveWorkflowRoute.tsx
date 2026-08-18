"use client";

import dynamic from "next/dynamic";
import type { FitWorkflowSurface } from "@/lib/fit-route-contract";

const LiveSearchExperience = dynamic(
  () =>
    import("./LiveSearchExperience").then(
      (module) => module.LiveSearchExperience,
    ),
  {
    ssr: false,
    loading: () => (
      <section
        aria-busy="true"
        aria-label="Restoring live furniture search"
        className="mx-auto min-h-[560px] w-full max-w-[430px] border border-[#17221f]/30 bg-white p-5"
      >
        <p className="fit-data text-xs font-bold">Restoring your retailer check…</p>
      </section>
    ),
  },
);

export interface LiveWorkflowRouteProps {
  readonly workflowId?: string;
  readonly surface?: FitWorkflowSurface;
  readonly candidateId?: string;
}

/** Keeps provider and session code out of the static measurement routes. */
export function LiveWorkflowRoute({
  workflowId,
  surface = "workflow",
  candidateId,
}: LiveWorkflowRouteProps): React.JSX.Element {
  return (
    <main
      id="fit-main"
      data-fit-route-surface={surface}
      className="min-h-screen bg-[#f4f7f5] px-4 pb-20 pt-20 text-[#17221f] sm:px-6"
    >
      <LiveSearchExperience
        initialWorkflowId={workflowId}
        initialSurface={surface}
        initialCandidateId={candidateId}
      />
    </main>
  );
}
