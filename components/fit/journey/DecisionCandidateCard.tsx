import type { DecisionCandidate } from "@/lib/live-search/types";
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

interface DecisionCandidateCardProps {
  readonly candidate: DecisionCandidate;
  readonly isCompared: boolean;
  readonly compareDisabled: boolean;
  readonly onToggleCompare: (candidateKey: string) => void;
  readonly onRetailerOutbound?: (candidate: DecisionCandidate) => void;
}

/** Compact decision card backed only by an already-evaluated candidate. */
export function DecisionCandidateCard({
  candidate,
  isCompared,
  compareDisabled,
  onToggleCompare,
  onRetailerOutbound,
}: DecisionCandidateCardProps): React.JSX.Element {
  const tier = TIER_PRESENTATION[candidate.fitStatus];

  return (
    <article
      className={`overflow-hidden rounded-sm border border-l-[3px] bg-white ${tier.borderClass}`}
      data-testid={`decision-candidate-${candidate.key}`}
    >
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[120px_minmax(0,1fr)]">
        <ProductImage candidate={candidate} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="fit-data border border-[#17221f]/25 bg-[#f4f7f5] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#17221f]/75">
              {candidate.retailer.label}
            </span>
            <span
              className={`fit-data border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] ${tier.borderClass} ${tier.surfaceClass} ${tier.textClass}`}
            >
              {tier.singularLabel}
            </span>
          </div>

          <h3 className="mt-2 break-words text-base font-bold leading-[1.2] tracking-[-0.015em] text-[#17221f]">
            {candidate.name}
          </h3>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="fit-data whitespace-nowrap text-xl font-bold leading-none text-[#17221f]">
              {formatListedPrice(candidate)}
            </p>
            <span className="fit-data text-[8px] font-bold uppercase tracking-[0.08em] text-[#17221f]/65">
              {candidate.price.currency} listed
            </span>
          </div>
          {candidate.fitStatus === "fits" ? null : (
            <p className={`fit-data mt-2 text-[10px] font-bold leading-4 ${tier.textClass}`}>
              {candidateDecisionReason(candidate)}
            </p>
          )}
        </div>
      </div>

      <div className={`border-y px-3 py-2.5 ${tier.borderClass} ${tier.surfaceClass}`}>
        <p className="fit-data text-[8px] font-bold uppercase tracking-[0.11em] text-[#17221f]/65">
          Minimum clearance
        </p>
        <div
          className="fit-dimension-annotation mt-1 text-center"
          style={{ color: tier.colorHex }}
          aria-label={`${candidate.fit.minimumClearanceMm} millimetres minimum clearance`}
        >
          <span className={`fit-dimension-annotation__value fit-data text-[12px] font-bold ${tier.textClass}`}>
            {candidate.fit.minimumClearanceMm} mm
          </span>
        </div>
      </div>

      <details className="group border-b border-[#17221f]/20">
        <summary className="fit-data flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-[10px] font-bold uppercase tracking-[0.06em] text-[#17221f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#17221f]">
          Product details
          <span aria-hidden="true" className="text-sm group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-3 border-t border-[#17221f]/15 bg-[#f4f7f5]/70 px-3 py-3 text-xs leading-5 text-[#17221f]/80">
          <Fact label="Assembled" value={formatDimensions(candidate.assembledDimensions)} />
          <div>
            <p className="fit-data text-[8px] font-bold uppercase tracking-[0.08em] text-[#17221f]/65">
              Delivery packages
            </p>
            {candidate.packages.length === 0 ? (
              <p className="mt-1">Package dimensions unavailable.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {candidate.packages.map((deliveryPackage, index) => (
                  <li key={`${deliveryPackage.label ?? "package"}-${index}`}>
                    {formatPackage(deliveryPackage)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Fact label="Access basis" value={accessBasisLabel(candidate)} />
          <Fact
            label="Provenance"
            value={`${provenanceSourceLabel(candidate.provenance.source)} · ${candidate.provenance.freshness} · ${formatObservedDate(candidate.provenance.observedAt)}`}
          />
          <Fact label="Dimension evidence" value={candidate.provenance.evidence} />
        </div>
      </details>

      <div className="grid grid-cols-2 gap-2 bg-[#f4f7f5]/60 p-3">
        <button
          type="button"
          aria-pressed={isCompared}
          disabled={compareDisabled && !isCompared}
          onClick={() => onToggleCompare(candidate.key)}
          className={`min-h-11 cursor-pointer rounded-sm border px-3 text-xs font-bold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f] disabled:cursor-not-allowed disabled:opacity-40 ${
            isCompared
              ? "border-[#17221f] bg-[#17221f] text-white"
              : "border-[#17221f]/35 bg-white text-[#17221f] hover:border-[#17221f]"
          }`}
        >
          {isCompared ? "Comparing" : "Compare"}
        </button>
        <a
          href={candidate.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onRetailerOutbound?.(candidate)}
          className="flex min-h-11 cursor-pointer items-center justify-center rounded-sm border border-[#17221f]/35 bg-white px-3 text-center text-xs font-bold text-[#17221f] transition-colors duration-200 hover:border-[#17221f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f]"
        >
          Retailer source ↗
        </a>
      </div>
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
        className="fit-data flex h-[120px] items-center justify-center border border-[#17221f]/20 bg-[#f4f7f5] p-2 text-center text-[9px] font-bold uppercase tracking-[0.06em] text-[#17221f]/65"
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
      width={240}
      height={240}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="h-[120px] w-full border border-[#17221f]/20 bg-[#f4f7f5] object-contain"
    />
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
      <p className="fit-data text-[8px] font-bold uppercase tracking-[0.08em] text-[#17221f]/65">
        {label}
      </p>
      <p className="mt-1">{value}</p>
    </div>
  );
}
