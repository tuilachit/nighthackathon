import type {
  AccessCrossSectionDimension,
  FitEvaluation,
  ProductDimensions,
  SpaceMeasurement,
} from "@/lib/catalog-types";
import {
  LIVE_RETAILERS,
  LIVE_RETAILER_IDENTITIES,
  WORKFLOW_STATES,
  type ApproveCandidateResponse,
  type CachePolicy,
  type CreateLiveSearchRequest,
  type CreateLiveSearchResponse,
  type DeliveryAccessEvaluation,
  type DeliveryPackage,
  type LiveAsset,
  type LiveCandidate,
  type LiveProductObservation,
  type LiveRetailer,
  type LiveSearchIntent,
  type LiveSearchWorkflow,
} from "@/lib/live-search/types";

export class LiveSearchApiError extends Error {
  public readonly code: string;
  public readonly status: number;

  public constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "LiveSearchApiError";
    this.code = code;
    this.status = status;
  }
}

export async function startGuestSession(
  signal?: AbortSignal,
  captchaToken?: string,
): Promise<void> {
  await requestJson(
    "/api/v1/session",
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(captchaToken === undefined ? {} : { captchaToken }),
    },
    parseSessionResponse,
  );
}

export async function createLiveSearch(
  input: CreateLiveSearchRequest,
  idempotencyKey: string,
): Promise<CreateLiveSearchResponse> {
  return requestJson(
    "/api/v1/search-jobs",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(input),
    },
    parseCreateSearchResponse,
  );
}

export async function getLiveSearch(
  workflowId: string,
  signal?: AbortSignal,
): Promise<LiveSearchWorkflow> {
  return requestJson(
    `/api/v1/search-jobs/${encodeURIComponent(workflowId)}`,
    { method: "GET", cache: "no-store", signal },
    parseWorkflow,
  );
}

