import type { GeneratedModelResult, GenerationMode } from "./prototype-types";

const MESHY_BASE_URL = "https://api.meshy.ai/openapi";
const MESHY_MODES = ["image-to-3d", "text-to-3d"] as const;
const MESHY_PROMPT_MAX_LENGTH = 800;

type MeshyMode = Exclude<GenerationMode, "none">;

interface StartMeshyInput {
  readonly id: string;
  readonly prompt: string;
  readonly imageDataUrl?: string | null;
  readonly fallbackModelPath: string;
}

interface PollMeshyInput {
  readonly taskId: string;
  readonly mode: MeshyMode;
  readonly refinedMeshyPrompt: string;
  readonly fallbackModelPath: string;
  readonly allowTextFallback?: boolean;
}

interface MeshyCreateResponse {
  readonly result?: string;
}

interface MeshyTaskResponse {
  readonly id?: string;
  readonly status?: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "EXPIRED";
  readonly progress?: number;
  readonly model_urls?: {
    readonly glb?: string;
    readonly usdz?: string;
  };
  readonly thumbnail_url?: string;
  readonly task_error?: {
    readonly message?: string;
  };
}

export function isMeshyMode(value: string | null): value is MeshyMode {
  return MESHY_MODES.includes(value as MeshyMode);
}

export function isMeshyEnabled(): boolean {
  return process.env.ENABLE_MESHY === "true" || process.env.NEXT_PUBLIC_ENABLE_MESHY === "true";
}

export function isSupportedMeshyImageDataUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && /^data:image\/(png|jpe?g);base64,/i.test(value);
}

export async function startMeshyGeneration(input: StartMeshyInput): Promise<GeneratedModelResult> {
  const apiKey = process.env.MESHY_API_KEY;
  const meshyPrompt = toMeshyPrompt(input.prompt);
  const generationInput = { ...input, prompt: meshyPrompt };

  if (!isMeshyEnabled()) {
    return failedStartResult(generationInput, "Custom generation is disabled. Set ENABLE_MESHY=true to call the API.");
  }

  if (apiKey === undefined || apiKey.trim() === "") {
    return failedStartResult(generationInput, "Missing MESHY_API_KEY.");
  }

  if (isSupportedMeshyImageDataUrl(input.imageDataUrl)) {
    try {
      const taskId = await createImageTo3DTask(apiKey, input.imageDataUrl);
      return pendingResult(generationInput, "image-to-3d", taskId);
    } catch (error) {
      console.warn("Image-to-3D task creation failed; trying Text-to-3D.", error);
    }
  }

  try {
    const taskId = await createTextTo3DTask(apiKey, meshyPrompt);
    return pendingResult(generationInput, "text-to-3d", taskId);
  } catch (error) {
    return failedStartResult(generationInput, error instanceof Error ? error.message : "Custom generation task creation failed.");
  }
}

export async function pollMeshyGeneration(input: PollMeshyInput): Promise<GeneratedModelResult> {
  const apiKey = process.env.MESHY_API_KEY;

  if (!isMeshyEnabled()) {
    return failedPollResult(input, "Custom generation is disabled.");
  }

  if (apiKey === undefined || apiKey.trim() === "") {
    return failedPollResult(input, "Missing MESHY_API_KEY.");
  }

  try {
    const task = await retrieveTask(apiKey, input.mode, input.taskId);
    const taskId = task.id ?? input.taskId;

    if (task.status === "SUCCEEDED") {
      const glbUrl = task.model_urls?.glb;
      if (glbUrl === undefined || !isHttpsGlbUrl(glbUrl)) {
        return failedPollResult(input, "Custom generation succeeded but did not return a valid GLB URL.");
      }

      return {
        id: taskId,
        mode: input.mode,
        status: "succeeded",
        taskId,
        glbUrl,
        usdzUrl: task.model_urls?.usdz,
        thumbnailUrl: task.thumbnail_url,
        refinedMeshyPrompt: input.refinedMeshyPrompt,
        fallbackModelPath: input.fallbackModelPath,
        progress: 100,
      };
    }

    if (task.status === "FAILED" || task.status === "EXPIRED") {
      if (input.mode === "image-to-3d" && input.allowTextFallback === true) {
        const textPrompt = toMeshyPrompt(input.refinedMeshyPrompt);
        const textTaskId = await createTextTo3DTask(apiKey, textPrompt);
        return {
          id: textTaskId,
          mode: "text-to-3d",
          status: "pending",
          taskId: textTaskId,
          refinedMeshyPrompt: textPrompt,
          fallbackModelPath: input.fallbackModelPath,
          progress: 0,
        };
      }

      return failedPollResult(input, task.task_error?.message ?? `Custom generation task ${task.status.toLowerCase()}.`);
    }

    return {
      id: taskId,
      mode: input.mode,
      status: "pending",
      taskId,
      refinedMeshyPrompt: input.refinedMeshyPrompt,
      fallbackModelPath: input.fallbackModelPath,
      progress: task.progress ?? 0,
    };
  } catch (error) {
    return failedPollResult(input, error instanceof Error ? error.message : "Could not poll custom generation task.");
  }
}

