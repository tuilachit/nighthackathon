import "server-only";

import type {
  AccessCrossSectionDimension,
  FitEvaluation,
  ProductDimensions,
  SpaceMeasurement,
} from "@/lib/catalog-types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  IdempotencyConflictError,
  InvalidWorkflowStateError,
  LiveSearchUnavailableError,
  RateLimitExceededError,
  ResourceNotFoundError,
} from "./http";
import type {
  CachePolicy,
  CreateLiveSearchRequest,
  DeliveryAccessEvaluation,
  DeliveryPackage,
  LiveAsset,
  LiveCandidate,
  LiveProductObservation,
  LiveRetailer,
  LiveSearchIntent,
  LiveSearchWorkflow,
  RetailerIdentity,
  WorkflowState,
  VerifiedLiveCandidateRecord,
} from "./types";
import { LIVE_RETAILER_IDENTITIES } from "./types";
import { buildDiscoveryCacheIdentity } from "./discovery-cache";
import { isUuid, isWorkflowState } from "./validation";

interface CreatedWorkflow {
  readonly workflowId: string;
  readonly state: WorkflowState;
  readonly reused: boolean;
  readonly cacheHit: boolean;
  readonly freshness: "cached" | "live";
  readonly cachePayload?: unknown;
}

const DISPATCH_DISPOSITIONS = [
  "claimed_for_submission",
  "claimed_for_retry",
  "submission_in_flight",
  "retry_scheduled",
  "retry_blocked_by_circuit",
  "deadline_reconciliation_required",
  "provider_in_flight",
  "terminal",
  "completed",
  "cancelled",
] as const;

type DispatchDisposition = (typeof DISPATCH_DISPOSITIONS)[number];

interface ClaimedSearchDispatch {
  readonly providerTaskId: string;
  readonly shouldSubmit: boolean;
  readonly disposition: DispatchDisposition;
}

interface WorkflowCommand {
  readonly id: string;
  readonly queryText: string;
  readonly intent: LiveSearchIntent;
  readonly measurement: SpaceMeasurement;
  readonly retailers: readonly LiveRetailer[];
  readonly cachePolicy: CachePolicy;
  readonly cacheKey: string;
  readonly requestHash: string;
}

interface ClaimedModelDispatch {
  readonly providerTaskId: string;
  readonly shouldSubmit: boolean;
  readonly disposition: DispatchDisposition;
  readonly candidateId: string;
  readonly imageUrl: string;
  readonly dimensions: ProductDimensions;
}

export interface ProviderTaskContext {
  readonly providerTaskId: string;
  readonly workflowId: string;
  readonly inputHash: string;
  readonly workflowState: WorkflowState;
  readonly candidateId?: string;
  readonly imageUrl?: string;
  readonly dimensions?: ProductDimensions;
}

export interface RegisteredWebhook {
  readonly inboxId: string;
  readonly duplicate: boolean;
}

export type DurableQueueName =
  | "retailer_search"
  | "model_generation"
  | "webhook_processing";

export interface DurableQueueMessage {
  readonly messageId: number;
  readonly readCount: number;
  readonly message: Readonly<Record<string, unknown>>;
}

export interface StoredWebhook {
  readonly inboxId: string;
  readonly provider: "browser_use" | "meshy";
  readonly payload: Readonly<Record<string, unknown>>;
  readonly processed: boolean;
  readonly attempts: number;
}

export interface DueProviderTask {
  readonly providerTaskId: string;
  readonly provider: "browser_use" | "meshy";
  readonly stage: "retailer_search" | "model_generation";
  readonly externalTaskId?: string;
  readonly workflowId: string;
  readonly inputHash: string;
  readonly state: "retry_ready" | "waiting_provider" | "submission_unknown" | "failed";
  readonly disposition:
    | "poll_provider"
    | "retry_submission"
    | "fail_ambiguous_submission"
    | "fail_provider_deadline";
  readonly attempts: number;
  readonly pollCount: number;
  readonly deadlineAt: string;
}