export async function approveLiveCandidate(
  workflowId: string,
  candidateId: string,
  idempotencyKey: string,
): Promise<ApproveCandidateResponse> {
  return requestJson(
    `/api/v1/search-jobs/${encodeURIComponent(workflowId)}/approve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ candidateId }),
    },
    parseApprovalResponse,
  );
}

export interface ComparisonInsightResponse {
  readonly insight?: string;
}

/**
 * Fetches the optional model-written comparison take. Callers must treat every
 * failure as "no insight" — the deterministic verdict is computed client-side
 * and never depends on this call.
 */
export async function fetchComparisonInsight(
  workflowId: string,
  firstCandidateId: string,
  secondCandidateId: string,
  signal?: AbortSignal,
): Promise<ComparisonInsightResponse> {
  const query = new URLSearchParams({ a: firstCandidateId, b: secondCandidateId });
  return requestJson(
    `/api/v1/search-jobs/${encodeURIComponent(workflowId)}/comparison-insight?${query.toString()}`,
    { method: "GET", cache: "no-store", signal },
    (payload: unknown): ComparisonInsightResponse => {
      if (typeof payload !== "object" || payload === null) {
        return {};
      }
      const insight = (payload as { insight?: unknown }).insight;
      return typeof insight === "string" && insight.length > 0 ? { insight } : {};
    },
  );
}

export interface CancelLiveSearchResponse {
  readonly workflowId: string;
  readonly state: LiveSearchWorkflow["state"];
  readonly alreadyTerminal: boolean;
  readonly providerStop: "not-needed" | "requested" | "failed";
}

export async function cancelLiveSearch(
  workflowId: string,
): Promise<CancelLiveSearchResponse> {
  return requestJson(
    `/api/v1/search-jobs/${encodeURIComponent(workflowId)}/cancel`,
    { method: "POST" },
    parseCancelResponse,
  );
}

export interface ComparisonShareSelection {
  readonly workflowId: string;
  readonly candidateId: string;
}

export async function createComparisonShare(
  selections: readonly ComparisonShareSelection[],
): Promise<{ readonly url: string; readonly expiresAt: string }> {
  const response = await requestJson(
    "/api/v1/comparison-shares",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selections }),
    },
    parseShareResponse,
  );
  return {
    url: new URL(response.path, window.location.origin).href,
    expiresAt: response.expiresAt,
  };
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  parse: (input: unknown) => T,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => undefined)) as unknown;
  if (!response.ok) {
    throw parseApiError(payload, response.status);
  }
  try {
    return parse(payload);
  } catch (error) {
    if (error instanceof LiveSearchApiError) {
      throw error;
    }
    throw new LiveSearchApiError(
      "The live-search service returned data this app could not safely use.",
      "invalid_response",
      502,
    );
  }
}

function parseApiError(input: unknown, status: number): LiveSearchApiError {
  const body = record(input);
  const error = record(body?.error);
  const message = string(error?.message);
  const code = string(error?.code);
  return new LiveSearchApiError(
    message ?? "The live-search request could not be completed.",
    code ?? "request_failed",
    status,
  );
}

function parseSessionResponse(input: unknown): void {
  const row = requireRecord(input);
  if (row.authenticated !== true) {
    throw new Error("Session response was invalid.");
  }
}

function parseCreateSearchResponse(input: unknown): CreateLiveSearchResponse {
  const row = requireRecord(input);
  const workflowId = requireUuid(row.workflowId);
  const state = requireWorkflowState(row.state);
  if (
    typeof row.reused !== "boolean" ||
    typeof row.cacheHit !== "boolean" ||
    (row.freshness !== "cached" && row.freshness !== "live")
  ) {
    throw new Error("Search response was invalid.");
  }
  const checkedAt = row.checkedAt === undefined ? undefined : requireIsoDate(row.checkedAt);
  return {
    workflowId,
    state,
    reused: row.reused,
    cacheHit: row.cacheHit,
    freshness: row.freshness,
    ...(checkedAt === undefined ? {} : { checkedAt }),
  };
}

function parseApprovalResponse(input: unknown): ApproveCandidateResponse {
  const row = requireRecord(input);
  return {
    workflowId: requireUuid(row.workflowId),
    candidateId: requireUuid(row.candidateId),
    state: requireWorkflowState(row.state),
  };
}

function parseCancelResponse(input: unknown): CancelLiveSearchResponse {
  const row = requireRecord(input);
  const providerStop = row.providerStop;
  if (
    typeof row.alreadyTerminal !== "boolean" ||
    (providerStop !== "not-needed" && providerStop !== "requested" && providerStop !== "failed")
  ) {
    throw new Error("Cancellation response was invalid.");
  }
  return {
    workflowId: requireUuid(row.workflowId),
    state: requireWorkflowState(row.state),
    alreadyTerminal: row.alreadyTerminal,
    providerStop,
  };
}

function parseShareResponse(input: unknown): { readonly path: string; readonly expiresAt: string } {
  const row = requireRecord(input);
  const path = requireString(row.path);
  if (!/^\/fit\/share\/[A-Za-z0-9_-]{43}$/.test(path)) {
    throw new Error("Comparison share path was invalid.");
  }
  return { path, expiresAt: requireIsoDate(row.expiresAt) };
}

function parseWorkflow(input: unknown): LiveSearchWorkflow {
  const row = requireRecord(input);
  const retailers = requireArray(row.retailers).map(requireRetailer);
  const candidates = requireArray(row.candidates).map(parseCandidate);
  if (typeof row.isPartial !== "boolean") {
    throw new Error("Workflow coverage status was invalid.");
  }
  const coverageNotes = requireArray(row.coverageNotes).map(requireString);
  const queryText = requireString(row.queryText);
  const intent = row.intent === undefined ? undefined : parseIntent(row.intent);
  const createdAt = requireIsoDate(row.createdAt);
  const updatedAt = requireIsoDate(row.updatedAt);
  const approvedCandidateId = row.approvedCandidateId === undefined
    ? undefined
    : requireUuid(row.approvedCandidateId);
  const workflowError = row.error === undefined ? undefined : parseWorkflowError(row.error);
  return {
    id: requireUuid(row.id),
    state: requireWorkflowState(row.state),
    queryText,
    ...(intent === undefined ? {} : { intent }),
    measurement: parseMeasurement(row.measurement),
    retailers,
    ...(row.cachePolicy === undefined ? {} : { cachePolicy: parseCachePolicy(row.cachePolicy) }),
    ...(typeof row.cacheHit === "boolean" ? { cacheHit: row.cacheHit } : {}),
    ...(row.freshness === "cached" || row.freshness === "live" ? { freshness: row.freshness } : {}),
    ...(row.checkedAt === undefined ? {} : { checkedAt: requireIsoDate(row.checkedAt) }),
    candidates,
    isPartial: row.isPartial,
    coverageNotes,
    ...(approvedCandidateId === undefined ? {} : { approvedCandidateId }),
    ...(workflowError === undefined ? {} : { error: workflowError }),
    createdAt,
    updatedAt,
  };
}

function parseCandidate(input: unknown): LiveCandidate {
  const row = requireRecord(input);
  const fitStatus = row.fitStatus;
  if (fitStatus !== "fits" && fitStatus !== "access_issue" && fitStatus !== "near_miss") {
    throw new Error("Candidate status was invalid.");
  }
  const rank = requireFiniteNumber(row.rank);
  if (!Number.isInteger(rank) || rank < 0) {
    throw new Error("Candidate rank was invalid.");
  }
  const asset = row.asset === undefined ? undefined : parseAsset(row.asset);
  return {
    id: requireUuid(row.id),
    rank,
    fitStatus,
    observation: parseObservation(row.observation),
    fit: parseFit(row.fit),
    access: parseAccess(row.access),
    ...(asset === undefined ? {} : { asset }),
  };
}

function parseObservation(input: unknown): LiveProductObservation {
  const row = requireRecord(input);
  const availability = row.availability;
  if (availability !== "in_stock" && availability !== "out_of_stock" && availability !== "unknown") {
    throw new Error("Product availability was invalid.");
  }
  const dimensionsSource = row.dimensionsSource;
  if (
    dimensionsSource !== "retailer-page" &&
    dimensionsSource !== "retailer-api" &&
    dimensionsSource !== "json-ld"
  ) {
    throw new Error("Dimension source was invalid.");
  }
  if (typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency) || row.confidence !== "high") {
    throw new Error("Product verification was invalid.");
  }
  const productUrl = requireSafeHttpsUrl(row.productUrl);
  const imageUrl = requireSafeHttpsUrl(row.imageUrl);
  const priceMinor = requireFiniteNumber(row.priceMinor);
  if (!Number.isInteger(priceMinor) || priceMinor < 1) {
    throw new Error("Product price was invalid.");
  }
  const packages = row.packages === undefined
    ? []
    : requireArray(row.packages).map(parseDeliveryPackage);
  return {
    retailer: parseRetailerIdentity(row.retailer),
    retailerProductId: requireString(row.retailerProductId),
    name: requireString(row.name),
    category: requireString(row.category),
    productUrl,
    imageUrl,
    priceMinor,
    currency: row.currency,
    availability,
    assembledDimensions: parseDimensions(row.assembledDimensions),
    packages,
    dimensionsSource,
    dimensionsEvidence: requireString(row.dimensionsEvidence),
    observedAt: requireIsoDate(row.observedAt),
    confidence: "high",
  };
}

function parseFit(input: unknown): FitEvaluation {
  const row = requireRecord(input);
  const orientation = row.orientation;
  const confidence = row.confidence;
  if (orientation !== "default" && orientation !== "rotated-90") {
    throw new Error("Fit orientation was invalid.");
  }
  if (confidence !== "high" && confidence !== "medium" && confidence !== "low") {
    throw new Error("Fit confidence was invalid.");
  }
  if (typeof row.fits !== "boolean") {
    throw new Error("Fit result was invalid.");
  }
  const reasons = requireArray(row.reasons).map(requireString);
  return {
    fits: row.fits,
    orientation,
    widthClearanceMm: requireFiniteNumber(row.widthClearanceMm),
    heightClearanceMm: requireFiniteNumber(row.heightClearanceMm),
    depthClearanceMm: requireFiniteNumber(row.depthClearanceMm),
    minimumClearanceMm: requireFiniteNumber(row.minimumClearanceMm),
    confidence,
    reasons,
  };
}

function parseAccess(input: unknown): DeliveryAccessEvaluation {
  const row = requireRecord(input);
  if (row.status === "skipped" && row.passes === true) {
    return { status: "skipped", passes: true, basis: "unknown" };
  }
  const basis = row.basis === "package" ? "package" : "assembled-advisory";
  const packageIndex = row.controllingPackageIndex === undefined
    ? undefined
    : requireFiniteNumber(row.controllingPackageIndex);
  if (packageIndex !== undefined && (!Number.isInteger(packageIndex) || packageIndex < 0)) {
    throw new Error("Access package index was invalid.");
  }
  if (basis === "package" && packageIndex === undefined) {
    throw new Error("Package-based access result omitted its controlling package.");
  }
  const packageLabel = row.controllingPackageLabel === undefined
    ? undefined
    : requireString(row.controllingPackageLabel);
  const crossSection = parseCrossSection(row.crossSection);
  const accessWidthMm = requireFiniteNumber(row.accessWidthMm);
  if (row.status === "passed" && row.passes === true) {
    const base = {
      status: "passed",
      passes: true,
      accessWidthMm,
      crossSection,
      clearanceMm: requireFiniteNumber(row.clearanceMm),
    } as const;
    return basis === "package"
      ? {
          ...base,
          basis,
          controllingPackageIndex: packageIndex as number,
          ...(packageLabel === undefined ? {} : { controllingPackageLabel: packageLabel }),
        }
      : { ...base, basis };
  }
  if (row.status === "failed" && row.passes === false) {
    const base = {
      status: "failed",
      passes: false,
      accessWidthMm,
      crossSection,
      deficitMm: requireFiniteNumber(row.deficitMm),
      reason: requireString(row.reason),
    } as const;
    return basis === "package"
      ? {
          ...base,
          basis,
          controllingPackageIndex: packageIndex as number,
          ...(packageLabel === undefined ? {} : { controllingPackageLabel: packageLabel }),
        }
      : { ...base, basis };
  }
  throw new Error("Access result was invalid.");
}

function parseCrossSection(input: unknown): readonly [AccessCrossSectionDimension, AccessCrossSectionDimension] {
  const entries = requireArray(input);
  if (entries.length !== 2) {
    throw new Error("Access cross-section was invalid.");
  }
  return [parseCrossSectionDimension(entries[0]), parseCrossSectionDimension(entries[1])];
}

function parseCrossSectionDimension(input: unknown): AccessCrossSectionDimension {
  const row = requireRecord(input);
  const axis = row.axis;
  if (axis !== "width" && axis !== "depth" && axis !== "height") {
    throw new Error("Access cross-section axis was invalid.");
  }
  return { axis, sizeMm: requireFiniteNumber(row.sizeMm) };
}

function parseAsset(input: unknown): LiveAsset {
  const row = requireRecord(input);
  const kind = row.kind;
  if (kind !== "glb" && kind !== "usdz") {
    throw new Error("Model asset type was invalid.");
  }
  if (row.scaleVerified !== true) {
    throw new Error("An unverified model asset was rejected.");
  }
  return {
    id: requireUuid(row.id),
    kind,
    url: requireSafeHttpsUrl(row.url),
    dimensions: parseDimensions(row.dimensions),
    scaleVerified: true,
  };
}

function parseMeasurement(input: unknown): SpaceMeasurement {
  const row = requireRecord(input);
  const source = row.source;
  if (source !== "manual" && source !== "demo" && source !== "webxr") {
    throw new Error("Measurement source was invalid.");
  }
  const accessWidthMm = row.accessWidthMm === undefined
    ? undefined
    : requirePositiveNumber(row.accessWidthMm);
  return {
    ...parseDimensions(row),
    uncertaintyMm: requireNonNegativeNumber(row.uncertaintyMm),
    ...(accessWidthMm === undefined ? {} : { accessWidthMm }),
    source,
  };
}

function parseDimensions(input: unknown): ProductDimensions {
  const row = requireRecord(input);
  return {
    widthMm: requirePositiveNumber(row.widthMm),
    heightMm: requirePositiveNumber(row.heightMm),
    depthMm: requirePositiveNumber(row.depthMm),
  };
}

function parseDeliveryPackage(input: unknown): DeliveryPackage {
  const row = requireRecord(input);
  return {
    ...parseDimensions(row),
    ...(row.label === undefined ? {} : { label: requireString(row.label) }),
  };
}

function parseRetailerIdentity(input: unknown): LiveProductObservation["retailer"] {
  if (typeof input === "string" && LIVE_RETAILERS.includes(input as LiveRetailer)) {
    return LIVE_RETAILER_IDENTITIES[input as LiveRetailer];
  }
  const row = requireRecord(input);
  const key = requireString(row.key);
  const label = requireString(row.label);
  const host = requireString(row.host).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || !/^[a-z0-9.-]+$/.test(host)) {
    throw new Error("Retailer identity was invalid.");
  }
  return { key, label, host };
}

function parseIntent(input: unknown): LiveSearchIntent {
  const row = requireRecord(input);
  if (row.kind === "product-link") {
    return { kind: "product-link", url: requireSafeHttpsUrl(row.url) };
  }
  if (row.kind === "prompt") {
    return {
      kind: "prompt",
      text: requireString(row.text),
      retailers: requireArray(row.retailers).map(requireRetailer),
    };
  }
  throw new Error("Search intent was invalid.");
}

function parseCachePolicy(input: unknown): CachePolicy {
  if (input !== "prefer-recent" && input !== "force-refresh") {
    throw new Error("Cache policy was invalid.");
  }
  return input;
}

function parseWorkflowError(input: unknown): { readonly code: string; readonly message: string } {
  const row = requireRecord(input);
  return { code: requireString(row.code), message: requireString(row.message) };
}

function requireRetailer(input: unknown): LiveRetailer {
  if (typeof input !== "string" || !LIVE_RETAILERS.includes(input as LiveRetailer)) {
    throw new Error("Retailer was invalid.");
  }
  return input as LiveRetailer;
}

function requireWorkflowState(input: unknown): LiveSearchWorkflow["state"] {
  if (typeof input !== "string" || !WORKFLOW_STATES.includes(input as LiveSearchWorkflow["state"])) {
    throw new Error("Workflow state was invalid.");
  }
  return input as LiveSearchWorkflow["state"];
}

function requireRecord(input: unknown): Record<string, unknown> {
  const value = record(input);
  if (value === undefined) {
    throw new Error("Expected an object.");
  }
  return value;
}

function record(input: unknown): Record<string, unknown> | undefined {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined;
}

function requireArray(input: unknown): readonly unknown[] {
  if (!Array.isArray(input)) {
    throw new Error("Expected an array.");
  }
  return input;
}

function requireString(input: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("Expected text.");
  }
  return input;
}

function string(input: unknown): string | undefined {
  return typeof input === "string" && input.trim().length > 0 ? input : undefined;
}

function requireFiniteNumber(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    throw new Error("Expected a finite number.");
  }
  return input;
}

function requirePositiveNumber(input: unknown): number {
  const value = requireFiniteNumber(input);
  if (value <= 0) {
    throw new Error("Expected a positive number.");
  }
  return value;
}

function requireNonNegativeNumber(input: unknown): number {
  const value = requireFiniteNumber(input);
  if (value < 0) {
    throw new Error("Expected a non-negative number.");
  }
  return value;
}

function requireUuid(input: unknown): string {
  if (
    typeof input !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)
  ) {
    throw new Error("Expected a UUID.");
  }
  return input;
}

function requireIsoDate(input: unknown): string {
  const value = requireString(input);
  if (Number.isNaN(Date.parse(value))) {
    throw new Error("Expected an ISO date.");
  }
  return value;
}

function requireSafeHttpsUrl(input: unknown): string {
  const value = requireString(input);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error("Expected a safe HTTPS URL.");
  }
  return parsed.toString();
}
