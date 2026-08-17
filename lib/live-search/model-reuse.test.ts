import { describe, expect, it } from "vitest";
import { buildModelReuseKey } from "./model-reuse";

const base = {
  productSnapshotHash: "a".repeat(64),
  sourceImageHash: "b".repeat(64),
  dimensions: { widthMm: 600, heightMm: 1_800, depthMm: 300 },
} as const;

describe("buildModelReuseKey", () => {
  it("is stable for identical immutable generation facts", () => {
    expect(buildModelReuseKey(base)).toBe(buildModelReuseKey({ ...base }));
  });

  it.each([
    ["product snapshot", { productSnapshotHash: "c".repeat(64) }],
    ["source image", { sourceImageHash: "d".repeat(64) }],
    ["dimensions", { dimensions: { ...base.dimensions, depthMm: 301 } }],
    ["settings", { meshySettings: { aiModel: "future" } }],
    ["processing", { processingVersion: "glb-rescale-v3" }],
  ])("changes when %s changes", (_label, change) => {
    expect(buildModelReuseKey({ ...base, ...change })).not.toBe(buildModelReuseKey(base));
  });

  it("rejects malformed hashes and dimensions", () => {
    expect(() => buildModelReuseKey({ ...base, productSnapshotHash: "bad" })).toThrow();
    expect(() => buildModelReuseKey({ ...base, dimensions: { ...base.dimensions, widthMm: 0 } })).toThrow();
  });
});