export async function createWorkflow(
  ownerId: string,
  actorHash: string,
  input: CreateLiveSearchRequest,
  requestHash: string,
  idempotencyKey: string,
): Promise<CreatedWorkflow> {
  const cache = buildDiscoveryCacheIdentity(input.intent);
  const retailers = input.intent.kind === "prompt" ? input.intent.retailers : [];
  const querySummary = input.intent.kind === "prompt" ? input.intent.text : input.intent.url;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("create_search_workflow", {
    p_owner_id: ownerId,
    p_intent_kind: input.intent.kind,
    p_intent_json: cache.canonicalIntent,
    p_actor_hash: actorHash,
    p_query_summary: querySummary,
    p_width_mm: input.measurement.widthMm,
    p_height_mm: input.measurement.heightMm,
    p_depth_mm: input.measurement.depthMm,
    p_access_width_mm: input.measurement.accessWidthMm ?? null,
    p_uncertainty_mm: input.measurement.uncertaintyMm,
    p_measurement_source: input.measurement.source,
    p_retailers: retailers,
    p_cache_policy: input.cachePolicy,
    p_cache_key: cache.key,
    p_extraction_schema_version: cache.extractionSchemaVersion,
    p_request_hash: requestHash,
    p_idempotency_key: idempotencyKey,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  return parseCreatedWorkflow(firstRow(data));
}

export async function getWorkflowCommand(workflowId: string): Promise<WorkflowCommand> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("id,query_text,intent_kind,intent_json,cache_policy,cache_key,width_mm,height_mm,depth_mm,access_width_mm,uncertainty_mm,measurement_source,retailers,request_hash")
    .eq("id", workflowId)
    .maybeSingle();
  if (error !== null) {
    throw new Error(error.message);
  }
  if (data === null) {
    throw new ResourceNotFoundError("Workflow");
  }
  return parseWorkflowCommand(data);
}

export async function getWorkflowForOwner(
  workflowId: string,
  ownerId: string,
): Promise<LiveSearchWorkflow> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_get_workflow_snapshot", {
    p_workflow_id: workflowId,
    p_owner_id: ownerId,
  });
  if (error !== null) {
    throw new Error(error.message);
  }
  const snapshotValue = Array.isArray(data) ? data[0] : data;
  if (snapshotValue === undefined || snapshotValue === null) {
    throw new ResourceNotFoundError("Workflow");
  }
  const snapshot = recordValue(snapshotValue);
  const workflowData = recordValue(snapshot.workflow);
  const candidateData = arrayValue(snapshot.candidates);
  const assetData = arrayValue(snapshot.assets);
  const assets = assetData.map(parseAsset);
  const assetsByCandidate = new Map<string, LiveAsset>();
  for (const { candidateId, asset } of assets) {
    const current = assetsByCandidate.get(candidateId);
    if (current === undefined || (asset.kind === "glb" && current.kind !== "glb")) {
      assetsByCandidate.set(candidateId, asset);
    }
  }
  const candidates = candidateData.map((row) => {
    const candidate = parseCandidate(row);
    const asset = assetsByCandidate.get(candidate.id);
    return asset === undefined ? candidate : { ...candidate, asset };
  });
  return parseWorkflow(workflowData, candidates);
}

export async function approveCandidate(
  ownerId: string,
  workflowId: string,
  candidateId: string,
  idempotencyKey: string,
): Promise<{
  readonly workflowId: string;
  readonly candidateId: string;
  readonly state: WorkflowState;
  readonly requestHash: string;
}> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("approve_workflow_candidate", {
    p_owner_id: ownerId,
    p_workflow_id: workflowId,
    p_candidate_id: candidateId,
    p_idempotency_key: idempotencyKey,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const row = recordValue(firstRow(data));
  const state = row.workflow_state;
  if (
    !isUuid(row.workflow_id) ||
    !isUuid(row.candidate_id) ||
    !isWorkflowState(state) ||
    typeof row.model_request_hash !== "string"
  ) {
    throw new Error("Approval RPC returned an invalid result.");
  }
  return {
    workflowId: row.workflow_id,
    candidateId: row.candidate_id,
    state,
    requestHash: row.model_request_hash,
  };
}

export async function claimSearchDispatch(
  workflowId: string,
  inputHash: string,
): Promise<ClaimedSearchDispatch> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_claim_search_dispatch", {
    p_workflow_id: workflowId,
    p_input_hash: inputHash,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const row = recordValue(firstRow(data));
  const disposition = parseDispatchDisposition(row.dispatch_disposition);
  if (
    !isUuid(row.provider_task_id) ||
    typeof row.should_submit !== "boolean" ||
    disposition === undefined
  ) {
    throw new Error("Search dispatch claim returned an invalid result.");
  }
  return {
    providerTaskId: row.provider_task_id,
    shouldSubmit: row.should_submit,
    disposition,
  };
}

export async function recordBrowserSubmission(
  workflowId: string,
  providerTaskId: string,
  externalTaskId: string,
  metadata: Readonly<Record<string, unknown>>,
): Promise<void> {
  await invokeInternal("internal_record_browser_submission", {
    p_workflow_id: workflowId,
    p_provider_task_id: providerTaskId,
    p_external_task_id: externalTaskId,
    p_provider_metadata: metadata,
  });
}

export async function recordSearchResults(
  workflowId: string,
  externalTaskId: string,
  candidates: readonly VerifiedLiveCandidateRecord[],
  isPartial: boolean,
  coverageNotes: readonly string[],
  metadata: Readonly<Record<string, unknown>>,
): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_record_search_results", {
    p_workflow_id: workflowId,
    p_external_task_id: externalTaskId,
    p_candidates: candidates,
    p_is_partial: isPartial,
    p_coverage_notes: coverageNotes,
    p_provider_metadata: metadata,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  if (typeof data !== "number" || !Number.isInteger(data) || data < 0) {
    throw new Error("Search result RPC returned an invalid count.");
  }
  return data;
}

/** Atomically completes the synchronous Firecrawl-first path without an async provider ID. */
export async function recordSynchronousSearchResults(
  workflowId: string,
  providerTaskId: string,
  candidates: readonly VerifiedLiveCandidateRecord[],
  isPartial: boolean,
  coverageNotes: readonly string[],
  metadata: Readonly<Record<string, unknown>>,
): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_record_synchronous_search_results", {
    p_workflow_id: workflowId,
    p_provider_task_id: providerTaskId,
    p_candidates: candidates,
    p_is_partial: isPartial,
    p_coverage_notes: coverageNotes,
    p_provider_metadata: metadata,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  if (typeof data !== "number" || !Number.isInteger(data) || data < 0) {
    throw new Error("Synchronous search result RPC returned an invalid count.");
  }
  return data;
}

