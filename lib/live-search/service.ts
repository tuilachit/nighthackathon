import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { EXTRACTION_SCHEMA_VERSION } from "./discovery-cache";
import { getPublicSupabaseEnvironment } from "./env";
import { evaluateLiveProducts } from "./evaluate";
import { publicWorkflowErrorMessage } from "./public-errors";
import { cacheRetailerImage } from "./image-cache";
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
  recordCachedSearchResults,
  recordDiscoveryCache,
  recordMeshySubmission,
  recordSearchResults,
  recordSynchronousSearchResults,
} from "./repository";
import {
  ProviderRequestError,
  ProviderResponseError,
  createBrowserSearchSession,
  getBrowserSearchSession,
  parseCompletedBrowserOutput,
} from "./providers/browser-use";
import {
  searchProductsWithFirecrawl,
  type FirecrawlPrimarySearchResult,
} from "./providers/firecrawl";
import { hasSameRegistrableDomain } from "./url-security";
import { createMeshyImageTask, getMeshyTask } from "./providers/meshy";
import {
  MAX_COVERAGE_NOTES,
  type BrowserSearchOutput,
  type LiveProductObservation,
  type LiveSearchIntent,
  type VerifiedLiveCandidateRecord,
} from "./types";
import { validateBrowserSearchOutput } from "./validation";

const MODEL_BUCKET = "models-public";
const MAX_MODEL_BYTES = 25 * 1024 * 1024;

