import { describe, expect, it } from "vitest";
import { analyzePromptToPrototype } from "./analyzer";
import { applyGeneratedModelResult, getInitialMeshyStatus, getStartingMeshyStatus, withMeshyStatus } from "./model-generation";

describe("model generation state", () => {
  it("returns a disabled image-to-3d-ready message when an image exists", () => {
    const status = getInitialMeshyStatus(true);

    expect(status.kind).toBe("disabled");
    expect(status.message).toContain("Image-to-3D");
  });

  it("returns a disabled text-to-3d-ready message when no image exists", () => {
    const status = getInitialMeshyStatus(false);

    expect(status.kind).toBe("disabled");
    expect(status.message).toContain("Text-to-3D");
  });

  it("returns an immediate pending image-to-3d status for live result pages", () => {
    const status = getStartingMeshyStatus(true);

    expect(status).toMatchObject({
      kind: "pending",
      mode: "image-to-3d",
      progress: 0,
    });
  });

  it("returns an immediate pending text-to-3d status when no image exists", () => {
    const status = getStartingMeshyStatus(false);

    expect(status).toMatchObject({
      kind: "pending",
      mode: "text-to-3d",
      progress: 0,
    });
  });

  it("updates Meshy status without changing fallback model", () => {
    const spec = analyzePromptToPrototype("smart water bottle");
    const updated = withMeshyStatus(spec, {
      kind: "pending",
      mode: "image-to-3d",
      message: "Generating a custom model.",
    });

    expect(updated.statuses.meshy.kind).toBe("pending");
    expect(updated.model.glbPath).toBe("/models/bottle.glb");
  });

  it("stores generated GLB URLs as remoteModelUrl while preserving the local fallback path", () => {
    const spec = analyzePromptToPrototype("smart water bottle");
    const remoteModelUrl = "https://assets.meshy.ai/tasks/123/output/model.glb?Expires=4931020800&Signature=abc";
    const updated = applyGeneratedModelResult(spec, {
      fallbackModelPath: spec.model.glbPath,
      glbUrl: remoteModelUrl,
      id: spec.id,
      mode: "image-to-3d",
      refinedMeshyPrompt: "A smart water bottle.",
      status: "succeeded",
      taskId: "task-123",
    });

    expect(updated.model.remoteModelUrl).toBe(remoteModelUrl);
    expect(updated.model.glbPath).toBe("/models/bottle.glb");
    expect(updated.model.source).toBe("generated");
  });
});
