import type {
  CandidateFitStatus,
  DecisionCandidate,
  DeliveryPackage,
} from "@/lib/live-search/types";
import type { ProductDimensions } from "@/lib/catalog-types";

export interface TierPresentation {
  readonly label: string;
  readonly singularLabel: string;
  readonly colorHex: string;
  readonly borderClass: string;
  readonly surfaceClass: string;
  readonly textClass: string;
}

export const TIER_ORDER = ["fits", "access_issue", "near_miss"] as const;

export const TIER_PRESENTATION: Readonly<
  Record<CandidateFitStatus, TierPresentation>
> = {
  fits: {
    label: "Fits",
    singularLabel: "Fits",
    colorHex: "#315544",
    borderClass: "border-[#3f6b57]",
    surfaceClass: "bg-[#3f6b57]/10",
    textClass: "text-[#315544]",
  },
  access_issue: {
    label: "Doorway",
    singularLabel: "Doorway issue",
    colorHex: "#755426",
    borderClass: "border-[#8a632d]",
    surfaceClass: "bg-[#8a632d]/10",
    textClass: "text-[#755426]",
  },
  near_miss: {
    label: "Near misses",
    singularLabel: "Near miss",
    colorHex: "#7a423d",
    borderClass: "border-[#8a4e48]",
    surfaceClass: "bg-[#8a4e48]/10",
    textClass: "text-[#7a423d]",
  },
};

export function formatListedPrice(candidate: DecisionCandidate): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: candidate.price.currency,
    minimumFractionDigits: 2,
  }).format(candidate.price.minor / 100);
}

export function formatDimensions(dimensions: ProductDimensions): string {
  return `${dimensions.widthMm} W × ${dimensions.heightMm} H × ${dimensions.depthMm} D mm`;
}

export function formatPackage(deliveryPackage: DeliveryPackage): string {
  const prefix = deliveryPackage.label === undefined
    ? "Package"
    : deliveryPackage.label;
  return `${prefix}: ${formatDimensions(deliveryPackage)}`;
}

export function formatObservedDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function provenanceSourceLabel(
  source: DecisionCandidate["provenance"]["source"],
): string {
  if (source === "retailer-api") {
    return "Retailer API";
  }
  if (source === "json-ld") {
    return "Retailer JSON-LD";
  }
  return "Retailer page";
}

export function candidateDecisionReason(candidate: DecisionCandidate): string {
  if (candidate.fitStatus === "fits") {
    return `${candidate.fit.minimumClearanceMm} mm minimum clearance`;
  }
  if (
    candidate.fitStatus === "access_issue" &&
    candidate.access.status === "failed"
  ) {
    return candidate.access.reason;
  }
  return candidate.fit.reasons[0] ?? "This item does not fit the measured envelope.";
}

export function accessBasisLabel(candidate: DecisionCandidate): string {
  const { access } = candidate;
  if (access.status === "skipped") {
    return "Delivery access was not assessed.";
  }
  if (access.basis === "package") {
    const packageName = access.controllingPackageLabel ??
      `package ${access.controllingPackageIndex + 1}`;
    return access.status === "passed"
      ? `${packageName} controls the access check with ${access.clearanceMm} mm clearance.`
      : `${packageName} controls the access check. ${access.reason}`;
  }
  return access.status === "passed"
    ? `Package data was unavailable; assembled size leaves ${access.clearanceMm} mm advisory clearance.`
    : `Package data was unavailable; assembled size was used as an advisory check. ${access.reason}`;
}
