const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40;

export interface MeshyGenerationInput {
  readonly prompt: string;
  readonly imageDataUrl?: string;
}

export type MeshyGenerationResult =
  | { readonly status: "succeeded"; readonly glbUrl: string; readonly usdzUrl?: string }
  | { readonly status: "failed"; readonly error: string };

interface StartGenerationResponse {
  readonly generation?: {
    readonly status: "pending" | "succeeded" | "failed" | "timeout";
    readonly taskId?: string;
    readonly mode: "image-to-3d" | "text-to-3d";
    readonly refinedMeshyPrompt: string;
    readonly error?: string;
  };
  readonly error?: string;
}

interface StatusResponse {
  readonly generation?: {
    readonly status: "pending" | "succeeded" | "failed" | "timeout";
    readonly taskId?: string;
    readonly glbUrl?: string;
    readonly usdzUrl?: string;
    readonly error?: string;
  };
}

/**
 * Shared Meshy start+poll client used by both the manual "add a product from a
 * photo" form and the automatic catalog-product generation path. Callers are
 * responsible for scaling the result to a trusted real-world size — this only
 * returns whatever Meshy produced.
 */
export async function generateModelViaMeshy(input: MeshyGenerationInput): Promise<MeshyGenerationResult> {
  try {
    const startResponse = await fetch("/api/generate-model/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: input.prompt, imageDataUrl: input.imageDataUrl, founderContext: "" }),
    });
    const startData = (await startResponse.json()) as StartGenerationResponse;
    const generation = startData.generation;

    if (!startResponse.ok || generation === undefined) {
      return { status: "failed", error: startData.error ?? "Could not start generation." };
    }
    if (generation.status === "failed") {
      return { status: "failed", error: generation.error ?? "Generation failed." };
    }
    if (generation.taskId === undefined) {
      return { status: "failed", error: "Generation did not return a task id." };
    }

    return await pollUntilDone(generation.taskId, generation.mode, generation.refinedMeshyPrompt);
  } catch {
    return { status: "failed", error: "Could not reach the generation service." };
  }
}

async function pollUntilDone(taskId: string, mode: string, refinedPrompt: string): Promise<MeshyGenerationResult> {
  let currentTaskId = taskId;

  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    await delay(POLL_INTERVAL_MS);

    const params = new URLSearchParams({
      taskId: currentTaskId,
      mode,
      refinedPrompt,
      fallbackModelPath: "/models/unit-box.glb",
      allowTextFallback: mode === "image-to-3d" ? "true" : "false",
    });

    const statusResponse = await fetch(`/api/generate-model/status?${params.toString()}`);
    const statusData = (await statusResponse.json()) as StatusResponse;
    const generation = statusData.generation;

    if (!statusResponse.ok || generation === undefined) {
      return { status: "failed", error: "Lost track of the generation task." };
    }

    if (generation.status === "succeeded" && generation.glbUrl !== undefined) {
      return { status: "succeeded", glbUrl: generation.glbUrl, usdzUrl: generation.usdzUrl };
    }

    if (generation.status === "failed" || generation.status === "timeout") {
      return { status: "failed", error: generation.error ?? "Generation failed." };
    }

    // Keep polling; taskId can change once (image-to-3d falling back to text-to-3d).
    if (generation.taskId !== undefined) {
      currentTaskId = generation.taskId;
    }
  }

  return { status: "failed", error: "Generation took too long." };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
