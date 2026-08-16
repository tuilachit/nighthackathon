import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/live-search/env", () => ({
  getLiveSearchServerEnvironment: () => ({ meshyApiKey: "test-meshy-key" }),
}));

import { getMeshyTask, readMeshyWebhookTaskId, verifyMeshyWebhookToken } from "./meshy";

const TOKEN = "meshy-webhook-token-at-least-32-characters-long";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getMeshyTask", () => {
  it("accepts only a canonical response for the task id that was requested", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "different-task",
      status: "SUCCEEDED",
      progress: 100,
      model_urls: { glb: "https://cdn.meshy.ai/model.glb" },
    }), { status: 200 })));

    await expect(getMeshyTask("expected-task")).rejects.toThrow(
      "Meshy returned an invalid task response.",
    );
  });

  it("returns a matching canonical task and limits the GET to ten seconds", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "expected-task",
      status: "IN_PROGRESS",
      progress: 42,
      model_urls: {},
    }), { status: 200 })));

    await expect(getMeshyTask("expected-task")).resolves.toMatchObject({
      id: "expected-task",
      status: "IN_PROGRESS",
      progress: 42,
    });
    expect(timeout).toHaveBeenCalledWith(10_000);
  });
});

describe("verifyMeshyWebhookToken", () => {
  it("accepts only the exact opaque webhook token", () => {
    expect(verifyMeshyWebhookToken(TOKEN, TOKEN)).toBe(true);
    expect(verifyMeshyWebhookToken(`${TOKEN}x`, TOKEN)).toBe(false);
    expect(verifyMeshyWebhookToken(TOKEN.replace(/.$/, "x"), TOKEN)).toBe(false);
  });

  it("rejects a missing token and different-length input", () => {
    expect(verifyMeshyWebhookToken(null, TOKEN)).toBe(false);
    expect(verifyMeshyWebhookToken("short", TOKEN)).toBe(false);
  });
});

describe("readMeshyWebhookTaskId", () => {
  it("extracts a non-empty task id only from an object payload", () => {
    expect(readMeshyWebhookTaskId({ type: "image-to-3d", id: "task-123", status: "SUCCEEDED" })).toBe("task-123");
    expect(readMeshyWebhookTaskId({ type: "text-to-3d", id: "task-123" })).toBeUndefined();
    expect(readMeshyWebhookTaskId({ id: "" })).toBeUndefined();
    expect(readMeshyWebhookTaskId({ id: 123 })).toBeUndefined();
    expect(readMeshyWebhookTaskId(["task-123"])).toBeUndefined();
    expect(readMeshyWebhookTaskId(null)).toBeUndefined();
  });
});
