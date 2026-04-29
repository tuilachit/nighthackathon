import { isSupportedRemoteGlb } from "./assets";
import type { MeshyStatus } from "./prototype-types";

export type ModelGenerationInput = {
  prompt: string;
  hasImage: boolean;
  enabled: boolean;
  apiKeyAvailable: boolean;
};

export function getInitialMeshyStatus(input: ModelGenerationInput): MeshyStatus {
  if (!input.enabled) return { state: "disabled", reason: "meshy-disabled" };
  if (!input.apiKeyAvailable) return { state: "disabled", reason: "missing-api-key" };
  return { state: "pending", mode: input.hasImage ? "image-to-3d" : "text-to-3d" };
}

export function promoteGeneratedModel(remoteModelUrl: string): MeshyStatus {
  if (!isSupportedRemoteGlb(remoteModelUrl)) {
    return { state: "failed", reason: "invalid-model-url", message: "Meshy did not return a valid HTTPS GLB URL." };
  }

  return {
    state: "succeeded",
    mode: "image-to-3d",
    remoteModelUrl,
  };
}
