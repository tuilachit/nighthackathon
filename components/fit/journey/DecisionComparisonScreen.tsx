"use client";

import { useState } from "react";
import type { SpaceMeasurement } from "@/lib/catalog-types";
import type { DecisionCandidate } from "@/lib/live-search/types";
import { buildComparisonVerdict, shortName } from "@/lib/live-search/comparison-verdict";
import { MeasurementEnvelopeDiagram } from "../MeasurementEnvelopeDiagram";
import {
  accessBasisLabel,
  candidateDecisionReason,
  formatDimensions,
  formatListedPrice,
  formatObservedDate,
  formatPackage,
  provenanceSourceLabel,
  TIER_PRESENTATION,
} from "./presentation";

export interface DecisionComparisonScreenProps {
  readonly measurement: SpaceMeasurement;
  readonly candidates: readonly [DecisionCandidate, DecisionCandidate];
  readonly selectedCandidateKey?: string;
  readonly onSelectCandidate?: (candidateKey: string) => void;
  readonly onContinue: (candidate: DecisionCandidate) => void;
  readonly onRetailerOutbound?: (candidate: DecisionCandidate) => void;
  readonly continueLabel?: string;
  /** Optional model-written take. The deterministic verdict renders regardless. */
  readonly aiInsight?: string;
  readonly aiInsightPending?: boolean;
}

/**
 * Compares two already-evaluated products against one immutable measurement.
 * It is deliberately presentation-only: no fit, access, or rank values change.
 */
