import Link from "next/link";
import type {
  DeliveryPackage,
  LiveSearchIntent,
  PublicDecisionCandidate,
  PublicSharedComparisonSnapshot,
} from "@/lib/live-search/types";
import { MeasurementEnvelopeDiagram } from "./MeasurementEnvelopeDiagram";

export type { PublicDecisionCandidate, PublicSharedComparisonSnapshot };

/** Renders a read-only, already-validated decision snapshot without restoring owner authority. */
export function PublicSharedComparison({
  snapshot,
}: {
  readonly snapshot: PublicSharedComparisonSnapshot;
}): React.JSX.Element {
  return (
    <main className="fit-instrument min-h-screen bg-[#f4f7f5] px-3 py-5 text-[#17221f] sm:px-5">
      <div className="mx-auto w-full max-w-[760px]">
        <header className="flex items-start justify-between gap-3 border-b border-[#17221f]/30 pb-4">
          <div>
            <p className="fit-display text-xl font-bold tracking-[-0.04em]">FITMENT</p>
            <p className="fit-data mt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#17221f]/60">
              Read-only shared comparison
            </p>
          </div>
          <Link
            href="/fit?new=1"
            className="flex min-h-11 items-center border border-[#17221f] bg-[#17221f] px-3 text-xs font-bold text-white"
          >
            Use my space
          </Link>
        </header>

        <section aria-labelledby="shared-comparison-title" className="mt-5 border border-[#17221f] bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-[#17221f]/25 p-4">
            <div>
              <p className="fit-data text-[9px] font-bold uppercase tracking-[0.1em] text-[#17221f]/60">
                One measured envelope · {snapshot.candidates.length} products
              </p>
              <h1 id="shared-comparison-title" className="fit-display mt-1 text-2xl font-bold tracking-[-0.035em]">
                Clearance comparison
              </h1>
              <p className="fit-data mt-2 text-[10px] font-bold text-[#17221f]/65">
                {snapshot.measurement.widthMm} W × {snapshot.measurement.heightMm} H × {snapshot.measurement.depthMm} D mm
                {snapshot.measurement.accessWidthMm === undefined
                  ? " · access not assessed"
                  : ` · ${snapshot.measurement.accessWidthMm} mm access`}
              </p>
            </div>
          </div>

          <MeasurementEnvelopeDiagram measurement={snapshot.measurement} />

          <div className="fit-comparison-grid">
            {snapshot.candidates.map((candidate) => (
              <SharedCandidate key={candidate.key} candidate={candidate} />
            ))}
          </div>
        </section>

        <section className="mt-4 border-l-[3px] border-[#8a632d] bg-white p-4" aria-labelledby="measurement-warning-title">
          <h2 id="measurement-warning-title" className="text-sm font-bold">Use this comparison as advice, not a fit guarantee.</h2>
          <p className="mt-2 text-xs leading-5 text-[#17221f]/70">
            It replays the sender&apos;s measurements and source observations. Fitment checks one
            measured envelope and, when supplied, one narrowest access opening; it does not model
            turns, stairs, packaging changes, disassembly or operating clearance.
          </p>
          <dl className="mt-3 grid gap-2 border-t border-[#17221f]/20 pt-3 text-[10px] sm:grid-cols-2">
            <div>
              <dt className="fit-data font-bold uppercase text-[#17221f]/55">Original request</dt>
              <dd className="mt-1 break-words font-semibold">{intentLabel(snapshot.intent)}</dd>
            </div>
            <div>
              <dt className="fit-data font-bold uppercase text-[#17221f]/55">Sources checked</dt>
              <dd className="fit-data mt-1 font-semibold">{formatDate(snapshot.checkedAt)} · {snapshot.isPartial ? "partial coverage" : "reported coverage complete"}</dd>
            </div>
          </dl>
          {snapshot.isPartial && snapshot.coverageNotes.length > 0 ? (
            <ul className="mt-3 list-disc pl-5 text-[10px] leading-5 text-[#17221f]/68">
              {snapshot.coverageNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          ) : null}
        </section>

        <section className="mt-4 border border-[#17221f]/30 bg-white p-4">
          <h2 className="fit-display text-xl font-bold tracking-[-0.025em]">Check it against your own space.</h2>
          <p className="mt-2 text-xs leading-5 text-[#17221f]/70">
            This link cannot search retailers, approve a candidate, or spend model credits. Start
            your own session to measure, search, compare, and review a clean fit for 3D generation.
          </p>
          <Link
            href="/fit?new=1"
            className="mt-4 flex min-h-12 items-center justify-center bg-[#17221f] px-4 text-sm font-bold text-white"
          >
            Measure and start my search
          </Link>
        </section>
      </div>
    </main>
  );
}

function SharedCandidate({ candidate }: { readonly candidate: PublicDecisionCandidate }): React.JSX.Element {
  const tone = candidate.fitStatus === "fits"
    ? { label: "Fits", border: "border-t-[#3f6b57]", text: "text-[#3f6b57]" }
    : candidate.fitStatus === "access_issue"
      ? { label: "Access issue", border: "border-t-[#8a632d]", text: "text-[#8a632d]" }
      : { label: "Near miss", border: "border-t-[#8a4e48]", text: "text-[#8a4e48]" };
  return (
    <article className={`min-w-0 border-r border-t-[3px] border-r-[#17221f]/20 p-3 last:border-r-0 ${tone.border}`}>
      <p className={`fit-data text-[8px] font-bold uppercase tracking-[0.1em] ${tone.text}`}>{tone.label}</p>
      {candidate.imageUrl === undefined ? (
        <div className="fit-data mt-2 flex aspect-[4/3] items-center justify-center border border-[#17221f]/20 bg-[#f4f7f5] text-[8px] font-bold text-[#17221f]/55">
          Retailer image unavailable
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={candidate.imageUrl}
          alt={`${candidate.name} retailer product photo`}
          width={220}
          height={180}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="mt-2 aspect-[4/3] w-full border border-[#17221f]/20 bg-[#f4f7f5] object-contain"
        />
      )}
      <p className="fit-data mt-2 text-[8px] font-bold uppercase tracking-[0.08em] text-[#17221f]/60">{candidate.retailer.label}</p>
      <h2 className="mt-1 min-h-10 text-xs font-bold leading-[1.35]">{candidate.name}</h2>
      <p className="fit-data mt-2 text-lg font-bold">{formatMoney(candidate.price.minor, candidate.price.currency)}</p>
      <p className="fit-data mt-1 text-[8px] font-bold uppercase text-[#17221f]/60">{availabilityLabel(candidate.availability)}</p>
      <p className="fit-data mt-2 text-[9px] font-semibold leading-4 text-[#17221f]/65">
        {candidate.assembledDimensions.widthMm} W × {candidate.assembledDimensions.heightMm} H × {candidate.assembledDimensions.depthMm} D mm
      </p>
      <SharedPackages packages={candidate.packages} />
      <div className={`mt-3 border border-current bg-[#f4f7f5] p-2 text-center ${tone.text}`}>
        <SharedClearance label="W" value={candidate.fit.widthClearanceMm} />
        <SharedClearance label="H" value={candidate.fit.heightClearanceMm} />
        <SharedClearance label="D" value={candidate.fit.depthClearanceMm} />
      </div>
      <p className={`fit-data mt-3 text-xl font-bold ${tone.text}`}>
        {candidate.fit.minimumClearanceMm}<span className="ml-1 text-[8px] text-[#17221f]/60">mm min</span>
      </p>
      <p className="mt-2 text-[9px] leading-4 text-[#17221f]/68">{sharedReason(candidate)}</p>
      <dl className="fit-data mt-3 grid gap-0 border-y border-[#17221f]/20 text-[8px] leading-4">
        <div className="grid grid-cols-[54px_1fr] gap-2 border-b border-[#17221f]/10 py-1.5">
          <dt className="font-bold uppercase text-[#17221f]/55">Access</dt>
          <dd className="m-0 font-semibold">{sharedAccessLabel(candidate)}</dd>
        </div>
        <div className="grid grid-cols-[54px_1fr] gap-2 py-1.5">
          <dt className="font-bold uppercase text-[#17221f]/55">Observed</dt>
          <dd className="m-0 font-semibold">{formatDateTime(candidate.provenance.observedAt)}</dd>
        </div>
      </dl>
      <details className="mt-3 border-t border-[#17221f]/20 pt-2 text-[9px] leading-4 text-[#17221f]/65">
        <summary className="min-h-9 cursor-pointer font-bold">Source facts</summary>
        <p>{sourceLabel(candidate.provenance.source)} · {formatDateTime(candidate.provenance.observedAt)} · {candidate.provenance.freshness}</p>
        <p className="mt-1">{candidate.provenance.evidence}</p>
      </details>
      <a
        href={candidate.productUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex min-h-11 items-center justify-center border border-[#17221f]/30 bg-white px-2 text-[10px] font-bold"
      >
        View retailer source ↗
      </a>
    </article>
  );
}

function SharedClearance({ label, value }: { readonly label: string; readonly value: number }): React.JSX.Element {
  return (
    <div className="mb-1 last:mb-0">
      <span className="fit-data block text-[7px] font-bold text-[#17221f]/55">{label} clearance</span>
      <div className="fit-dimension-annotation">
        <strong className="fit-data fit-dimension-annotation__value bg-[#f4f7f5] text-[9px]">{value} mm</strong>
      </div>
    </div>
  );
}

function SharedPackages({ packages }: { readonly packages: readonly DeliveryPackage[] }): React.JSX.Element {
  if (packages.length === 0) {
    return <p className="fit-data mt-2 text-[8px] leading-4 text-[#17221f]/60">Package dimensions unavailable.</p>;
  }
  return (
    <div className="fit-data mt-2 text-[8px] leading-4 text-[#17221f]/60">
      <p className="font-bold uppercase">Listed delivery package{packages.length === 1 ? "" : "s"}</p>
      <ul className="mt-1 list-disc pl-4">
        {packages.map((deliveryPackage, index) => (
          <li key={`${deliveryPackage.label ?? "package"}-${index}`}>
            {deliveryPackage.label ?? `Package ${index + 1}`} · {deliveryPackage.widthMm} W × {deliveryPackage.heightMm} H × {deliveryPackage.depthMm} D mm
          </li>
        ))}
      </ul>
    </div>
  );
}

function sharedReason(candidate: PublicDecisionCandidate): string {
  if (candidate.fitStatus === "fits") {
    if (candidate.access.status === "skipped") {
      return "Fits the measured room envelope. Access not checked.";
    }
    return candidate.access.basis === "package"
      ? "Fits the room and the supplied opening using listed package dimensions."
      : "Fits the room; access is an assembled-size advisory because package data was unavailable.";
  }
  if (candidate.access.status === "failed") {
    return candidate.access.reason;
  }
  return candidate.fit.reasons[0] ?? "Does not clear the measured room envelope.";
}

function sharedAccessLabel(candidate: PublicDecisionCandidate): string {
  if (candidate.access.status === "skipped") return "Access not checked";
  if (candidate.access.status === "failed") return `Failed · ${candidate.access.reason}`;
  if (candidate.access.basis === "package") {
    const packageLabel = candidate.access.controllingPackageLabel ??
      `package ${candidate.access.controllingPackageIndex + 1}`;
    return `Passed using ${packageLabel} · ${candidate.access.clearanceMm} mm clearance`;
  }
  return `Passed as assembled-size advisory · ${candidate.access.clearanceMm} mm clearance`;
}

function availabilityLabel(availability: PublicDecisionCandidate["availability"]): string {
  if (availability === "in_stock") return "Listed in stock";
  if (availability === "out_of_stock") return "Listed out of stock";
  return "Stock status not confirmed";
}

function intentLabel(intent: LiveSearchIntent): string {
  return intent.kind === "prompt" ? intent.text : intent.url;
}

function sourceLabel(source: PublicDecisionCandidate["provenance"]["source"]): string {
  if (source === "retailer-api") return "Retailer API";
  if (source === "json-ld") return "Retailer JSON-LD";
  return "Retailer page";
}

function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

function formatDate(input: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(input));
}

function formatDateTime(input: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(input));
}
