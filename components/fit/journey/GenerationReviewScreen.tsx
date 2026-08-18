"use client";

import type { DecisionCandidate } from "@/lib/live-search/types";
import {
  accessBasisLabel,
  formatDimensions,
  formatListedPrice,
  formatObservedDate,
  provenanceSourceLabel,
} from "./presentation";
import { JourneyShell } from "./JourneyShell";

interface GenerationReviewScreenProps {
  readonly candidate: DecisionCandidate;
  readonly busy?: boolean;
  readonly offline?: boolean;
  readonly error?: string;
  readonly approvalAvailable?: boolean;
  onApprove(candidate: DecisionCandidate): void;
}

/** Freezes the chosen fit and explains the paid generation boundary. */
export function GenerationReviewScreen({
  candidate,
  busy = false,
  offline = false,
  error,
  approvalAvailable = true,
  onApprove,
}: GenerationReviewScreenProps): React.JSX.Element {
  const canGenerate = candidate.fitStatus === "fits" && approvalAvailable;
  return (
    <JourneyShell
      title="Review for 3D"
      support="Check the source and listed size before approving generation."
      backHref={`/fit/jobs/${encodeURIComponent(candidate.workflowId)}/compare`}
      backLabel="Comparison"
      status="Approval"
    >
      <article className="border border-[#17221f]/25 bg-white">
        {candidate.imageUrl === undefined ? null : (
          // Runtime images are restricted and cached by the live-search service.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={candidate.imageUrl}
            alt={`${candidate.name} retailer product photo`}
            width={430}
            height={260}
            className="h-48 w-full border-b border-[#17221f]/20 bg-[#f4f7f5] object-contain"
          />
        )}
        <div className="p-4">
          <p className="fit-data text-[9px] font-bold uppercase tracking-[0.08em] text-[#17221f]/65">
            {candidate.retailer.label}
          </p>
          <h2 className="mt-1 text-lg font-bold">{candidate.name}</h2>
          <p className="fit-data mt-2 text-xl font-bold">
            {formatListedPrice(candidate)}
          </p>
          <div className="fit-dimension-annotation mt-4 text-center text-[#3f6b57]">
            <span className="fit-dimension-annotation__value fit-data text-[11px] font-bold">
              {formatDimensions(candidate.assembledDimensions)}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 border-t border-[#17221f]/20 pt-4 text-xs leading-5">
            <Fact label="Fit" value={`${candidate.fit.minimumClearanceMm} mm minimum clearance`} />
            <Fact label="Access" value={accessBasisLabel(candidate)} />
            <Fact
              label="Source"
              value={`${provenanceSourceLabel(candidate.provenance.source)} · ${formatObservedDate(candidate.provenance.observedAt)}`}
            />
          </dl>
        </div>
      </article>

      <aside className="mt-4 border-l-2 border-[#8a632d] pl-3 text-xs leading-5 text-[#17221f]/75">
        The appearance is AI-generated, not an exact replica. Only its outer bounding-box scale is checked to the listed dimensions. Generation can take several minutes.
      </aside>

      {error === undefined ? null : (
        <p className="mt-4 text-sm font-semibold text-[#8a4e48]" role="alert">
          {error}
        </p>
      )}

      <div className="mt-auto pt-8">
        <button
          type="button"
          disabled={!canGenerate || busy || offline}
          className="min-h-12 w-full bg-[#17221f] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => onApprove(candidate)}
        >
          {busy ? "Approving…" : "Approve and generate 3D"}
        </button>
        {candidate.fitStatus !== "fits" ? (
          <p className="mt-3 text-center text-xs font-semibold text-[#8a4e48]">
            Generation is available only when there is no known fit or access failure.
          </p>
        ) : !approvalAvailable ? (
          <p className="mt-3 text-center text-xs font-semibold text-[#8a632d]">
            Generation is unavailable while retailer coverage is incomplete.
          </p>
        ) : null}
      </div>
    </JourneyShell>
  );
}

function Fact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div>
      <dt className="fit-data text-[8px] font-bold uppercase tracking-[0.08em] text-[#17221f]/65">
        {label}
      </dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