export async function recordCachedSearchResults(
  workflowId: string,
  candidates: readonly VerifiedLiveCandidateRecord[],
  isPartial: boolean,
  coverageNotes: readonly string[],
  metadata: Readonly<Record<string, unknown>>,
): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_record_cached_search_results", {
    p_workflow_id: workflowId,
    p_candidates: candidates,
    p_is_partial: isPartial,
    p_coverage_notes: coverageNotes,
    p_cache_metadata: metadata,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const count = integer(data);
  if (count === undefined || count < 0) {
    throw new Error("Cached search result RPC returned an invalid count.");
  }
  return count;
}

export async function recordDiscoveryCache(
  cacheKey: string,
  extractionSchemaVersion: number,
  output: unknown,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_record_discovery_cache", {
    p_cache_key: cacheKey,
    p_extraction_schema_version: extractionSchemaVersion,
    p_payload: output,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const row = recordValue(data);
  if (typeof row.cachedAt !== "string" || typeof row.expiresAt !== "string") {
    throw new Error("Discovery cache RPC returned invalid timestamps.");
  }
}

export async function claimModelDispatch(
  workflowId: string,
  inputHash: string,
): Promise<ClaimedModelDispatch> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_claim_model_dispatch", {
    p_workflow_id: workflowId,
    p_input_hash: inputHash,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const row = recordValue(firstRow(data));
  const disposition = parseDispatchDisposition(row.dispatch_disposition);
  if (
    !isUuid(row.provider_task_id) ||
    typeof row.should_submit !== "boolean" ||
    !isUuid(row.candidate_id) ||
    typeof row.image_url !== "string" ||
    disposition === undefined
  ) {
    throw new Error("Model dispatch claim returned an invalid result.");
  }
  return {
    providerTaskId: row.provider_task_id,
    shouldSubmit: row.should_submit,
    disposition,
    candidateId: row.candidate_id,
    imageUrl: row.image_url,
    dimensions: parseDimensions(row),
  };
}

export async function recordMeshySubmission(
  workflowId: string,
  providerTaskId: string,
  externalTaskId: string,
): Promise<void> {
  await invokeInternal("internal_record_meshy_submission", {
    p_workflow_id: workflowId,
    p_provider_task_id: providerTaskId,
    p_external_task_id: externalTaskId,
  });
}

export async function registerWebhook(
  provider: "browser_use" | "meshy",
  eventKey: string,
  payloadHash: string,
  payload: unknown,
): Promise<RegisteredWebhook> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_register_webhook", {
    p_provider: provider,
    p_event_key: eventKey,
    p_payload_hash: payloadHash,
    p_payload: payload,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const row = recordValue(firstRow(data));
  if (!isUuid(row.inbox_id) || typeof row.duplicate !== "boolean") {
    throw new Error("Webhook inbox RPC returned an invalid result.");
  }
  return { inboxId: row.inbox_id, duplicate: row.duplicate };
}

export async function findProviderTask(
  provider: "browser_use" | "meshy",
  externalTaskId: string,
): Promise<ProviderTaskContext> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_find_provider_task", {
    p_provider: provider,
    p_external_task_id: externalTaskId,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const row = recordValue(firstRow(data));
  if (
    !isUuid(row.provider_task_id) ||
    !isUuid(row.workflow_id) ||
    typeof row.input_hash !== "string" ||
    !isWorkflowState(row.workflow_state)
  ) {
    throw new ResourceNotFoundError("Provider task");
  }
  const candidateId = isUuid(row.candidate_id) ? row.candidate_id : undefined;
  return {
    providerTaskId: row.provider_task_id,
    workflowId: row.workflow_id,
    inputHash: row.input_hash,
    workflowState: row.workflow_state,
    ...(candidateId === undefined ? {} : { candidateId }),
    ...(typeof row.image_url !== "string" ? {} : { imageUrl: row.image_url }),
    ...(candidateId === undefined ? {} : { dimensions: parseDimensions(row) }),
  };
}

export async function completeModelAsset(input: {
  readonly workflowId: string;
  readonly externalTaskId: string;
  readonly candidateId: string;
  readonly kind: "glb" | "usdz";
  readonly storageBucket: string;
  readonly storagePath: string;
  readonly publicUrl: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly dimensions: ProductDimensions;
  readonly providerMetadata: Readonly<Record<string, unknown>>;
}): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_complete_model_asset", {
    p_workflow_id: input.workflowId,
    p_external_task_id: input.externalTaskId,
    p_candidate_id: input.candidateId,
    p_kind: input.kind,
    p_storage_bucket: input.storageBucket,
    p_storage_path: input.storagePath,
    p_public_url: input.publicUrl,
    p_content_sha256: input.sha256,
    p_byte_size: input.byteSize,
    p_width_mm: input.dimensions.widthMm,
    p_height_mm: input.dimensions.heightMm,
    p_depth_mm: input.dimensions.depthMm,
    p_provider_metadata: input.providerMetadata,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  if (!isUuid(data)) {
    throw new Error("Asset completion RPC returned an invalid id.");
  }
  return data;
}

export async function failWorkflowStage(input: {
  readonly workflowId: string;
  readonly provider: "browser_use" | "meshy";
  readonly externalTaskId?: string;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly retryable: boolean;
}): Promise<void> {
  await invokeInternal("internal_fail_workflow_stage", {
    p_workflow_id: input.workflowId,
    p_provider: input.provider,
    p_external_task_id: input.externalTaskId ?? null,
    p_error_code: input.errorCode,
    p_error_message: input.errorMessage,
    p_retryable: input.retryable,
  });
}