export function DecisionComparisonScreen({
  measurement,
  candidates,
  selectedCandidateKey,
  onSelectCandidate,
  onContinue,
  onRetailerOutbound,
  continueLabel,
  aiInsight,
  aiInsightPending,
}: DecisionComparisonScreenProps): React.JSX.Element {
  const [first, second] = candidates;
  const verdict = buildComparisonVerdict(first, second);
  const [internalSelection, setInternalSelection] = useState(first.key);
  const resolvedSelection = candidates.find(
    (candidate) => candidate.key === (selectedCandidateKey ?? internalSelection),
  ) ?? first;
  const clearanceDifference = Math.abs(
    first.fit.minimumClearanceMm - second.fit.minimumClearanceMm,
  );
  const clearanceLeader = first.fit.minimumClearanceMm === second.fit.minimumClearanceMm
    ? undefined
    : first.fit.minimumClearanceMm > second.fit.minimumClearanceMm
      ? first
      : second;

  return (
    <section aria-labelledby="decision-comparison-title" className="pb-24">
      <header className="border-b border-[#17221f]/30 pb-3">
        <p className="fit-data text-[9px] font-bold uppercase tracking-[0.09em] text-[#17221f]/65">
          Two products · one measured envelope
        </p>
        <h1
          id="decision-comparison-title"
          className="fit-display mt-1 text-2xl font-bold tracking-[-0.035em] text-[#17221f]"
        >
          Clearance comparison
        </h1>
        <p className="mt-2 max-w-[62ch] text-xs leading-5 text-[#17221f]/68">
          The same room and access measurements are held constant for both products.
        </p>
      </header>

      <section
        aria-labelledby="shared-envelope-title"
        className="mt-4 border border-[#17221f] bg-white"
      >
        <div className="border-b border-[#17221f]/20 px-3 py-3">
          <h2 id="shared-envelope-title" className="text-sm font-bold text-[#17221f]">
            Shared measured envelope
          </h2>
          <p className="fit-data mt-1 text-[9px] font-bold text-[#17221f]/65">
            {formatDimensions(measurement)}
            {measurement.accessWidthMm === undefined
              ? " · access not assessed"
              : ` · ${measurement.accessWidthMm} mm access`}
          </p>
        </div>
        <MeasurementEnvelopeDiagram measurement={measurement} />

        <div className="grid grid-cols-2 border-t border-[#17221f]/20">
          {candidates.map((candidate) => (
            <ClearanceDrawing key={candidate.key} candidate={candidate} />
          ))}
        </div>

        <div className="border-t border-[#17221f]/20 bg-[#f4f7f5] px-3 py-3 text-center">
          <p className="fit-data text-[8px] font-bold uppercase tracking-[0.09em] text-[#17221f]/65">
            Minimum-clearance difference
          </p>
          <p className="fit-data mt-1 text-xl font-bold text-[#17221f]">
            {clearanceDifference} mm
          </p>
          <p className="mt-1 text-[10px] leading-4 text-[#17221f]/65">
            {clearanceLeader === undefined
              ? "Both products have the same minimum clearance."
              : `${clearanceLeader.name} has the higher minimum-clearance value.`}
          </p>
        </div>
      </section>

      <section
        aria-labelledby="decision-support-title"
        className="mt-4 border border-[#17221f] bg-white"
      >
        <div className="border-b border-[#17221f]/20 px-3 py-3">
          <h2 id="decision-support-title" className="text-sm font-bold text-[#17221f]">
            Which one, and why
          </h2>
          <p className="mt-2 text-xs font-bold leading-5 text-[#17221f]">
            {verdict.summary}
          </p>
        </div>
        {verdict.factors.length > 0 ? (
          <ul className="space-y-1.5 px-3 py-3">
            {verdict.factors.map((factor) => (
              <li key={factor.kind} className="flex gap-2 text-[11px] leading-4 text-[#17221f]/80">
                <span aria-hidden className="fit-data text-[9px] font-bold uppercase tracking-[0.09em] text-[#17221f]/50">
                  {factor.kind === "footprint" ? "floor" : factor.kind}
                </span>
                <span>{factor.statement}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {aiInsight !== undefined || aiInsightPending === true ? (
          <div className="border-t border-[#17221f]/20 bg-[#f4f7f5] px-3 py-3">
            <p className="fit-data text-[8px] font-bold uppercase tracking-[0.09em] text-[#17221f]/65">
              AI take · uses only the verified numbers above
            </p>
            <p aria-live="polite" className="mt-1 text-[11px] leading-4 text-[#17221f]/80">
              {aiInsight ?? `Weighing ${shortName(first)} against ${shortName(second)}…`}
            </p>
          </div>
        ) : null}
      </section>

      <div className="mt-4 grid grid-cols-2 border border-[#17221f]/25 bg-white">
        {candidates.map((candidate) => (
          <ComparisonProduct
            key={candidate.key}
            candidate={candidate}
            selected={candidate.key === resolvedSelection.key}
            onSelect={() => {
              setInternalSelection(candidate.key);
              onSelectCandidate?.(candidate.key);
            }}
            onRetailerOutbound={onRetailerOutbound}
          />
        ))}
      </div>

      <div className="fit-comparison-tray sticky bottom-3 z-20 mt-4 border border-[#17221f] bg-white p-2.5">
        <button
          type="button"
          onClick={() => onContinue(resolvedSelection)}
          className="min-h-12 w-full cursor-pointer bg-[#17221f] px-4 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f]"
        >
          {continueLabel ?? `Continue with ${resolvedSelection.name}`}
        </button>
      </div>
    </section>
  );
}

function ClearanceDrawing({
  candidate,
}: {
  readonly candidate: DecisionCandidate;
}): React.JSX.Element {
  const tier = TIER_PRESENTATION[candidate.fitStatus];
  const clearances = [
    ["W", candidate.fit.widthClearanceMm],
    ["H", candidate.fit.heightClearanceMm],
    ["D", candidate.fit.depthClearanceMm],
  ] as const;

  return (
    <figure
      className={`m-0 min-w-0 border-t-[3px] p-2.5 first:border-r first:border-r-[#17221f]/20 ${tier.borderClass}`}
      aria-label={`${candidate.name} clearance drawing`}
    >
      <figcaption className="min-h-9 truncate text-[10px] font-bold leading-4 text-[#17221f]">
        {candidate.name}
      </figcaption>
      <div className="mt-2 space-y-1.5">
        {clearances.map(([axis, value]) => (
          <div key={axis}>
            <p className="fit-data text-[7px] font-bold uppercase text-[#17221f]/65">
              {axis} clearance
            </p>
            <div
              className={`fit-dimension-annotation ${tier.textClass}`}
              style={{ color: tier.colorHex }}
              aria-label={`${axis} axis clearance ${value} millimetres`}
            >
              <strong className="fit-dimension-annotation__value fit-data bg-white text-[9px]">
                {value} mm
              </strong>
            </div>
          </div>
        ))}
      </div>
      <p className={`fit-data mt-1 text-center text-xs font-bold ${tier.textClass}`}>
        {candidate.fit.minimumClearanceMm} mm minimum
      </p>
    </figure>
  );
}

function ComparisonProduct({
  candidate,
  selected,
  onSelect,
  onRetailerOutbound,
}: {
  readonly candidate: DecisionCandidate;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onRetailerOutbound?: (candidate: DecisionCandidate) => void;
}): React.JSX.Element {
  const tier = TIER_PRESENTATION[candidate.fitStatus];

  return (
    <article className="min-w-0 border-r border-[#17221f]/20 p-2.5 last:border-r-0">
      <ProductImage candidate={candidate} />
      <p className="fit-data mt-2 text-[8px] font-bold uppercase tracking-[0.07em] text-[#17221f]/65">
        {candidate.retailer.label}
      </p>
      <h2 className="mt-1 min-h-12 text-[11px] font-bold leading-4 text-[#17221f]">
        {candidate.name}
      </h2>
      <p className="fit-data mt-2 text-base font-bold text-[#17221f]">
        {formatListedPrice(candidate)}
      </p>
      <p className="fit-data mt-0.5 text-[7px] font-bold uppercase tracking-[0.06em] text-[#17221f]/65">
        {candidate.price.currency} listed
      </p>
      <p className={`fit-data mt-2 text-[9px] font-bold leading-4 ${tier.textClass}`}>
        {candidateDecisionReason(candidate)}
      </p>

      <label className={`mt-3 flex min-h-11 cursor-pointer items-center gap-2 border px-2 text-[9px] font-bold ${selected ? "border-[#17221f] bg-[#17221f] text-white" : "border-[#17221f]/30 bg-white text-[#17221f]"}`}>
        <input
          type="radio"
          name="comparison-product"
          checked={selected}
          onChange={onSelect}
        />
        Choose this product
      </label>

      <details className="group mt-3 border-t border-[#17221f]/20 pt-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[9px] font-bold text-[#17221f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f]">
          Source facts
          <span aria-hidden="true" className="text-sm group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-2 pb-2 text-[9px] leading-4 text-[#17221f]/68">
          <ComparisonFact label="Assembled" value={formatDimensions(candidate.assembledDimensions)} />
          <div>
            <p className="fit-data text-[7px] font-bold uppercase tracking-[0.07em] text-[#17221f]/65">
              Delivery packages
            </p>
            {candidate.packages.length === 0 ? (
              <p className="mt-0.5">Package dimensions unavailable.</p>
            ) : (
              <ul className="mt-0.5 space-y-1">
                {candidate.packages.map((deliveryPackage, index) => (
                  <li key={`${deliveryPackage.label ?? "package"}-${index}`}>
                    {formatPackage(deliveryPackage)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ComparisonFact label="Access" value={accessBasisLabel(candidate)} />
          <ComparisonFact
            label="Provenance"
            value={`${provenanceSourceLabel(candidate.provenance.source)} · ${candidate.provenance.freshness} · ${formatObservedDate(candidate.provenance.observedAt)}`}
          />
          <ComparisonFact label="Evidence" value={candidate.provenance.evidence} />
        </div>
      </details>

      <a
        href={candidate.productUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onRetailerOutbound?.(candidate)}
        className="mt-2 flex min-h-11 items-center justify-center border border-[#17221f]/30 bg-white px-2 text-center text-[9px] font-bold text-[#17221f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f]"
      >
        Retailer source ↗
      </a>
    </article>
  );
}

function ProductImage({
  candidate,
}: {
  readonly candidate: DecisionCandidate;
}): React.JSX.Element {
  if (candidate.imageUrl === undefined) {
    return (
      <div
        role="img"
        aria-label={`${candidate.name} image unavailable`}
        className="fit-data flex aspect-[4/3] items-center justify-center border border-[#17221f]/20 bg-[#f4f7f5] p-1 text-center text-[7px] font-bold uppercase text-[#17221f]/65"
      >
        Image unavailable
      </div>
    );
  }

  return (
    // Candidate image hosts are validated at ingestion and cannot use one static Next allowlist.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidate.imageUrl}
      alt={`${candidate.name} retailer product photo`}
      width={220}
      height={165}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="aspect-[4/3] w-full border border-[#17221f]/20 bg-[#f4f7f5] object-contain"
    />
  );
}

function ComparisonFact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div>
      <p className="fit-data text-[7px] font-bold uppercase tracking-[0.07em] text-[#17221f]/65">
        {label}
      </p>
      <p className="mt-0.5 break-words">{value}</p>
    </div>
  );
}
