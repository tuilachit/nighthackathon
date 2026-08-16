import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { evaluateLiveProducts } from "./evaluate";
import { sha256Hex, stableJson } from "./hashing";
import { rescaleGlbToDimensions } from "./model-processing/glb";
import {
  claimModelDispatch,
  claimSearchDispatch,
  completeModelAsset,
  failWorkflowStage,
  findProviderTask,
  getWorkflowCommand,
  markWebhookProcessed,
  recordBrowserSubmission,
  recordMeshySubmission,
  recordSearchResults,
} from "./repository";
import {
  ProviderRequestError,
  ProviderResponseError,
  createBrowserSearchSession,
  getBrowserSearchSession,
  parseCompletedBrowserOutput,
} from "./providers/browser-use";
import { createMeshyImageTask, getMeshyTask } from "./providers/meshy";
import {
  MAX_COVERAGE_NOTES,
  type BrowserSearchOutput,
  type VerifiedLiveCandidateRecord,
} from "./types";

const MODEL_BUCKET = "models-public";
const MAX_MODEL_BYTES = 25 * 1024 * 1024;

/** Low-latency dispatch path; the durable queue remains the retry authority. */
export async function dispatchSearchWorkflow(
  workflowId: string,
  requestHash: string,
): Promise<void> {
  let externalTaskId: string | undefined;
  try {
    const [claim, command] = await Promise.all([
      claimSearchDispatch(workflowId, requestHash),
      getWorkflowCommand(workflowId),
    ]);
    if (!claim.shouldSubmit) {
      return;
    }
    const session = await createBrowserSearchSession(
      command.queryText,
      command.retailers,
      command.measurement,
    );
    externalTaskId = session.id;
    await recordBrowserSubmission(workflowId, claim.providerTaskId, session.id, {
      status: session.status,
      proxyCountryCode: "au",
    });
  } catch (error) {
    await recordDispatchFailure("browser_use", workflowId, externalTaskId, error);
    throw error;
  }
}

/** Processes a signed Browser Use notification after canonical provider re-fetch. */
export async function processBrowserUseWebhook(
  inboxId: string,
  externalTaskId: string,
): Promise<void> {
  try {
    await reconcileBrowserUseTask(externalTaskId);
    await markWebhookProcessed(inboxId);
  } catch (error) {
    await markWebhookProcessed(inboxId, errorMessage(error));
    throw error;
  }
}

/** Dispatches Meshy only for an immutable, approved candidate snapshot. */
export async function dispatchModelWorkflow(
  workflowId: string,
  requestHash: string,
): Promise<void> {
  let externalTaskId: string | undefined;
  try {
    const claim = await claimModelDispatch(workflowId, requestHash);
    if (!claim.shouldSubmit) {
      return;
    }
    externalTaskId = await createMeshyImageTask(claim.imageUrl);
    await recordMeshySubmission(workflowId, claim.providerTaskId, externalTaskId);
  } catch (error) {
    await recordDispatchFailure("meshy", workflowId, externalTaskId, error);
    throw error;
  }
}

/** Re-fetches Meshy state, copies the expiring GLB, rescales it, and publishes only after exact verification. */
export async function processMeshyWebhook(
  inboxId: string,
  externalTaskId: string,
): Promise<void> {
  try {
    await reconcileMeshyTask(externalTaskId);
    await markWebhookProcessed(inboxId);
  } catch (error) {
    await markWebhookProcessed(inboxId, errorMessage(error));
    throw error;
  }
}

export interface ProviderPollResult {
  readonly complete: boolean;
  readonly providerStatus: string;
}