export async function markWebhookProcessed(inboxId: string, error?: string): Promise<void> {
  await invokeInternal("internal_mark_webhook_processed", {
    p_inbox_id: inboxId,
    p_error: error ?? null,
  });
}

export async function readDurableQueue(
  queue: DurableQueueName,
  quantity: number,
): Promise<readonly DurableQueueMessage[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_read_queue", {
    p_queue: queue,
    p_visibility_timeout: 120,
    p_quantity: quantity,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  return arrayValue(data).map((input) => {
    const row = recordValue(input);
    const messageId = integer(row.message_id);
    const readCount = integer(row.read_count);
    if (messageId === undefined || messageId <= 0 || readCount === undefined || readCount <= 0) {
      throw new Error("Queue RPC returned invalid message metadata.");
    }
    return { messageId, readCount, message: recordValue(row.message) };
  });
}

export async function archiveDurableQueueMessage(
  queue: DurableQueueName,
  messageId: number,
): Promise<boolean> {
  return invokeBoolean("internal_archive_queue_message", {
    p_queue: queue,
    p_message_id: messageId,
  });
}

export async function deadLetterDurableQueueMessage(
  queue: DurableQueueName,
  value: DurableQueueMessage,
  reason: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("internal_dead_letter_queue_message", {
    p_queue: queue,
    p_message_id: value.messageId,
    p_message: value.message,
    p_reason: reason.slice(0, 500),
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
}

export async function getWebhookForProcessing(inboxId: string): Promise<StoredWebhook> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_get_webhook", {
    p_inbox_id: inboxId,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const row = recordValue(firstRow(data));
  const attempts = integer(row.attempts);
  if (
    !isUuid(row.inbox_id) ||
    (row.provider !== "browser_use" && row.provider !== "meshy") ||
    attempts === undefined ||
    attempts < 0
  ) {
    throw new Error("Webhook lookup RPC returned invalid metadata.");
  }
  return {
    inboxId: row.inbox_id,
    provider: row.provider,
    payload: recordValue(row.payload),
    processed: typeof row.processed_at === "string",
    attempts,
  };
}

export async function listDueProviderTasks(
  limit: number,
): Promise<readonly DueProviderTask[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_list_due_provider_tasks", {
    p_limit: limit,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  return arrayValue(data).map((input) => {
    const row = recordValue(input);
    const attempts = integer(row.attempts);
    const pollCount = integer(row.poll_count);
    const disposition = row.reconciliation_disposition;
    const terminalDisposition =
      disposition === "fail_ambiguous_submission" ||
      disposition === "fail_provider_deadline";
    const providerStageMatches =
      (row.provider === "browser_use" && row.stage === "retailer_search") ||
      (row.provider === "meshy" && row.stage === "model_generation");
    const externalTaskId = typeof row.external_task_id === "string"
      && row.external_task_id.length > 0
      && row.external_task_id.length <= 200
      ? row.external_task_id
      : undefined;
    if (
      !isUuid(row.provider_task_id) ||
      (row.provider !== "browser_use" && row.provider !== "meshy") ||
      (row.stage !== "retailer_search" && row.stage !== "model_generation") ||
      !providerStageMatches ||
      !isUuid(row.workflow_id) ||
      typeof row.input_hash !== "string" ||
      !/^[0-9a-f]{64}$/.test(row.input_hash) ||
      (disposition !== "poll_provider" &&
        disposition !== "retry_submission" &&
        !terminalDisposition) ||
      (disposition === "poll_provider" &&
        row.task_state !== "waiting_provider" &&
        row.task_state !== "submission_unknown") ||
      (disposition === "retry_submission" && row.task_state !== "retry_ready") ||
      (disposition === "retry_submission" && row.external_task_id != null) ||
      (terminalDisposition && row.task_state !== "failed") ||
      (disposition === "poll_provider" && externalTaskId === undefined) ||
      (disposition === "fail_ambiguous_submission" && row.external_task_id != null) ||
      (row.external_task_id != null && externalTaskId === undefined) ||
      attempts === undefined ||
      attempts < 1 ||
      pollCount === undefined ||
      pollCount < 0 ||
      typeof row.deadline_at !== "string" ||
      Number.isNaN(Date.parse(row.deadline_at))
    ) {
      throw new Error("Provider reconciliation RPC returned an invalid task.");
    }
    const state = row.task_state === "waiting_provider" || row.task_state === "submission_unknown"
      ? row.task_state
      : row.task_state === "retry_ready"
        ? "retry_ready"
        : "failed";
    return {
      providerTaskId: row.provider_task_id,
      provider: row.provider,
      stage: row.stage,
      ...(externalTaskId === undefined
        ? {}
        : { externalTaskId }),
      workflowId: row.workflow_id,
      inputHash: row.input_hash,
      state,
      disposition,
      attempts,
      pollCount,
      deadlineAt: row.deadline_at,
    };
  });
}

function parseDispatchDisposition(value: unknown): DispatchDisposition | undefined {
  return typeof value === "string" && DISPATCH_DISPOSITIONS.includes(value as DispatchDisposition)
    ? (value as DispatchDisposition)
    : undefined;
}

export async function touchProviderReconciliation(
  providerTaskId: string,
  delaySeconds: number,
  providerStatus?: string,
): Promise<boolean> {
  return invokeBoolean("internal_touch_provider_reconciliation", {
    p_provider_task_id: providerTaskId,
    p_delay_seconds: delaySeconds,
    p_provider_status: providerStatus ?? null,
  });
}

export async function expireDueWorkflows(limit: number): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_expire_workflows", {
    p_limit: limit,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const count = integer(data);
  if (count === undefined || count < 0) {
    throw new Error("Workflow expiry RPC returned an invalid count.");
  }
  return count;
}

