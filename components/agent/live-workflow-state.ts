import type { SpaceMeasurement } from "@/lib/catalog-types";
import { fitWorkflowPath, isFitWorkflowId } from "@/lib/fit-route-contract";
import type {
  CachePolicy,
  CreateLiveSearchRequest,
  LiveRetailer,
} from "@/lib/live-search/types";

export type PendingRequestState = "awaiting-session" | "posting";

export interface PendingSearch {
  readonly request: CreateLiveSearchRequest;
  readonly idempotencyKey: string;
  readonly state: PendingRequestState;
}

export interface StoredLinkedCandidateReference {
  readonly workflowId: string;
  readonly candidateId: string;
  readonly measurementKey: string;
  readonly targetWorkflowId?: string;
}

export const WORKFLOW_SESSION_KEY = "fitment.live-workflow-id";
export const LINKED_CANDIDATE_SESSION_KEY = "fitment.linked-candidate";
export const PENDING_SEARCH_SESSION_KEY = "fitment.pending-search-v1";

/** Restores a workflow from either its canonical path, a legacy query, or session storage. */
export function readPersistedWorkflowId(): string | undefined {
  const url = new URL(window.location.href);
  const pathValue = workflowIdFromPathname(url.pathname);
  const queryValue = url.searchParams.get("job");
  let storedValue: string | null = null;
  try {
    storedValue = window.sessionStorage.getItem(WORKFLOW_SESSION_KEY);
  } catch {
    // Canonical paths and legacy query parameters remain available without storage.
  }

  const validQueryValue = isFitWorkflowId(queryValue) ? queryValue : undefined;
  const validStoredValue = isFitWorkflowId(storedValue) ? storedValue : undefined;

  if (queryValue !== null && validQueryValue === undefined) {
    url.searchParams.delete("job");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  if (storedValue !== null && validStoredValue === undefined) {
    try {
      window.sessionStorage.removeItem(WORKFLOW_SESSION_KEY);
    } catch {
      // Invalid storage is ignored when browser storage is unavailable.
    }
  }

  return pathValue ?? validQueryValue ?? validStoredValue;
}

/** Persists the owner handle and replaces legacy URLs with the canonical workflow path. */
export function persistWorkflowId(workflowId: string): void {
  if (!isFitWorkflowId(workflowId)) {
    throw new TypeError("A valid workflow ID is required.");
  }
  const url = new URL(window.location.href);
  const currentPathWorkflowId = workflowIdFromPathname(url.pathname);
  if (currentPathWorkflowId !== workflowId) {
    url.pathname = fitWorkflowPath(workflowId);
  }
  url.searchParams.delete("job");
  url.searchParams.delete("new");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  try {
    window.sessionStorage.setItem(WORKFLOW_SESSION_KEY, workflowId);
  } catch {
    // The owner-scoped path remains the durable browser handle.
  }
}

/** Removes a workflow handle; canonical job screens return to the live-search entry. */
export function clearPersistedWorkflowId(): void {
  const url = new URL(window.location.href);
  if (workflowIdFromPathname(url.pathname) !== undefined) {
    url.pathname = "/fit/search";
    url.search = "";
  } else {
    url.searchParams.delete("job");
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  try {
    window.sessionStorage.removeItem(WORKFLOW_SESSION_KEY);
  } catch {
    // Private-browsing storage failures are non-fatal.
  }
}

/** Drops only the session resume handle while preserving the current canonical route. */
export function forgetWorkflowSessionHandle(): void {
  try {
    window.sessionStorage.removeItem(WORKFLOW_SESSION_KEY);
  } catch {
    // Canonical terminal URLs remain usable without session storage.
  }
}

export function readPendingSearch(): PendingSearch | undefined {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(PENDING_SEARCH_SESSION_KEY);
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1) {
      clearPendingSearch();
      return undefined;
    }
    const request = parseStoredSearchRequest(parsed.request);
    const idempotencyKey = typeof parsed.idempotencyKey === "string"
      ? parsed.idempotencyKey
      : undefined;
    const state = parsed.state === "awaiting-session" || parsed.state === "posting"
      ? parsed.state
      : undefined;
    if (
      request === undefined ||
      idempotencyKey === undefined ||
      idempotencyKey.length < 16 ||
      idempotencyKey.length > 200 ||
      state === undefined
    ) {
      clearPendingSearch();
      return undefined;
    }
    return { request, idempotencyKey, state };
  } catch {
    clearPendingSearch();
    return undefined;
  }
}

export function persistPendingSearch(submission: PendingSearch): void {
  try {
    window.sessionStorage.setItem(
      PENDING_SEARCH_SESSION_KEY,
      JSON.stringify({ version: 1, ...submission }),
    );
  } catch {
    // The in-memory idempotency key still protects the current tab.
  }
}

export function clearPendingSearch(): void {
  try {
    window.sessionStorage.removeItem(PENDING_SEARCH_SESSION_KEY);
  } catch {
    // Private-browsing storage failures are non-fatal.
  }
}

export function readLinkedCandidateReference(): StoredLinkedCandidateReference | undefined {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(LINKED_CANDIDATE_SESSION_KEY);
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredLinkedCandidateReference>;
    if (
      !isFitWorkflowId(parsed.workflowId) ||
      !isFitWorkflowId(parsed.candidateId) ||
      typeof parsed.measurementKey !== "string" ||
      (parsed.targetWorkflowId !== undefined &&
        !isFitWorkflowId(parsed.targetWorkflowId))
    ) {
      clearLinkedCandidateReference();
      return undefined;
    }
    return {
      workflowId: parsed.workflowId,
      candidateId: parsed.candidateId,
      measurementKey: parsed.measurementKey,
      ...(parsed.targetWorkflowId === undefined
        ? {}
        : { targetWorkflowId: parsed.targetWorkflowId }),
    };
  } catch {
    clearLinkedCandidateReference();
    return undefined;
  }
}

