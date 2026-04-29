import { describe, expect, it } from "vitest";
import { analyzePromptToPrototype } from "./analyzer";
import { getInitialMeshyStatus, withMeshyStatus } from "./model-generation";

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
});
