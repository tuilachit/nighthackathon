"use client";

import type { LiveSearchWorkflow, WorkflowState } from "@/lib/live-search/types";
import { JourneyShell } from "./JourneyShell";

interface WorkflowWaitingScreenProps {
  readonly workflow?: LiveSearchWorkflow;
  readonly state: WorkflowState;
  readonly cancelling?: boolean;
  readonly error?: string;
  readonly offline?: boolean;
  onCancel(): void;
  onRetry(): void;
}

/** Shows one truthful durable workflow stage with no fabricated percentage. */
export function WorkflowWaitingScreen({
  workflow,
  state,
  cancelling = false,
  error,
  offline = false,
  onCancel,
  onRetry,
}: WorkflowWaitingScreenProps): React.JSX.Element {
  const stage = waitingStage(state);
  return (
    <JourneyShell
      title={stage.title}
      support={stage.support}
      backHref={workflow === undefined
        ? "/fit/search"
        : `/fit/search?job=${encodeURIComponent(workflow.id)}`}
      backLabel="Search"
      status="Live check"
    >
      <section
        aria-live="polite"
        aria-busy={isWaitingState(state)}
        className="mt-2 border border-[#17221f]/25 bg-[#f4f7f5] p-4"
      >
        <div className="fit-dimension-annotation text-center text-[#3f6b57]">
          <span className="fit-dimension-annotation__value fit-data bg-[#f4f7f5] text-[11px] font-bold uppercase tracking-[0.06em]">
            {stage.instrument}
          </span>
        </div>
        {workflow === undefined ? null : (
          <dl className="mt-5 grid gap-3 border-t border-[#17221f]/20 pt-4 text-xs">
            <div>
              <dt className="fit-data text-[8px] font-bold uppercase tracking-[0.08em] text-[#17221f]/65">
                Request
              </dt>
              <dd className="mt-1 font-semibold">{workflow.queryText}</dd>
            </div>
            <div>
              <dt className="fit-data text-[8px] font-bold uppercase tracking-[0.08em] text-[#17221f]/65">
                Space
              </dt>
              <dd className="fit-data mt-1 font-bold">
                {workflow.measurement.widthMm} W × {workflow.measurement.heightMm} H × {workflow.measurement.depthMm} D mm
              </dd>
            </div>
          </dl>
        )}
      </section>

      <p className="mt-4 text-center text-xs leading-5 text-[#17221f]/65">
        {offline
          ? "Status updates resume when this device reconnects."
          : "Fresh checks usually take under a minute."}
      </p>

      {error === undefined ? null : (
        <div className="mt-5 border-l-2 border-[#8a4e48] pl-3" role="alert">
          <p className="text-sm font-semibold text-[#8a4e48]">{error}</p>
          <button
            type="button"
            className="mt-2 min-h-11 text-sm font-bold underline decoration-[#8a4e48]/40 underline-offset-4"
            onClick={onRetry}
          >
            Retry status
          </button>
        </div>
      )}

      {isWaitingState(state) ? (
        <button
          type="button"
          disabled={cancelling || offline}
          className="mt-auto min-h-11 pt-8 text-sm font-bold text-[#8a4e48] underline decoration-[#8a4e48]/35 underline-offset-4 disabled:opacity-45"
          onClick={onCancel}
        >
          {cancelling ? "Cancelling…" : "Cancel search"}
        </button>
      ) : null}
    </JourneyShell>
  );
}

export function isWaitingState(state: WorkflowState): boolean {
  return (
    state === "created" ||
    state === "queued" ||
    state === "searching" ||
    state === "validating"
  );
}

function waitingStage(state: WorkflowState): {
  readonly title: string;
  readonly support: string;
  readonly instrument: string;
} {
  if (state === "created" || state === "queued") {
    return {
      title: "Checking recent results",
      support: "Looking for an exact retailer observation from the last 24 hours.",
      instrument: "Cache check",
    };
  }
  if (state === "searching") {
    return {
      title: "Checking retailers",
      support: "The agent is reading the current retailer product pages.",
      instrument: "Retailer search",
    };
  }
  if (state === "validating") {
    return {
      title: "Validating dimensions",
      support: "Source dimensions are being checked before the fit rules run.",
      instrument: "Fit check",
    };
  }
  if (state === "cancelled") {
    return {
      title: "Search cancelled",
      support: "This job is closed and late provider results cannot resume it.",
      instrument: "Cancelled",
    };
  }
  return {
    title: "Search needs attention",
    support: "The durable job is safe. Retry its status or start again.",
    instrument: state.replaceAll("_", " "),
  };
}