export interface CancelledWorkflow {
  readonly workflowId: string;
  readonly state: WorkflowState;
  readonly alreadyTerminal: boolean;
  readonly browserExternalId?: string;
}

export async function cancelWorkflowForOwner(
  ownerId: string,
  workflowId: string,
): Promise<CancelledWorkflow> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("cancel_workflow", {
    p_owner_id: ownerId,
    p_workflow_id: workflowId,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const row = recordValue(data);
  if (
    row.workflowId !== workflowId ||
    !isWorkflowState(row.state) ||
    typeof row.alreadyTerminal !== "boolean" ||
    (row.browserExternalId !== undefined && typeof row.browserExternalId !== "string")
  ) {
    throw new Error("Workflow cancellation RPC returned an invalid result.");
  }
  return {
    workflowId,
    state: row.state,
    alreadyTerminal: row.alreadyTerminal,
    ...(typeof row.browserExternalId === "string"
      ? { browserExternalId: row.browserExternalId }
      : {}),
  };
}

export async function createComparisonShare(input: {
  readonly ownerId: string;
  readonly tokenHash: string;
  readonly schemaVersion: number;
  readonly payload: unknown;
}): Promise<{ readonly shareId: string; readonly expiresAt: string }> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_create_comparison_share", {
    p_token_hash: input.tokenHash,
    p_schema_version: input.schemaVersion,
    p_payload: input.payload,
    p_owner_id: input.ownerId,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const row = recordValue(data);
  if (!isUuid(row.shareId) || typeof row.expiresAt !== "string" || Number.isNaN(Date.parse(row.expiresAt))) {
    throw new Error("Comparison share RPC returned an invalid result.");
  }
  return { shareId: row.shareId, expiresAt: row.expiresAt };
}

export async function resolveComparisonShare(
  tokenHash: string,
): Promise<{ readonly payload: unknown; readonly schemaVersion: number; readonly expiresAt: string } | undefined> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_resolve_comparison_share", {
    p_token_hash: tokenHash,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const row = recordValue(data);
  if (row.found === false) {
    return undefined;
  }
  const schemaVersion = integer(row.schemaVersion);
  if (
    row.found !== true ||
    schemaVersion === undefined ||
    schemaVersion < 1 ||
    typeof row.expiresAt !== "string" ||
    Number.isNaN(Date.parse(row.expiresAt))
  ) {
    throw new Error("Comparison share lookup returned an invalid result.");
  }
  return {
    payload: recordValue(row.payload),
    schemaVersion,
    expiresAt: row.expiresAt,
  };
}

export async function recordProductEvent(input: {
  readonly eventName: string;
  readonly journeyHash: string;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_record_product_event", {
    p_event_name: input.eventName,
    p_journey_hash: input.journeyHash,
    p_properties: input.properties,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const row = recordValue(data);
  if (typeof row.recorded !== "boolean") {
    throw new Error("Product event RPC returned an invalid result.");
  }
  return row.recorded;
}

export async function lookupReusableAsset(
  reuseKey: string,
): Promise<LiveAsset | undefined> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_lookup_reusable_asset", {
    p_reuse_key: reuseKey,
  });
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  const row = recordValue(data);
  if (row.found === false) {
    return undefined;
  }
  if (row.found !== true) {
    throw new Error("Reusable asset lookup returned an invalid result.");
  }
  const assetRow = recordValue(row.asset);
  if (
    !isUuid(assetRow.id) ||
    (assetRow.kind !== "glb" && assetRow.kind !== "usdz") ||
    typeof assetRow.public_url !== "string" ||
    assetRow.scale_verified !== true
  ) {
    throw new Error("Reusable asset lookup returned invalid asset metadata.");
  }
  return {
    id: assetRow.id,
    kind: assetRow.kind,
    url: assetRow.public_url,
    dimensions: parseDimensions(assetRow),
    scaleVerified: true,
  };
}

async function invokeInternal(name: string, parameters: Readonly<Record<string, unknown>>): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc(name, parameters);
  if (error !== null) {
    throw mapDatabaseError(error);
  }
}

async function invokeBoolean(
  name: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc(name, parameters);
  if (error !== null) {
    throw mapDatabaseError(error);
  }
  if (typeof data !== "boolean") {
    throw new Error(`${name} returned an invalid result.`);
  }
  return data;
}

function parseCreatedWorkflow(input: unknown): CreatedWorkflow {
  const row = recordValue(input);
  if (
    !isUuid(row.workflow_id) ||
    !isWorkflowState(row.workflow_state) ||
    typeof row.reused !== "boolean" ||
    typeof row.cache_hit !== "boolean" ||
    (row.freshness !== "cached" && row.freshness !== "live")
  ) {
    throw new Error("Workflow RPC returned an invalid result.");
  }
  return {
    workflowId: row.workflow_id,
    state: row.workflow_state,
    reused: row.reused,
    cacheHit: row.cache_hit,
    freshness: row.freshness,
    ...(row.cache_payload === null || row.cache_payload === undefined
      ? {}
      : { cachePayload: row.cache_payload }),
  };
}

