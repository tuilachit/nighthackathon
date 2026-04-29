import { describe, expect, it } from "vitest";
import {
  categoryUsesValidatedAsset,
  getFallbackModel,
  getModelViewerAssetUrl,
  getPrimaryModelSource,
  isSupportedLocalModelAssetPath,
  isSupportedRemoteModelAssetUrl,
} from "./assets";

describe("assets", () => {
  it("keeps the bottle path as the validated fallback", () => {
    const model = getFallbackModel("bottle");

    expect(model.glbPath).toBe("/models/bottle.glb");
    expect(model.category).toBe("bottle");
    expect(categoryUsesValidatedAsset("bottle")).toBe(true);
  });

  it("maps unsupported categories to the bottle model", () => {
    expect(getFallbackModel("lamp").category).toBe("bottle");
    expect(getFallbackModel("unknown").category).toBe("bottle");
  });

  it("accepts signed Meshy GLB URLs with query strings", () => {
    const url =
      "https://assets.meshy.ai/users/abc123/tasks/018a210d-8ba4-705c-b111-1f1776f7f578/output/model.glb?Expires=1712345678&Signature=abc";

    expect(isSupportedRemoteModelAssetUrl(url, "glb")).toBe(true);
    expect(getModelViewerAssetUrl(url)).toBe(`/api/model-asset?url=${encodeURIComponent(url)}`);
  });

  it("rejects non-HTTPS or non-GLB remote URLs for GLB sources", () => {
    expect(isSupportedRemoteModelAssetUrl("http://assets.meshy.ai/output/model.glb", "glb")).toBe(false);
    expect(isSupportedRemoteModelAssetUrl("https://assets.meshy.ai/output/model.obj", "glb")).toBe(false);
  });

  it("accepts local generated GLB model paths", () => {
    expect(isSupportedLocalModelAssetPath("/models/generated/smart-hydration-bottle.glb", "glb")).toBe(true);
  });

  it("prefers the generated remote URL before the local fallback", () => {
    const model = getFallbackModel("bottle");
    const remoteModelUrl = "https://assets.meshy.ai/tasks/123/output/model.glb?Expires=4931020800&Signature=abc";

    expect(getPrimaryModelSource({ ...model, remoteModelUrl })).toBe(remoteModelUrl);
  });
});