async function createImageTo3DTask(apiKey: string, imageDataUrl: string): Promise<string> {
  const data = await requestMeshy<MeshyCreateResponse>(apiKey, "/v1/image-to-3d", {
    image_url: imageDataUrl,
    enable_pbr: true,
    should_remesh: true,
    should_texture: true,
    target_formats: ["glb", "usdz"],
    auto_size: true,
    origin_at: "bottom",
  });

  if (data.result === undefined) {
    throw new Error("Image-to-3D did not return a task id.");
  }

  return data.result;
}

async function createTextTo3DTask(apiKey: string, prompt: string): Promise<string> {
  const data = await requestMeshy<MeshyCreateResponse>(apiKey, "/v2/text-to-3d", {
    mode: "preview",
    prompt,
    should_remesh: true,
    target_formats: ["glb", "usdz"],
  });

  if (data.result === undefined) {
    throw new Error("Text-to-3D did not return a task id.");
  }

  return data.result;
}

async function retrieveTask(apiKey: string, mode: MeshyMode, taskId: string): Promise<MeshyTaskResponse> {
  const path = mode === "image-to-3d" ? `/v1/image-to-3d/${taskId}` : `/v2/text-to-3d/${taskId}`;
  return requestMeshy<MeshyTaskResponse>(apiKey, path);
}

async function requestMeshy<T>(apiKey: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${MESHY_BASE_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Custom generation request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
}

function pendingResult(input: StartMeshyInput, mode: MeshyMode, taskId: string): GeneratedModelResult {
  return {
    id: input.id,
    mode,
    status: "pending",
    taskId,
    refinedMeshyPrompt: input.prompt,
    fallbackModelPath: input.fallbackModelPath,
    progress: 0,
  };
}

function failedStartResult(input: StartMeshyInput, message: string): GeneratedModelResult {
  return {
    id: input.id,
    mode: isSupportedMeshyImageDataUrl(input.imageDataUrl) ? "image-to-3d" : "text-to-3d",
    status: "failed",
    refinedMeshyPrompt: input.prompt,
    fallbackModelPath: input.fallbackModelPath,
    error: message,
  };
}

function failedPollResult(input: PollMeshyInput, message: string): GeneratedModelResult {
  return {
    id: input.taskId,
    mode: input.mode,
    status: "failed",
    taskId: input.taskId,
    refinedMeshyPrompt: input.refinedMeshyPrompt,
    fallbackModelPath: input.fallbackModelPath,
    error: message,
  };
}

function isHttpsGlbUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.pathname.toLowerCase().endsWith(".glb");
  } catch {
    return false;
  }
}

function toMeshyPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (normalized.length <= MESHY_PROMPT_MAX_LENGTH) {
    return normalized;
  }

  const hardLimit = MESHY_PROMPT_MAX_LENGTH - 1;
  const trimmed = normalized.slice(0, hardLimit);
  const sentenceBreak = Math.max(trimmed.lastIndexOf(". "), trimmed.lastIndexOf("; "), trimmed.lastIndexOf(", "));
  const wordBreak = trimmed.lastIndexOf(" ");
  const cutPoint = sentenceBreak >= 520 ? sentenceBreak + 1 : wordBreak >= 520 ? wordBreak : hardLimit;

  return trimmed.slice(0, cutPoint).trim();
}
