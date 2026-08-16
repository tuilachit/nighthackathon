import type { LiveCandidate, LiveSearchWorkflow } from "@/lib/live-search/types";
import styles from "./LiveSearchExperience.module.css";

interface LiveCandidateCardProps {
  readonly candidate: LiveCandidate;
  readonly workflowState: LiveSearchWorkflow["state"];
  readonly approvedCandidateId?: string;
  readonly approvalPending: boolean;
  readonly onApprove: (candidateId: string) => void;
}

const RETAILER_LABELS = {
  "ikea-au": "IKEA Australia",
  "kmart-au": "Kmart Australia",
} as const;

const SOURCE_LABELS = {
  "retailer-page": "retailer page",
  "retailer-api": "retailer API",
  "json-ld": "JSON-LD",
} as const;

/** Presents an immutable retailer observation and the server's fit classification. */
export function LiveCandidateCard({
  candidate,
  workflowState,
  approvedCandidateId,
  approvalPending,
  onApprove,
}: LiveCandidateCardProps): React.JSX.Element {
  const { observation, fit, access } = candidate;
  const isFit = candidate.fitStatus === "fits";
  const isApproved = approvedCandidateId === candidate.id;
  const anotherCandidateIsApproved =
    approvedCandidateId !== undefined && !isApproved;
  const cardClass = candidate.fitStatus === "fits"
    ? styles.cardFit
    : candidate.fitStatus === "access_issue"
      ? styles.cardAccess
      : styles.cardNear;
  const reasonClass = candidate.fitStatus === "fits"
    ? styles.fitText
    : candidate.fitStatus === "access_issue"
      ? styles.accessText
      : styles.nearText;
  const statusReason = getStatusReason(candidate);
  const observedDate = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(observation.observedAt));

  return (
    <article
      className={`${styles.card} ${cardClass}`}
      data-testid={`live-candidate-${candidate.id}`}
    >
      <div className={styles.cardTop}>
        {/* The agent accepts retailer image hosts at runtime, so a static Next image allowlist cannot cover them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={observation.imageUrl}
          alt={`${observation.name} retailer product photo`}
          width={188}
          height={236}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className={styles.productImage}
        />
        <div>
          <div className={styles.badges}>
            <span className={styles.badge}>{RETAILER_LABELS[observation.retailer]}</span>
            <span className={`${styles.badge} ${styles.verifiedBadge}`}>
              Source evidence captured
            </span>
            <span className={styles.badge}>{availabilityLabel(observation.availability)}</span>
          </div>
          <h3>{observation.name}</h3>
          <p className={styles.price}>{formatAud(observation.priceMinor)}</p>
          <p className={styles.dimensions}>
            {formatDimensions(observation.assembledDimensions)}
          </p>
          <p className={`${styles.reason} ${reasonClass}`}>{statusReason}</p>
        </div>
      </div>

      {isFit ? (
        <div className={styles.clearances} aria-label="Remaining clearance">
          <Clearance label="Width" valueMm={fit.widthClearanceMm} />
          <Clearance label="Height" valueMm={fit.heightClearanceMm} />
          <Clearance label="Depth" valueMm={fit.depthClearanceMm} />
        </div>
      ) : null}

      <details className={styles.metadata}>
        <summary>Source and fit details</summary>
        <p>
          Agent-extracted assembled dimensions from {SOURCE_LABELS[observation.dimensionsSource]},
          captured {observedDate}. Evidence consistency check: passed.
        </p>
        <p>{observation.dimensionsEvidence}</p>
        <p>
          Orientation: {fit.orientation === "rotated-90" ? "rotated 90 degrees" : "default"}.
          {access.status === "passed" ? ` Access clearance: ${access.clearanceMm} mm.` : ""}
        </p>
      </details>

      <div className={styles.cardActions}>
        {isFit ? (
          isApproved ? (
            <span className={styles.approvedLabel}>Approved for model generation</span>
          ) : (
            <button
              type="button"
              className={styles.approveButton}
              disabled={
                workflowState !== "ready_for_approval" ||
                approvalPending ||
                anotherCandidateIsApproved
              }
              onClick={() => onApprove(candidate.id)}
            >
              {approvalPending ? "Submitting approval…" : "Approve and generate 3D"}
            </button>
          )
        ) : null}
        <a
          href={observation.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.retailerLink}
        >
          View at retailer ↗
        </a>
      </div>
    </article>
  );
}

function Clearance({ label, valueMm }: { readonly label: string; readonly valueMm: number }): React.JSX.Element {
  return (
    <span className={styles.clearance}>
      <span className={styles.clearanceLabel}>{label}</span>
      <span className={styles.dimensionLine}>{valueMm} mm</span>
    </span>
  );
}

function getStatusReason(candidate: LiveCandidate): string {
  if (candidate.fitStatus === "fits") {
    return `${candidate.fit.minimumClearanceMm} mm minimum clearance`;
  }
  if (candidate.fitStatus === "access_issue" && candidate.access.status === "failed") {
    return candidate.access.reason;
  }
  return candidate.fit.reasons[0] ?? "This item does not fit the measured envelope.";
}

function formatDimensions(dimensions: LiveCandidate["observation"]["assembledDimensions"]): string {
  return `${dimensions.widthMm} W × ${dimensions.heightMm} H × ${dimensions.depthMm} D mm`;
}

function formatAud(priceMinor: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(priceMinor / 100);
}

function availabilityLabel(availability: LiveCandidate["observation"]["availability"]): string {
  if (availability === "in_stock") {
    return "In stock";
  }
  if (availability === "out_of_stock") {
    return "Out of stock";
  }
  return "Stock unconfirmed";
}