function parseWorkflowCommand(input: unknown): WorkflowCommand {
  const row = recordValue(input);
  if (
    !isUuid(row.id) ||
    typeof row.query_text !== "string" ||
    typeof row.request_hash !== "string" ||
    !Array.isArray(row.retailers)
  ) {
    throw new Error("Stored workflow command is invalid.");
  }
  const source = row.measurement_source;
  if (source !== "manual" && source !== "webxr" && source !== "demo") {
    throw new Error("Stored measurement source is invalid.");
  }
  const retailers = row.retailers.filter(
    (value): value is "ikea-au" | "kmart-au" => value === "ikea-au" || value === "kmart-au",
  );
  const intent = parseStoredIntent(row, row.query_text, retailers);
  if (
    retailers.length !== row.retailers.length ||
    (intent.kind === "prompt" && retailers.length === 0) ||
    (intent.kind === "product-link" && retailers.length !== 0)
  ) {
    throw new Error("Stored retailer set is invalid.");
  }
  const cachePolicy = row.cache_policy === "force-refresh" ? "force-refresh" : "prefer-recent";
  const cacheKey = typeof row.cache_key === "string" && /^[0-9a-f]{64}$/.test(row.cache_key)
    ? row.cache_key
    : buildDiscoveryCacheIdentity(intent).key;
  const measurement = parseMeasurementRow(row, source);
  return {
    id: row.id,
    queryText: row.query_text,
    intent,
    measurement,
    retailers,
    cachePolicy,
    cacheKey,
    requestHash: row.request_hash,
  };
}

