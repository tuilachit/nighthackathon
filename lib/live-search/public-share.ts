import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { sha256Hex, stableJson } from "./hashing";
import type {
  LiveCandidate,
  LiveSearchIntent,
  LiveSearchWorkflow,
  PublicDecisionCandidate,
  PublicSharedComparisonSnapshot,
} from "./types";

export const PUBLIC_SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const PUBLIC_SHARE_SCHEMA_VERSION = 1;

export interface PublicShareToken {
  readonly token: string;
  readonly tokenHash: string;
}

export function createPublicShareToken(): PublicShareToken {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPublicShareToken(token) };
}

export function hashPublicShareToken(token: string): string {
  if (!isPublicShareToken(token)) {
    throw new Error("Invalid public share token.");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isPublicShareToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function publicShareExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + PUBLIC_SHARE_TTL_MS).toISOString();
}

export function isUnexpiredPublicShare(expiresAt: string, now = Date.now()): boolean {
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp > now;
}

/** Builds a public snapshot from owner-authorized rows while dropping every private identifier. */
export function buildPublicSharedComparisonSnapshot(
  workflow: LiveSearchWorkflow,
  selectedCandidateIds: readonly string[],
): PublicSharedComparisonSnapshot {
  if (selectedCandidateIds.length < 1 || selectedCandidateIds.length > 3) {
    throw new Error("A comparison share must contain one to three candidates.");
  }
  const selected = selectedCandidateIds.map((candidateId) => {
    const candidate = workflow.candidates.find((entry) => entry.id === candidateId);
    if (candidate === undefined) {
      throw new Error("A selected comparison candidate was not found in this workflow.");
    }
    return toPublicCandidate(candidate, workflow.freshness ?? "live");
  });
  const intent: LiveSearchIntent = workflow.intent ?? {
    kind: "prompt",
    text: workflow.queryText,
    retailers: workflow.retailers,
  };
  const latestObservedAt = selected.reduce(
    (latest, candidate) => Date.parse(candidate.provenance.observedAt) > Date.parse(latest)
      ? candidate.provenance.observedAt
      : latest,
    selected[0]?.provenance.observedAt ?? workflow.updatedAt,
  );
  return {
    measurement: workflow.measurement,
    intent,
    candidates: selected,
    checkedAt: workflow.checkedAt ?? latestObservedAt,
    isPartial: workflow.isPartial,
    coverageNotes: workflow.coverageNotes,
  };
}

/** Fail-closed guard for the private, service-written JSON payload read at a public boundary. */
export function isPublicSharedComparisonSnapshot(
  value: unknown,
): value is PublicSharedComparisonSnapshot {
  if (!isRecord(value) || containsPrivateIdentifier(value)) {
    return false;
  }
  const measurement = value.measurement;
  const intent = value.intent;
  const candidates = value.candidates;
  return isRecord(measurement) &&
    isDimension(measurement.widthMm) &&
    isDimension(measurement.heightMm) &&
    isDimension(measurement.depthMm) &&
    typeof measurement.uncertaintyMm === "number" &&
    measurement.uncertaintyMm >= 0 &&
    (measurement.accessWidthMm === undefined || isDimension(measurement.accessWidthMm)) &&
    (measurement.source === "manual" || measurement.source === "demo" || measurement.source === "webxr") &&
    isPublicIntent(intent) &&
    Array.isArray(candidates) &&
    candidates.length >= 1 &&
    candidates.length <= 3 &&
    candidates.every(isPublicCandidateShape) &&
    typeof value.checkedAt === "string" &&
    Number.isFinite(Date.parse(value.checkedAt)) &&
    typeof value.isPartial === "boolean" &&
    Array.isArray(value.coverageNotes) &&
    value.coverageNotes.length <= 10 &&
    value.coverageNotes.every((note) => typeof note === "string" && note.length <= 300);
}

function toPublicCandidate(
  candidate: LiveCandidate,
  freshness: "cached" | "live",
): PublicDecisionCandidate {
  const observation = candidate.observation;
  const key = sha256Hex(stableJson({
    retailer: observation.retailer.key,
    productUrl: observation.productUrl,
    dimensions: observation.assembledDimensions,
    observedAt: observation.observedAt,
  })).slice(0, 24);
  return {
    key,
    retailer: observation.retailer,
    name: observation.name,
    imageUrl: observation.imageUrl,
    price: { minor: observation.priceMinor, currency: observation.currency },
    availability: observation.availability,
    assembledDimensions: observation.assembledDimensions,
    packages: observation.packages,
    fitStatus: candidate.fitStatus,
    fit: candidate.fit,
    access: candidate.access,
    provenance: {
      source: observation.dimensionsSource,
      evidence: observation.dimensionsEvidence,
      observedAt: observation.observedAt,
      freshness,
    },
    productUrl: observation.productUrl,
    ...(candidate.asset === undefined ? {} : { asset: candidate.asset }),
  };
}

function isPublicIntent(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "product-link") {
    return isSafeHttps(value.url);
  }
  return value.kind === "prompt" &&
    typeof value.text === "string" &&
    value.text.length > 0 &&
    value.text.length <= 500 &&
    Array.isArray(value.retailers) &&
    value.retailers.length >= 1 &&
    value.retailers.every((retailer) => retailer === "ikea-au" || retailer === "kmart-au");
}

function isPublicCandidateShape(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.retailer) || !isRecord(value.price) ||
      !isRecord(value.assembledDimensions) || !isRecord(value.fit) ||
      !isRecord(value.access) || !isRecord(value.provenance)) {
    return false;
  }
  return typeof value.key === "string" && /^[0-9a-f]{24}$/.test(value.key) &&
    typeof value.retailer.key === "string" &&
    typeof value.retailer.label === "string" &&
    typeof value.retailer.host === "string" &&
    typeof value.name === "string" && value.name.length > 0 &&
    typeof value.price.minor === "number" && Number.isInteger(value.price.minor) && value.price.minor > 0 &&
    typeof value.price.currency === "string" && /^[A-Z]{3}$/.test(value.price.currency) &&
    (value.availability === "in_stock" || value.availability === "out_of_stock" || value.availability === "unknown") &&
    isDimensions(value.assembledDimensions) &&
    Array.isArray(value.packages) && value.packages.every(isDimensions) &&
    (value.fitStatus === "fits" || value.fitStatus === "access_issue" || value.fitStatus === "near_miss") &&
    typeof value.fit.minimumClearanceMm === "number" &&
    (value.access.status === "skipped" || value.access.status === "passed" || value.access.status === "failed") &&
    (value.provenance.source === "retailer-page" || value.provenance.source === "retailer-api" || value.provenance.source === "json-ld") &&
    typeof value.provenance.evidence === "string" &&
    typeof value.provenance.observedAt === "string" && Number.isFinite(Date.parse(value.provenance.observedAt)) &&
    (value.provenance.freshness === "cached" || value.provenance.freshness === "live") &&
    isSafeHttps(value.productUrl) &&
    (value.imageUrl === undefined || isSafeHttps(value.imageUrl));
}

function isDimensions(value: unknown): boolean {
  return isRecord(value) &&
    isDimension(value.widthMm) &&
    isDimension(value.heightMm) &&
    isDimension(value.depthMm);
}

function isDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 10_000;
}

function isSafeHttps(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsPrivateIdentifier(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrivateIdentifier);
  if (!isRecord(value)) return false;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "ownerId" || key === "workflowId" || key === "candidateId" || key === "authentication") {
      return true;
    }
    if (containsPrivateIdentifier(entry)) return true;
  }
  return false;
}
