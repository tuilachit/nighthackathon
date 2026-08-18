"use client";

import dynamic from "next/dynamic";
import type { CandidateFitStatus } from "@/lib/live-search/types";
import type { FitWorkflowSurface } from "@/lib/fit-route-contract";

const LiveWorkflowController = dynamic(
  () =>
    import("./LiveWorkflowController").then(
      (module) => module.LiveWorkflowController,
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
  readonly surface?: FitWorkflowSurface | "search" | "model";
  readonly candidateId?: string;
  readonly initialTier?: CandidateFitStatus;
  readonly initialPageIndex?: number;
  readonly initialMode?: "describe" | "link";
  readonly initialValue?: string;
}

/** Keeps provider and session code out of the static measurement routes. */
export function LiveWorkflowRoute({
  workflowId,
  surface = workflowId === undefined ? "search" : "workflow",
  candidateId,
  initialTier,
  initialPageIndex,
  initialMode,
  initialValue,
}: LiveWorkflowRouteProps): React.JSX.Element {
  return <LiveWorkflowController
    workflowId={workflowId}
    surface={surface}
    candidateId={candidateId}
    initialTier={initialTier}
    initialPageIndex={initialPageIndex}
    initialMode={initialMode}
    initialValue={initialValue}
  />;
}
