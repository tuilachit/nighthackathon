import type {
  AccessCrossSectionDimension,
  FitEvaluation,
  ProductDimensions,
  SpaceMeasurement,
} from "@/lib/catalog-types";

export const WORKFLOW_STATES = [
  "created",
  "queued",
  "searching",
  "validating",
  "ready_for_approval",
  "approved",
  "generating",
  "verifying",
  "asset_ready",
  "partial",
  "failed",
  "cancelled",
  "expired",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const LIVE_RETAILERS = ["ikea-au", "kmart-au"] as const;
export type LiveRetailer = (typeof LIVE_RETAILERS)[number];

export const CACHE_POLICIES = ["prefer-recent", "force-refresh"] as const;
export type CachePolicy = (typeof CACHE_POLICIES)[number];

export type LiveSearchIntent =
  | {
      readonly kind: "prompt";
      readonly text: string;
      readonly retailers: readonly LiveRetailer[];
    }
  | {
      readonly kind: "product-link";
      readonly url: string;
    };

export interface RetailerIdentity {
  readonly key: string;
  readonly label: string;
  readonly host: string;
}

export const LIVE_RETAILER_IDENTITIES: Readonly<
  Record<LiveRetailer, RetailerIdentity>
> = {
  "ikea-au": {
    key: "ikea-au",
    label: "IKEA Australia",
    host: "ikea.com",
  },
  "kmart-au": {
    key: "kmart-au",
    label: "Kmart Australia",
    host: "kmart.com.au",
  },
};

export interface DeliveryPackage extends ProductDimensions {
  readonly label?: string;
}

interface PassedDeliveryAccess {
  readonly status: "passed";
  readonly passes: true;
  readonly accessWidthMm: number;
  readonly crossSection: readonly [
    AccessCrossSectionDimension,
    AccessCrossSectionDimension,
  ];
  readonly clearanceMm: number;
  readonly reason?: never;
}

interface FailedDeliveryAccess {
  readonly status: "failed";
  readonly passes: false;
  readonly accessWidthMm: number;
  readonly crossSection: readonly [
    AccessCrossSectionDimension,
    AccessCrossSectionDimension,
  ];
  readonly deficitMm: number;
  readonly reason: string;
}

export type DeliveryAccessEvaluation =
  | {
      readonly status: "skipped";
      readonly passes: true;
      readonly basis: "unknown";
      readonly reason?: never;
      readonly controllingPackageIndex?: never;
      readonly controllingPackageLabel?: never;
    }
  | (PassedDeliveryAccess & {
      readonly basis: "assembled-advisory";
      readonly controllingPackageIndex?: never;
      readonly controllingPackageLabel?: never;
    })
  | (PassedDeliveryAccess & {
      readonly basis: "package";
      readonly controllingPackageIndex: number;
      readonly controllingPackageLabel?: string;
    })
  | (FailedDeliveryAccess & {
      readonly basis: "assembled-advisory";
      readonly controllingPackageIndex?: never;
      readonly controllingPackageLabel?: never;
    })
  | (FailedDeliveryAccess & {
      readonly basis: "package";
      readonly controllingPackageIndex: number;
      readonly controllingPackageLabel?: string;
    });

export const MAX_COVERAGE_NOTES = 10;
export const MAX_COVERAGE_NOTE_LENGTH = 300;

export interface LiveProductObservation {
  readonly retailer: RetailerIdentity;
  readonly retailerProductId: string;
  readonly name: string;
  readonly category: string;
  readonly productUrl: string;
  readonly imageUrl: string;
  readonly priceMinor: number;
  /** ISO-4217 uppercase alphabetic currency code. */
  readonly currency: string;
  readonly availability: "in_stock" | "out_of_stock" | "unknown";
  readonly assembledDimensions: ProductDimensions;
  /** Complete delivery packages. An empty array means package data is unavailable. */
  readonly packages: readonly DeliveryPackage[];
  readonly dimensionsSource: "retailer-page" | "retailer-api" | "json-ld";
  readonly dimensionsEvidence: string;
  readonly observedAt: string;
  readonly confidence: "high";
}

export interface BrowserSearchOutput {
  readonly products: readonly LiveProductObservation[];
  readonly partial: boolean;
  readonly notes: readonly string[];
}

export type CandidateFitStatus = "fits" | "access_issue" | "near_miss";

export interface LiveCandidate {
  readonly id: string;
  readonly rank: number;
  readonly fitStatus: CandidateFitStatus;
  readonly observation: LiveProductObservation;
  readonly fit: FitEvaluation;
  readonly access: DeliveryAccessEvaluation;
  readonly asset?: LiveAsset;
}

export interface DecisionCandidate {
  readonly key: string;
  readonly workflowId: string;
  readonly candidateId: string;
  readonly retailer: RetailerIdentity;
  readonly name: string;
  readonly imageUrl?: string;
  readonly price: {
    readonly minor: number;
    readonly currency: string;
  };
  readonly availability: LiveProductObservation["availability"];
  readonly assembledDimensions: ProductDimensions;
  readonly packages: readonly DeliveryPackage[];
  readonly fitStatus: CandidateFitStatus;
  readonly fit: FitEvaluation;
  readonly access: DeliveryAccessEvaluation;
  readonly provenance: {
    readonly source: LiveProductObservation["dimensionsSource"];
    readonly evidence: string;
    readonly observedAt: string;
    readonly freshness: "cached" | "live";
  };
  readonly productUrl: string;
  readonly asset?: LiveAsset;
}

/** Public candidate facts intentionally omit owner-scoped workflow identifiers. */
export type PublicDecisionCandidate = Omit<
  DecisionCandidate,
  "workflowId" | "candidateId"
>;

/** Immutable, read-only comparison payload stored behind an opaque share token. */
export interface PublicSharedComparisonSnapshot {
  readonly measurement: SpaceMeasurement;
  readonly intent: LiveSearchIntent;
  readonly candidates: readonly PublicDecisionCandidate[];
  readonly checkedAt: string;
  readonly isPartial: boolean;
  readonly coverageNotes: readonly string[];
}

export interface LiveAsset {
  readonly id: string;
  readonly kind: "glb" | "usdz";
  readonly url: string;
  readonly dimensions: ProductDimensions;
  readonly scaleVerified: boolean;
  /** Quick Look source when a scale-verified USDZ sibling of this asset exists. */
  readonly iosUsdzUrl?: string;
}

export interface LiveSearchWorkflow {
  readonly id: string;
  readonly state: WorkflowState;
  readonly queryText: string;
  /** Canonical intent for unified workflows; absent on rows created before migration. */
  readonly intent?: LiveSearchIntent;
  readonly measurement: SpaceMeasurement;
  readonly retailers: readonly LiveRetailer[];
  /** Cache metadata is optional while pre-migration workflows remain readable. */
  readonly cachePolicy?: CachePolicy;
  readonly cacheHit?: boolean;
  readonly freshness?: "cached" | "live";
  readonly checkedAt?: string;
  readonly candidates: readonly LiveCandidate[];
  readonly isPartial: boolean;
  readonly coverageNotes: readonly string[];
  readonly approvedCandidateId?: string;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateLiveSearchRequest {
  readonly intent: LiveSearchIntent;
  readonly measurement: SpaceMeasurement;
  readonly cachePolicy: CachePolicy;
}

export interface CreateLiveSearchResponse {
  readonly workflowId: string;
  readonly state: WorkflowState;
  readonly reused: boolean;
  readonly cacheHit: boolean;
  readonly freshness: "cached" | "live";
  readonly checkedAt?: string;
}

export interface ApproveCandidateResponse {
  readonly workflowId: string;
  readonly candidateId: string;
  readonly state: WorkflowState;
}

export interface VerifiedLiveCandidateRecord {
  readonly observation: LiveProductObservation;
  readonly fitStatus: CandidateFitStatus;
  readonly fit: FitEvaluation;
  readonly access: DeliveryAccessEvaluation;
  readonly rank: number;
  readonly snapshotHash: string;
}