/** Polls canonical Browser Use state for webhook recovery without trusting event data. */
export async function reconcileBrowserUseTask(
  externalTaskId: string,
): Promise<ProviderPollResult> {
  const context = await findProviderTask("browser_use", externalTaskId);
  const session = await getBrowserSearchSession(externalTaskId);
  if (session.status === "created" || session.status === "idle" || session.status === "running") {
    return { complete: false, providerStatus: session.status };
  }
  if (session.status !== "stopped" || session.isTaskSuccessful !== true || session.output === undefined) {
    const message = session.lastStepSummary ?? `Browser search ended with ${session.status}.`;
    await failWorkflowStage({
      workflowId: context.workflowId,
      provider: "browser_use",
      externalTaskId,
      errorCode: `browser_${session.status}`,
      errorMessage: message,
      // A terminal Browser Use session may already have consumed budget. A new
      // paid session requires a fresh user command rather than an automatic retry.
      retryable: false,
    });
    return { complete: true, providerStatus: session.status };
  }

  const command = await getWorkflowCommand(context.workflowId);
  let output: BrowserSearchOutput;
  let candidates: readonly VerifiedLiveCandidateRecord[];
  try {
    output = parseCompletedBrowserOutput(session.output);
    const unrequestedRetailer = output.products.find(
      (product) => !command.retailers.includes(product.retailer),
    );
    if (unrequestedRetailer !== undefined) {
      throw new ProviderResponseError(
        `Browser search returned unrequested retailer ${unrequestedRetailer.retailer}.`,
      );
    }
    const missingRetailers = command.retailers.filter(
      (retailer) => !output.products.some((product) => product.retailer === retailer),
    );
    if (missingRetailers.length > 0) {
      output = {
        ...output,
        partial: true,
        notes: [
          ...output.notes,
          `No validated results returned for: ${missingRetailers.join(", ")}.`,
        ].slice(0, MAX_COVERAGE_NOTES),
      };
    }
    candidates = evaluateLiveProducts(output, command.measurement);
  } catch (error) {
    await failWorkflowStage({
      workflowId: context.workflowId,
      provider: "browser_use",
      externalTaskId,
      errorCode: "browser_invalid_output",
      errorMessage: errorMessage(error),
      retryable: false,
    });
    return { complete: true, providerStatus: "invalid_output" };
  }
  const coverageNotes = output.partial
    ? (output.notes.length > 0 ? output.notes : ["The provider reported partial retailer coverage."])
    : [];
  await recordSearchResults(
    context.workflowId,
    externalTaskId,
    candidates,
    output.partial,
    coverageNotes,
    {
      totalCostUsd: session.totalCostUsd ?? null,
      stepCount: session.stepCount ?? null,
      notes: output.notes,
    },
  );
  return { complete: true, providerStatus: session.status };
}

/** Polls canonical Meshy state and publishes only a dimension-verified terminal asset. */
export async function reconcileMeshyTask(
  externalTaskId: string,
): Promise<ProviderPollResult> {
  const context = await findProviderTask("meshy", externalTaskId);
  const task = await getMeshyTask(externalTaskId);
  if (task.status === "PENDING" || task.status === "IN_PROGRESS") {
    return { complete: false, providerStatus: task.status };
  }
  if (task.status === "FAILED" || task.status === "CANCELED") {
    await failWorkflowStage({
      workflowId: context.workflowId,
      provider: "meshy",
      externalTaskId,
      errorCode: `meshy_${task.status.toLowerCase()}`,
      errorMessage: task.errorMessage ?? `Meshy task ${task.status.toLowerCase()}.`,
      retryable: false,
    });
    return { complete: true, providerStatus: task.status };
  }
  if (
    task.modelUrls.glb === undefined ||
    context.candidateId === undefined ||
    context.dimensions === undefined
  ) {
    const message = "Completed Meshy task omitted its GLB or approved product dimensions.";
    await failWorkflowStage({
      workflowId: context.workflowId,
      provider: "meshy",
      externalTaskId,
      errorCode: "meshy_invalid_output",
      errorMessage: message,
      retryable: false,
    });
    return { complete: true, providerStatus: "INVALID_OUTPUT" };
  }

  const source = await downloadBoundedMeshyAsset(task.modelUrls.glb);
  let scaled: Buffer;
  try {
    scaled = rescaleGlbToDimensions(source, context.dimensions, context.candidateId);
  } catch (error) {
    await failWorkflowStage({
      workflowId: context.workflowId,
      provider: "meshy",
      externalTaskId,
      errorCode: "meshy_scale_verification_failed",
      errorMessage: errorMessage(error),
      retryable: false,
    });
    return { complete: true, providerStatus: "INVALID_GEOMETRY" };
  }
  const checksum = sha256Hex(scaled);
  const storagePath = `glb/${checksum}.glb`;
  const publicUrl = await publishImmutableModel(storagePath, scaled);
  await completeModelAsset({
    workflowId: context.workflowId,
    externalTaskId,
    candidateId: context.candidateId,
    kind: "glb",
    storageBucket: MODEL_BUCKET,
    storagePath,
    publicUrl,
    sha256: checksum,
    byteSize: scaled.length,
    dimensions: context.dimensions,
    providerMetadata: {
      status: task.status,
      progress: task.progress,
      consumedCredits: task.consumedCredits ?? null,
      sourceGlbHash: sha256Hex(source),
    },
  });
  return { complete: true, providerStatus: task.status };
}

