import type {
  AccessEvaluation,
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

export const MAX_COVERAGE_NOTES = 10;
export const MAX_COVERAGE_NOTE_LENGTH = 300;

export interface LiveProductObservation {
  readonly retailer: LiveRetailer;
  readonly retailerProductId: string;
  readonly name: string;
  readonly category: string;
  readonly productUrl: string;
  readonly imageUrl: string;
  readonly priceMinor: number;
  readonly currency: "AUD";
  readonly availability: "in_stock" | "out_of_stock" | "unknown";
  readonly assembledDimensions: ProductDimensions;
  readonly packageDimensions?: ProductDimensions;
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
  readonly access: AccessEvaluation;
  readonly asset?: LiveAsset;
}

export interface LiveAsset {
  readonly id: string;
  readonly kind: "glb" | "usdz";
  readonly url: string;
  readonly dimensions: ProductDimensions;
  readonly scaleVerified: boolean;
}

export interface LiveSearchWorkflow {
  readonly id: string;
  readonly state: WorkflowState;
  readonly queryText: string;
  readonly measurement: SpaceMeasurement;
  readonly retailers: readonly LiveRetailer[];
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
  readonly queryText: string;
  readonly measurement: SpaceMeasurement;
  readonly retailers: readonly LiveRetailer[];
}

export interface CreateLiveSearchResponse {
  readonly workflowId: string;
  readonly state: WorkflowState;
  readonly reused: boolean;
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
  readonly access: AccessEvaluation;
  readonly rank: number;
  readonly snapshotHash: string;
}