export function persistLinkedCandidateReference(
  reference: StoredLinkedCandidateReference,
): void {
  try {
    window.sessionStorage.setItem(
      LINKED_CANDIDATE_SESSION_KEY,
      JSON.stringify(reference),
    );
  } catch {
    // The current render still preserves comparison state without storage.
  }
}

export function clearLinkedCandidateReference(): void {
  try {
    window.sessionStorage.removeItem(LINKED_CANDIDATE_SESSION_KEY);
  } catch {
    // Private-browsing storage failures are non-fatal.
  }
}

export function measurementKey(measurement: SpaceMeasurement): string {
  return [
    measurement.widthMm,
    measurement.heightMm,
    measurement.depthMm,
    measurement.accessWidthMm ?? "unknown",
    measurement.uncertaintyMm,
  ].join(":");
}

export function parseMeasurementValue(input: string): number | undefined {
  const value = Number(input);
  return Number.isInteger(value) && value >= 100 && value <= 10_000
    ? value
    : undefined;
}

export function parseExactProductUrl(input: string): string | undefined {
  const trimmed = input.trim();
  if (!/^https:\/\//i.test(trimmed) || /\s/.test(trimmed)) return undefined;
  try {
    return normalizeProductUrl(trimmed);
  } catch {
    return undefined;
  }
}

export function normalizeProductUrl(input: string): string {
  const url = new URL(input);
  url.hash = "";
  for (const key of Array.from(url.searchParams.keys())) {
    if (isTrackingParameter(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

function workflowIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(/^\/fit\/jobs\/([^/]+)(?:\/|$)/);
  const candidate = match?.[1];
  return isFitWorkflowId(candidate) ? candidate : undefined;
}

function parseStoredSearchRequest(input: unknown): CreateLiveSearchRequest | undefined {
  if (!isRecord(input)) return undefined;
  const intent = parseStoredIntent(input.intent);
  const measurement = parseStoredMeasurement(input.measurement);
  const cachePolicy = parseCachePolicy(input.cachePolicy);
  if (intent === undefined || measurement === undefined || cachePolicy === undefined) {
    return undefined;
  }
  return { intent, measurement, cachePolicy };
}

function parseStoredIntent(input: unknown): CreateLiveSearchRequest["intent"] | undefined {
  if (!isRecord(input)) return undefined;
  if (input.kind === "product-link" && typeof input.url === "string") {
    const url = parseExactProductUrl(input.url);
    return url === undefined ? undefined : { kind: "product-link", url };
  }
  if (
    input.kind !== "prompt" ||
    typeof input.text !== "string" ||
    input.text.trim().length === 0 ||
    input.text.length > 500 ||
    !Array.isArray(input.retailers)
  ) {
    return undefined;
  }
  const retailers = [...new Set(input.retailers)].filter(
    (retailer): retailer is LiveRetailer => retailer === "ikea-au" || retailer === "kmart-au",
  );
  if (retailers.length === 0 || retailers.length !== input.retailers.length) {
    return undefined;
  }
  return { kind: "prompt", text: input.text.trim(), retailers };
}

function parseStoredMeasurement(input: unknown): SpaceMeasurement | undefined {
  if (!isRecord(input)) return undefined;
  const widthMm = parseMeasurementValue(String(input.widthMm));
  const heightMm = parseMeasurementValue(String(input.heightMm));
  const depthMm = parseMeasurementValue(String(input.depthMm));
  const accessWidthMm = input.accessWidthMm === undefined
    ? undefined
    : parseAccessMeasurementValue(String(input.accessWidthMm));
  const uncertaintyMm = typeof input.uncertaintyMm === "number" &&
    Number.isInteger(input.uncertaintyMm) &&
    input.uncertaintyMm >= 0 &&
    input.uncertaintyMm <= 1_000
      ? input.uncertaintyMm
      : undefined;
  const source = input.source === "manual" || input.source === "webxr" || input.source === "demo"
    ? input.source
    : undefined;
  if (
    widthMm === undefined ||
    heightMm === undefined ||
    depthMm === undefined ||
    (input.accessWidthMm !== undefined && accessWidthMm === undefined) ||
    uncertaintyMm === undefined ||
    source === undefined
  ) {
    return undefined;
  }
  return {
    widthMm,
    heightMm,
    depthMm,
    uncertaintyMm,
    ...(accessWidthMm === undefined ? {} : { accessWidthMm }),
    source,
  };
}

function parseAccessMeasurementValue(input: string): number | undefined {
  const value = Number(input);
  return Number.isInteger(value) && value >= 300 && value <= 3_000
    ? value
    : undefined;
}

function parseCachePolicy(input: unknown): CachePolicy | undefined {
  return input === "prefer-recent" || input === "force-refresh" ? input : undefined;
}

function isTrackingParameter(key: string): boolean {
  return /^utm_/i.test(key) || [
    "fbclid",
    "gclid",
    "dclid",
    "msclkid",
    "mc_cid",
    "mc_eid",
  ].includes(key.toLowerCase());
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