export function liveSearchRequestHash(value: unknown): string {
  return sha256Hex(stableJson(value));
}

async function publishImmutableModel(path: string, model: Buffer): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const bucket = supabase.storage.from(MODEL_BUCKET);
  const { error } = await bucket.upload(path, model, {
    cacheControl: "31536000",
    contentType: "model/gltf-binary",
    upsert: false,
  });
  if (error !== null) {
    if (!isDuplicateStorageError(error)) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }
    const existing = await bucket.download(path);
    if (existing.error !== null || existing.data === null) {
      throw new Error("A duplicate model path could not be verified in Storage.");
    }
    const existingModel = Buffer.from(await existing.data.arrayBuffer());
    if (
      existingModel.length !== model.length ||
      sha256Hex(existingModel) !== sha256Hex(model)
    ) {
      throw new Error("A duplicate model path contained different bytes.");
    }
  }
  const { data } = bucket.getPublicUrl(path);
  if (!data.publicUrl.startsWith("https://")) {
    throw new Error("Supabase Storage returned an invalid public model URL.");
  }
  return data.publicUrl;
}

async function downloadBoundedMeshyAsset(urlValue: string): Promise<Buffer> {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || (url.hostname !== "assets.meshy.ai" && !url.hostname.endsWith(".meshy.ai"))) {
    throw new ProviderResponseError("Meshy returned an asset on an unexpected host.");
  }
  const response = await fetch(url, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || response.body === null) {
    throw new ProviderRequestError("meshy", response.status, "GLB download failed.");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MODEL_BYTES) {
    throw new ProviderResponseError("Meshy GLB exceeds the 25 MB safety limit.");
  }
  const contentType = response.headers.get("content-type")?.split(";")[0].trim();
  if (contentType !== undefined && !["model/gltf-binary", "application/octet-stream"].includes(contentType)) {
    throw new ProviderResponseError(`Meshy GLB has unsupported content type ${contentType}.`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    total += next.value.byteLength;
    if (total > MAX_MODEL_BYTES) {
      await reader.cancel();
      throw new ProviderResponseError("Meshy GLB exceeds the 25 MB safety limit.");
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

async function recordDispatchFailure(
  provider: "browser_use" | "meshy",
  workflowId: string,
  externalTaskId: string | undefined,
  error: unknown,
): Promise<void> {
  try {
    await failWorkflowStage({
      workflowId,
      provider,
      ...(externalTaskId === undefined ? {} : { externalTaskId }),
      errorCode: error instanceof ProviderRequestError ? `${provider}_http_${error.status}` : `${provider}_dispatch_failed`,
      errorMessage: errorMessage(error),
      // A returned provider ID proves the paid job exists, so preserve it for
      // canonical polling. With no ID, only an explicit rate-limit response
      // proves the request was rejected before a task could be created.
      retryable:
        externalTaskId !== undefined ||
        (error instanceof ProviderRequestError && error.status === 429),
    });
  } catch (recordError) {
    console.error("Could not persist provider dispatch failure", recordError);
  }
}

function isDuplicateStorageError(error: { readonly message: string; readonly statusCode?: string }): boolean {
  return error.statusCode === "409" || /already exists|duplicate/i.test(error.message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown provider processing error.";
}