function parseWorkflow(input: unknown, candidates: readonly LiveCandidate[]): LiveSearchWorkflow {
  const row = recordValue(input);
  if (
    !isUuid(row.id) ||
    !isWorkflowState(row.state) ||
    typeof row.query_text !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string" ||
    !Array.isArray(row.retailers)
  ) {
    throw new Error("Stored workflow is invalid.");
  }
  if (typeof row.is_partial !== "boolean" || !Array.isArray(row.coverage_notes)) {
    throw new Error("Stored workflow coverage is invalid.");
  }
  const coverageNotes = row.coverage_notes.map((note) => {
    if (typeof note !== "string") {
      throw new Error("Stored workflow coverage note is invalid.");
    }
    return note;
  });
  const source = row.measurement_source;
  if (source !== "manual" && source !== "webxr" && source !== "demo") {
    throw new Error("Stored measurement source is invalid.");
  }
  const retailers = row.retailers.filter(
    (value): value is "ikea-au" | "kmart-au" => value === "ikea-au" || value === "kmart-au",
  );
  const intent = parseStoredIntent(row, row.query_text, retailers);
  const cachePolicy = row.cache_policy === "force-refresh" ? "force-refresh" : "prefer-recent";
  const cacheHit = row.cache_hit === true;
  const freshness = row.freshness === "cached" ? "cached" : "live";
  const candidateCheckedAt = candidates.reduce<string | undefined>((latest, candidate) => {
    const observedAt = candidate.observation.observedAt;
    if (latest === undefined || Date.parse(observedAt) > Date.parse(latest)) {
      return observedAt;
    }
    return latest;
  }, undefined);
  const checkedAt = typeof row.checked_at === "string" && Number.isFinite(Date.parse(row.checked_at))
    ? row.checked_at
    : candidateCheckedAt;
  return {
    id: row.id,
    state: row.state,
    queryText: row.query_text,
    intent,
    measurement: parseMeasurementRow(row, source),
    retailers,
    cachePolicy,
    cacheHit,
    freshness,
    ...(checkedAt === undefined ? {} : { checkedAt }),
    candidates,
    isPartial: row.is_partial,
    coverageNotes,
    ...(isUuid(row.approved_candidate_id) ? { approvedCandidateId: row.approved_candidate_id } : {}),
    ...(typeof row.error_code === "string" && typeof row.error_message === "string"
      ? { error: { code: row.error_code, message: row.error_message } }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseCandidate(input: unknown): LiveCandidate {
  const row = recordValue(input);
  if (
    !isUuid(row.id) ||
    typeof row.rank !== "number" ||
    (row.fit_status !== "fits" && row.fit_status !== "access_issue" && row.fit_status !== "near_miss") ||
    typeof row.retailer_product_id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.category !== "string" ||
    typeof row.product_url !== "string" ||
    typeof row.image_url !== "string" ||
    typeof row.price_minor !== "number" ||
    typeof row.currency !== "string" ||
    !/^[A-Z]{3}$/.test(row.currency) ||
    typeof row.observed_at !== "string"
  ) {
    throw new Error("Stored candidate is invalid.");
  }
  const dimensionsSource = row.dimensions_source;
  if (
    dimensionsSource !== "retailer-page" &&
    dimensionsSource !== "retailer-api" &&
    dimensionsSource !== "json-ld"
  ) {
    throw new Error("Stored candidate provenance is invalid.");
  }
  if (
    typeof row.dimensions_evidence !== "string" ||
    row.dimensions_evidence.trim().length === 0 ||
    row.dimensions_evidence.length > 2000
  ) {
    throw new Error("Stored candidate provenance is invalid.");
  }
  const dimensions = parseDimensions(row);
  const retailer = parseRetailerIdentityRow(row.retailer_identity, row.retailer);
  const packages = parseDeliveryPackagesRow(row.packages);
  const observation: LiveProductObservation = {
    retailer,
    retailerProductId: row.retailer_product_id,
    name: row.name,
    category: row.category,
    productUrl: row.product_url,
    imageUrl: row.image_url,
    priceMinor: row.price_minor,
    currency: row.currency,
    availability:
      row.availability === "in_stock" || row.availability === "out_of_stock"
        ? row.availability
        : "unknown",
    assembledDimensions: dimensions,
    packages,
    dimensionsSource,
    dimensionsEvidence: row.dimensions_evidence,
    observedAt: row.observed_at,
    // The snapshot-recording RPC only materializes observations whose
    // database-constrained source record has confidence = 'high'.
    confidence: "high",
  };
  return {
    id: row.id,
    rank: row.rank,
    fitStatus: row.fit_status,
    observation,
    fit: parseFitEvaluation(row.fit_result),
    access: parseAccessEvaluation(row.access_result),
  };
}

function parseAsset(input: unknown): { readonly candidateId: string; readonly asset: LiveAsset } {
  const row = recordValue(input);
  if (
    !isUuid(row.id) ||
    !isUuid(row.candidate_id) ||
    (row.kind !== "glb" && row.kind !== "usdz") ||
    typeof row.public_url !== "string" ||
    row.scale_verified !== true
  ) {
    throw new Error("Stored asset is invalid.");
  }
  return {
    candidateId: row.candidate_id,
    asset: {
      id: row.id,
      kind: row.kind,
      url: row.public_url,
      dimensions: parseDimensions(row),
      scaleVerified: true,
    },
  };
}

function parseMeasurementRow(
  row: Record<string, unknown>,
  source: SpaceMeasurement["source"],
): SpaceMeasurement {
  const dimensions = parseDimensions(row);
  if (typeof row.uncertainty_mm !== "number") {
    throw new Error("Stored measurement uncertainty is invalid.");
  }
  return {
    ...dimensions,
    uncertaintyMm: row.uncertainty_mm,
    ...(typeof row.access_width_mm === "number" ? { accessWidthMm: row.access_width_mm } : {}),
    source,
  };
}

function parseDimensions(row: Record<string, unknown>): ProductDimensions {
  const width = numeric(row.width_mm);
  const height = numeric(row.height_mm);
  const depth = numeric(row.depth_mm);
  if (width === undefined || height === undefined || depth === undefined) {
    throw new Error("Stored dimensions are invalid.");
  }
  return { widthMm: width, heightMm: height, depthMm: depth };
}

function parseFitEvaluation(input: unknown): FitEvaluation {
  const row = recordValue(input);
  if (
    typeof row.fits !== "boolean" ||
    (row.orientation !== "default" && row.orientation !== "rotated-90") ||
    typeof row.widthClearanceMm !== "number" ||
    typeof row.heightClearanceMm !== "number" ||
    typeof row.depthClearanceMm !== "number" ||
    typeof row.minimumClearanceMm !== "number" ||
    (row.confidence !== "high" && row.confidence !== "medium" && row.confidence !== "low") ||
    !Array.isArray(row.reasons) ||
    !row.reasons.every((value) => typeof value === "string")
  ) {
    throw new Error("Stored fit evaluation is invalid.");
  }
  return {
    fits: row.fits,
    orientation: row.orientation,
    widthClearanceMm: row.widthClearanceMm,
    heightClearanceMm: row.heightClearanceMm,
    depthClearanceMm: row.depthClearanceMm,
    minimumClearanceMm: row.minimumClearanceMm,
    confidence: row.confidence,
    reasons: row.reasons,
  };
}

function parseAccessEvaluation(input: unknown): DeliveryAccessEvaluation {
  const row = recordValue(input);
  if (row.status === "skipped" && row.passes === true) {
    return { status: "skipped", passes: true, basis: "unknown" };
  }
  const basis = row.basis === "package" ? "package" : "assembled-advisory";
  const controllingPackageIndex = integer(row.controllingPackageIndex);
  const controllingPackageLabel = typeof row.controllingPackageLabel === "string"
    ? row.controllingPackageLabel
    : undefined;
  if (basis === "package" && (controllingPackageIndex === undefined || controllingPackageIndex < 0)) {
    throw new Error("Stored package access basis is invalid.");
  }
  const crossSection = parseCrossSection(row.crossSection);
  if (row.status === "passed" && row.passes === true && typeof row.accessWidthMm === "number" && typeof row.clearanceMm === "number") {
    return basis === "package"
      ? {
          status: "passed",
          passes: true,
          basis,
          accessWidthMm: row.accessWidthMm,
          crossSection,
          clearanceMm: row.clearanceMm,
          controllingPackageIndex: controllingPackageIndex as number,
          ...(controllingPackageLabel === undefined ? {} : { controllingPackageLabel }),
        }
      : {
          status: "passed",
          passes: true,
          basis,
          accessWidthMm: row.accessWidthMm,
          crossSection,
          clearanceMm: row.clearanceMm,
        };
  }
  if (
    row.status === "failed" &&
    row.passes === false &&
    typeof row.accessWidthMm === "number" &&
    typeof row.deficitMm === "number" &&
    typeof row.reason === "string"
  ) {
    return basis === "package"
      ? {
          status: "failed",
          passes: false,
          basis,
          accessWidthMm: row.accessWidthMm,
          crossSection,
          deficitMm: row.deficitMm,
          reason: row.reason,
          controllingPackageIndex: controllingPackageIndex as number,
          ...(controllingPackageLabel === undefined ? {} : { controllingPackageLabel }),
        }
      : {
          status: "failed",
          passes: false,
          basis,
          accessWidthMm: row.accessWidthMm,
          crossSection,
          deficitMm: row.deficitMm,
          reason: row.reason,
        };
  }
  throw new Error("Stored access evaluation is invalid.");
}

function parseStoredIntent(
  row: Record<string, unknown>,
  queryText: string,
  retailers: readonly LiveRetailer[],
): LiveSearchIntent {
  if (row.intent_kind === "product-link") {
    const value = recordValue(row.intent_json);
    if (value.kind !== "product-link" || typeof value.url !== "string") {
      throw new Error("Stored product-link intent is invalid.");
    }
    return { kind: "product-link", url: value.url };
  }
  if (row.intent_kind === "prompt") {
    const value = recordValue(row.intent_json);
    if (value.kind !== "prompt" || typeof value.text !== "string" || !Array.isArray(value.retailers)) {
      throw new Error("Stored prompt intent is invalid.");
    }
    const keys = value.retailers.filter(
      (entry): entry is LiveRetailer => entry === "ikea-au" || entry === "kmart-au",
    );
    if (keys.length !== value.retailers.length || keys.length === 0) {
      throw new Error("Stored prompt retailer set is invalid.");
    }
    return { kind: "prompt", text: value.text, retailers: keys };
  }
  return { kind: "prompt", text: queryText, retailers };
}

function parseRetailerIdentityRow(identity: unknown, legacyKey: unknown): RetailerIdentity {
  if (typeof legacyKey === "string" && (legacyKey === "ikea-au" || legacyKey === "kmart-au")) {
    if (identity === null || identity === undefined) {
      return LIVE_RETAILER_IDENTITIES[legacyKey];
    }
  }
  const row = recordValue(identity);
  if (
    typeof row.key !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.key) ||
    typeof row.label !== "string" ||
    row.label.trim().length === 0 ||
    typeof row.host !== "string" ||
    row.host.trim().length === 0
  ) {
    throw new Error("Stored retailer identity is invalid.");
  }
  return { key: row.key, label: row.label, host: row.host };
}

function parseDeliveryPackagesRow(input: unknown): readonly DeliveryPackage[] {
  if (input === null || input === undefined) {
    return [];
  }
  if (!Array.isArray(input) || input.length > 50) {
    throw new Error("Stored delivery packages are invalid.");
  }
  return input.map((value) => {
    const row = recordValue(value);
    const dimensions = {
      widthMm: numeric(row.widthMm),
      heightMm: numeric(row.heightMm),
      depthMm: numeric(row.depthMm),
    };
    if (dimensions.widthMm === undefined || dimensions.heightMm === undefined || dimensions.depthMm === undefined) {
      throw new Error("Stored delivery package dimensions are invalid.");
    }
    return {
      widthMm: dimensions.widthMm,
      heightMm: dimensions.heightMm,
      depthMm: dimensions.depthMm,
      ...(typeof row.label === "string" && row.label.trim().length > 0
        ? { label: row.label }
        : {}),
    };
  });
}

function parseCrossSection(
  input: unknown,
): readonly [AccessCrossSectionDimension, AccessCrossSectionDimension] {
  if (!Array.isArray(input) || input.length !== 2) {
    throw new Error("Stored access cross-section is invalid.");
  }
  const values: AccessCrossSectionDimension[] = input.map((entry) => {
    const row = recordValue(entry);
    if (
      (row.axis !== "width" && row.axis !== "depth" && row.axis !== "height") ||
      typeof row.sizeMm !== "number"
    ) {
      throw new Error("Stored access axis is invalid.");
    }
    return { axis: row.axis, sizeMm: row.sizeMm };
  });
  return [values[0], values[1]];
}

function mapDatabaseError(error: { readonly code?: string; readonly message: string }): Error {
  if (error.message.includes("_limit_exceeded") || error.message.includes("_quota_exceeded")) {
    return new RateLimitExceededError();
  }
  if (error.message.includes("_circuit_open")) {
    return new LiveSearchUnavailableError();
  }
  if (error.message.includes("idempotency_conflict") || error.message.includes("approval_conflict")) {
    return new IdempotencyConflictError();
  }
  if (error.code === "P0002" || error.message.includes("not_found") || error.message.includes("not found")) {
    return new ResourceNotFoundError("Requested resource");
  }
  if (error.code === "23514" || error.message.includes("not_ready") || error.message.includes("not_approvable")) {
    return new InvalidWorkflowStateError(error.message);
  }
  return new Error(error.message);
}

function firstRow(input: unknown): unknown {
  return Array.isArray(input) ? input[0] : input;
}

function arrayValue(input: unknown): readonly unknown[] {
  return Array.isArray(input) ? input : [];
}

function recordValue(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Database result is not an object.");
  }
  return input as Record<string, unknown>;
}

function numeric(input: unknown): number | undefined {
  const value = typeof input === "string" ? Number(input) : input;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function integer(input: unknown): number | undefined {
  const value = typeof input === "string" ? Number(input) : input;
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}