/** Low-latency dispatch path; the durable queue remains the retry authority. */
export async function dispatchSearchWorkflow(
  workflowId: string,
  requestHash: string,
): Promise<void> {
  const [claim, command] = await Promise.all([
    claimSearchDispatch(workflowId, requestHash),
    getWorkflowCommand(workflowId),
  ]);
  if (!claim.shouldSubmit) {
    return;
  }

  let firecrawl: FirecrawlPrimarySearchResult | undefined;
  let firecrawlOutput: BrowserSearchOutput | undefined;
  let firecrawlCandidates: readonly VerifiedLiveCandidateRecord[] | undefined;
  try {
    firecrawl = await searchProductsWithFirecrawl(command.intent);
    if (firecrawl.output.products.length > 0) {
      firecrawlOutput = await cacheValidatedImages(
        firecrawl.output,
        firecrawl.imageCandidates,
      );
      assertOutputMatchesIntent(firecrawlOutput, command.intent);
      firecrawlCandidates = evaluateLiveProducts(firecrawlOutput, command.measurement);
    }
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      message: "firecrawl_primary_fallback",
      workflowId,
      error: errorMessage(error),
    }));
  }

  if (
    firecrawl !== undefined &&
    firecrawlOutput !== undefined &&
    firecrawlCandidates !== undefined
  ) {
    // Do not wrap this durable write in the Browser Use fallback catch. If the
    // response is lost after commit, starting a paid fallback would duplicate
    // work; the owner-scoped workflow poll will observe the committed result.
    await recordSynchronousSearchResults(
      workflowId,
      claim.providerTaskId,
      firecrawlCandidates,
      firecrawlOutput.partial,
      firecrawlOutput.partial ? firecrawlOutput.notes : [],
      {
        provider: "firecrawl",
        attemptedPages: firecrawl.attemptedPages,
        rejectedPages: firecrawl.rejectedPages,
        notes: firecrawlOutput.notes,
      },
    );
    try {
      await recordDiscoveryCache(
        command.cacheKey,
        EXTRACTION_SCHEMA_VERSION,
        createDiscoveryCachePayload(firecrawlOutput),
      );
    } catch (error) {
      console.error("Could not update the discovery cache", error);
    }
    console.info(JSON.stringify({
      level: "info",
      message: "firecrawl_primary_completed",
      workflowId,
      attemptedPages: firecrawl.attemptedPages,
      validatedProducts: firecrawlOutput.products.length,
      partial: firecrawlOutput.partial,
    }));
    return;
  }

  if (firecrawl !== undefined) {
    console.warn(JSON.stringify({
      level: "warn",
      message: "firecrawl_primary_fallback",
      workflowId,
      attemptedPages: firecrawl.attemptedPages,
      rejectedPages: firecrawl.rejectedPages,
    }));
  }

  let externalTaskId: string | undefined;
  try {
    const session = await createBrowserSearchSession(
      command.intent,
      command.measurement,
      firecrawl?.discoveryHits ?? [],
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
    const costLimitReached =
      session.status === "stopped" &&
      session.totalCostUsd !== undefined &&
      session.maxCostUsd !== undefined &&
      session.totalCostUsd >= session.maxCostUsd;
    const errorCode = costLimitReached
      ? "browser_budget_exhausted"
      : `browser_${session.status}`;
    console.warn(JSON.stringify({
      level: "warn",
      message: "browser_search_terminal_failure",
      workflowId: context.workflowId,
      sessionId: externalTaskId,
      providerStatus: session.status,
      model: session.model ?? null,
      isTaskSuccessful: session.isTaskSuccessful ?? null,
      maxCostUsd: session.maxCostUsd ?? null,
      totalCostUsd: session.totalCostUsd ?? null,
      stepCount: session.stepCount ?? null,
      costLimitReached,
    }));
    await failWorkflowStage({
      workflowId: context.workflowId,
      provider: "browser_use",
      externalTaskId,
      errorCode,
      errorMessage: publicWorkflowErrorMessage(errorCode),
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
    output = await cacheValidatedImages(parseCompletedBrowserOutput(session.output));
    assertOutputMatchesIntent(output, command.intent);
    if (command.intent.kind === "prompt") {
      const missingRetailers = command.intent.retailers.filter(
        (retailer) => !output.products.some((product) => product.retailer.key === retailer),
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
  try {
    await recordDiscoveryCache(
      command.cacheKey,
      EXTRACTION_SCHEMA_VERSION,
      createDiscoveryCachePayload(output),
    );
  } catch (error) {
    console.error("Could not update the discovery cache", error);
  }
  return { complete: true, providerStatus: session.status };
}

/** Completes a workflow from a validated exact cache hit without provider work. */
export async function completeCachedSearchWorkflow(
  workflowId: string,
  rawCachePayload: unknown,
): Promise<{ readonly state: "partial" | "ready_for_approval"; readonly checkedAt: string }> {
  const command = await getWorkflowCommand(workflowId);
  const validation = validateBrowserSearchOutput(rawCachePayload);
  if (!validation.ok || validation.value === undefined) {
    throw new ProviderResponseError(`Cached observation failed validation: ${validation.errors.join(" ")}`);
  }
  const output = restoreControlledCacheImages(validation.value, rawCachePayload);
  assertOutputMatchesIntent(output, command.intent);
  const candidates = evaluateLiveProducts(output, command.measurement);
  const notes = output.partial
    ? (output.notes.length > 0 ? output.notes : ["The cached observation has partial retailer coverage."])
    : [];
  await recordCachedSearchResults(workflowId, candidates, output.partial, notes, {
    cacheKey: command.cacheKey,
    extractionSchemaVersion: EXTRACTION_SCHEMA_VERSION,
  });
  const checkedAt = output.products.reduce(
    (latest, product) => Date.parse(product.observedAt) > Date.parse(latest) ? product.observedAt : latest,
    output.products[0]?.observedAt ?? new Date().toISOString(),
  );
  return { state: output.partial ? "partial" : "ready_for_approval", checkedAt };
}

function assertOutputMatchesIntent(
  output: BrowserSearchOutput,
  intent: LiveSearchIntent,
): void {
  if (intent.kind === "prompt") {
    const unrequested = output.products.find(
      (product) => !intent.retailers.includes(product.retailer.key as "ikea-au" | "kmart-au"),
    );
    if (unrequested !== undefined) {
      throw new ProviderResponseError(
        `Browser search returned unrequested retailer ${unrequested.retailer.key}.`,
      );
    }
    return;
  }
  if (output.products.length > 1) {
    throw new ProviderResponseError("Exact product-link research returned more than one product.");
  }
  const product = output.products[0];
  if (
    product !== undefined &&
    (!hasSameRegistrableDomain(intent.url, product.productUrl) ||
      !hasSameRegistrableDomain(intent.url, `https://${product.retailer.host}`))
  ) {
    throw new ProviderResponseError("Linked product escaped the submitted retailer domain.");
  }
}

async function cacheValidatedImages(
  output: BrowserSearchOutput,
  alternatives: Readonly<Record<string, readonly string[]>> = {},
): Promise<BrowserSearchOutput> {
  const results = await Promise.allSettled(
    output.products.map(async (product) => {
      const imageUrls = [...new Set([
        product.imageUrl,
        ...(alternatives[product.productUrl] ?? []),
      ])].filter((url) => isAllowedRetailerImageCandidate(product, url)).slice(0, 4);
      const attempts = await Promise.allSettled(imageUrls.map(cacheRetailerImage));
      const cached = attempts.find(
        (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof cacheRetailerImage>>> =>
          attempt.status === "fulfilled",
      )?.value;
      if (cached === undefined) {
        const firstFailure = attempts.find(
          (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected",
        );
        throw firstFailure?.reason ?? new Error("No safe retailer image candidate was available.");
      }
      return {
        ...product,
        imageUrl: cached.publicUrl,
        sourceImageUrl: cached.sourceUrl,
        sourceImageHash: cached.sha256,
      } as LiveProductObservation & ControlledImageFacts;
    }),
  );
  const products: LiveProductObservation[] = [];
  const failures: string[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") {
      products.push(result.value);
    } else {
      const source = output.products[index];
      console.warn(JSON.stringify({
        level: "warn",
        message: "retailer_image_cache_rejected",
        retailer: source?.retailer.key ?? "unknown",
        imageHost: safeUrlHost(source?.imageUrl),
        error: errorMessage(result.reason),
      }));
      failures.push(`Rejected product ${index + 1}: source image could not be safely cached.`);
    }
  }
  if (products.length === 0 && output.products.length > 0) {
    throw new ProviderResponseError("No validated product image passed controlled caching.");
  }
  return {
    products,
    partial: output.partial || failures.length > 0,
    notes: [...output.notes, ...failures].slice(0, MAX_COVERAGE_NOTES),
  };
}

function isAllowedRetailerImageCandidate(
  product: LiveProductObservation,
  value: string,
): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return false;
    }
    if (product.retailer.key === "kmart-au") {
      return (
        hasSameRegistrableDomain("https://kmart.com.au", value) ||
        url.hostname.toLowerCase() === "kmartau.mo.cloudinary.net"
      );
    }
    return hasSameRegistrableDomain(`https://${product.retailer.host}`, value);
  } catch {
    return false;
  }
}

function safeUrlHost(value: string | undefined): string {
  if (value === undefined) {
    return "unknown";
  }
  try {
    return new URL(value).hostname;
  } catch {
    return "invalid";
  }
}

interface ControlledImageFacts {
  readonly sourceImageUrl: string;
  readonly sourceImageHash: string;
}

interface DiscoveryCacheImageFacts {
  readonly cachedImageUrl: string;
  readonly sourceImageHash: string;
}

/** Stores source facts for revalidation alongside a content-addressed display image. */
function createDiscoveryCachePayload(output: BrowserSearchOutput): unknown {
  return {
    ...output,
    products: output.products.map((product) => {
      const controlled = product as LiveProductObservation & Partial<ControlledImageFacts>;
      if (
        controlled.sourceImageUrl === undefined ||
        controlled.sourceImageHash === undefined ||
        !/^[0-9a-f]{64}$/.test(controlled.sourceImageHash)
      ) {
        throw new ProviderResponseError("Controlled image provenance was missing from a validated product.");
      }
      const { sourceImageUrl, sourceImageHash, ...publicFacts } = controlled;
      return {
        ...publicFacts,
        imageUrl: sourceImageUrl,
        cachedImageUrl: product.imageUrl,
        sourceImageHash,
      };
    }),
  };
}

/** Revalidates retailer facts, then restores only our exact content-addressed image URL. */
function restoreControlledCacheImages(
  output: BrowserSearchOutput,
  rawPayload: unknown,
): BrowserSearchOutput {
  if (!isRecord(rawPayload)) {
    throw new ProviderResponseError("Cached observation image metadata was malformed.");
  }
  const rawProducts = rawPayload.products;
  if (!Array.isArray(rawProducts) || rawProducts.length !== output.products.length) {
    throw new ProviderResponseError("Cached observation image metadata was malformed.");
  }
  const products = output.products.map((product, index) => {
    const raw = rawProducts[index];
    if (!isRecord(raw)) {
      throw new ProviderResponseError("Cached product image metadata was malformed.");
    }
    const facts: DiscoveryCacheImageFacts = {
      cachedImageUrl: typeof raw.cachedImageUrl === "string" ? raw.cachedImageUrl : "",
      sourceImageHash: typeof raw.sourceImageHash === "string" ? raw.sourceImageHash : "",
    };
    assertControlledCacheImage(facts.cachedImageUrl, facts.sourceImageHash);
    return {
      ...product,
      imageUrl: facts.cachedImageUrl,
      sourceImageUrl: product.imageUrl,
      sourceImageHash: facts.sourceImageHash,
    } as LiveProductObservation & ControlledImageFacts;
  });
  return { ...output, products };
}

function assertControlledCacheImage(urlValue: string, sha256: string): void {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new ProviderResponseError("Cached product image hash was invalid.");
  }
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new ProviderResponseError("Cached product image URL was invalid.");
  }
  const expectedOrigin = getPublicSupabaseEnvironment().url;
  const expectedPath = `/storage/v1/object/public/product-images-public/${sha256}.`;
  if (
    url.protocol !== "https:" ||
    url.origin !== expectedOrigin ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    !url.pathname.startsWith(expectedPath) ||
    !/\.(?:jpg|png)$/.test(url.pathname)
  ) {
    throw new ProviderResponseError("Cached product image was not a controlled content-addressed asset.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
