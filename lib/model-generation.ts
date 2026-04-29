import type { GeneratedModelResult, MeshyStatus, PrototypeSpec } from "./prototype-types";

export function getInitialMeshyStatus(imageAvailable: boolean): MeshyStatus {
  return {
    kind: "disabled",
    reason: "meshy-disabled",
    message: imageAvailable
      ? "Image-to-3D is ready to connect after fallback AR is verified."
      : "Text-to-3D is ready to connect after fallback AR is verified.",
  };
}

export function getStartingMeshyStatus(imageAvailable: boolean): MeshyStatus {
  return {
    kind: "pending",
    mode: imageAvailable ? "image-to-3d" : "text-to-3d",
    progress: 0,
    message: "Starting custom model generation.",
  };
}

export function withMeshyStatus(spec: PrototypeSpec, status: MeshyStatus): PrototypeSpec {
  return {
    ...spec,
    statuses: {
      ...spec.statuses,
      meshy: status,
    },
  };
}

export function applyGeneratedModelResult(spec: PrototypeSpec, result: GeneratedModelResult): PrototypeSpec {
  if (result.status === "pending") {
    return withMeshyStatus(spec, {
      kind: "pending",
      mode: result.mode,
      taskId: result.taskId,
      progress: result.progress,
      message:
        typeof result.progress === "number"
          ? `Generating the custom model (${result.progress}%).`
          : "Generating the custom model.",
    });
  }

  if (result.status === "succeeded" && result.glbUrl !== undefined) {
    return withMeshyStatus(
      {
        ...spec,
        refined3DPrompt: result.refinedMeshyPrompt,
        model: {
          ...spec.model,
          source: "generated",
          generationMode: result.mode,
          remoteModelUrl: result.glbUrl,
          remoteUsdzUrl: result.usdzUrl,
        },
      },
      {
        kind: "succeeded",
        mode: result.mode,
        taskId: result.taskId,
        remoteModelUrl: result.glbUrl,
        remoteUsdzUrl: result.usdzUrl,
        thumbnailUrl: result.thumbnailUrl,
        message: "Custom model generated and loaded.",
      },
    );
  }

  if (result.status === "timeout") {
    return withMeshyStatus(spec, {
      kind: "timeout",
      mode: result.mode,
      taskId: result.taskId,
      message: result.error ?? "Custom generation took too long. Fallback AR is still available.",
    });
  }

  return withMeshyStatus(spec, {
    kind: "failed",
    reason: result.mode === "text-to-3d" ? "text-generation-failed" : "image-generation-failed",
    mode: result.mode,
    taskId: result.taskId,
    message: result.error ?? "Custom generation failed. Fallback AR is still available.",
  });
}
