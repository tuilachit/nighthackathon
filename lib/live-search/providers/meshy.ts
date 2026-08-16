import "server-only";

import { timingSafeEqual } from "node:crypto";
import { getLiveSearchServerEnvironment } from "@/lib/live-search/env";
import { ProviderRequestError, ProviderResponseError } from "./browser-use";

const IMAGE_TO_3D_ENDPOINT = "https://api.meshy.ai/openapi/v1/image-to-3d";

export interface MeshyTask {
  readonly id: string;
  readonly status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  readonly progress: number;
  readonly consumedCredits?: number;
  readonly modelUrls: {
    readonly glb?: string;
    readonly usdz?: string;
  };
  readonly errorMessage?: string;
}

/** Starts image-to-3D only after a workflow approval has been durably recorded. */
export async function createMeshyImageTask(imageUrl: string): Promise<string> {
  assertSafePublicImageUrl(imageUrl);
  const environment = getLiveSearchServerEnvironment();
  const response = await fetch(IMAGE_TO_3D_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${environment.meshyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      model_type: "standard",
      ai_model: "meshy-6",
      enable_pbr: true,
      should_remesh: true,
      should_texture: true,
      target_formats: ["glb"],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  const payload = parseJson(text);
  if (!response.ok) {
    throw new ProviderRequestError("meshy", response.status, text);
  }
  if (!isRecord(payload) || typeof payload.result !== "string" || payload.result.length === 0) {
    throw new ProviderResponseError("Meshy did not return a task id.");
  }
  return payload.result;
}

/** Retrieves the canonical Meshy task; webhook bodies are never trusted as asset authority. */
export async function getMeshyTask(taskId: string): Promise<MeshyTask> {
  const environment = getLiveSearchServerEnvironment();
  const response = await fetch(`${IMAGE_TO_3D_ENDPOINT}/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${environment.meshyApiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  const payload = parseJson(text);
  if (!response.ok) {
    throw new ProviderRequestError("meshy", response.status, text);
  }
  if (!isRecord(payload) || payload.id !== taskId || !isMeshyStatus(payload.status)) {
    throw new ProviderResponseError("Meshy returned an invalid task response.");
  }
  const modelUrls = isRecord(payload.model_urls) ? payload.model_urls : {};
  return {
    id: payload.id,
    status: payload.status,
    progress: finiteInteger(payload.progress) ?? 0,
    ...(finiteInteger(payload.consumed_credits) === undefined
      ? {}
      : { consumedCredits: finiteInteger(payload.consumed_credits) }),
    modelUrls: {
      ...(safeHttpsUrl(modelUrls.glb) === undefined ? {} : { glb: safeHttpsUrl(modelUrls.glb) }),
      ...(safeHttpsUrl(modelUrls.usdz) === undefined ? {} : { usdz: safeHttpsUrl(modelUrls.usdz) }),
    },
    ...(isRecord(payload.task_error) && typeof payload.task_error.message === "string"
      ? { errorMessage: payload.task_error.message }
      : {}),
  };
}

/** Meshy does not sign webhooks; protect the endpoint with an opaque URL token. */
export function verifyMeshyWebhookToken(provided: string | null, expected: string): boolean {
  if (provided === null) {
    return false;
  }
  const left = Buffer.from(provided, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function readMeshyWebhookTaskId(input: unknown): string | undefined {
  return isRecord(input) &&
    input.type === "image-to-3d" &&
    typeof input.id === "string" &&
    input.id.length > 0 &&
    input.id.length <= 200
    ? input.id
    : undefined;
}

function assertSafePublicImageUrl(value: string): void {
  const normalized = safeHttpsUrl(value);
  if (normalized === undefined) {
    throw new ProviderResponseError("Meshy input must be a public HTTPS image URL.");
  }
  const host = new URL(normalized).hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new ProviderResponseError("Meshy input host is not public.");
  }
}

function safeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username.length === 0 && url.password.length === 0
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function isMeshyStatus(value: unknown): value is MeshyTask["status"] {
  return value === "PENDING" || value === "IN_PROGRESS" || value === "SUCCEEDED" || value === "FAILED" || value === "CANCELED";
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
