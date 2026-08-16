import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  environment: vi.fn(),
  registerWebhook: vi.fn(),
  processWebhook: vi.fn(),
  after: vi.fn<(callback: () => Promise<void>) => void>(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => Promise<void>) => mocks.after(callback),
  };
});

vi.mock("@/lib/live-search/env", () => ({
  isLiveSearchConfigured: mocks.configured,
  getLiveSearchServerEnvironment: mocks.environment,
}));

vi.mock("@/lib/live-search/repository", () => ({
  registerWebhook: mocks.registerWebhook,
}));

vi.mock("@/lib/live-search/service", () => ({
  processMeshyWebhook: mocks.processWebhook,
}));

import { sha256Hex, stableJson } from "@/lib/live-search/hashing";
import { POST } from "./route";

const webhookSecret = "meshy-webhook-secret-that-is-long-enough";
const payload = { type: "image-to-3d", id: "meshy-task-123", status: "SUCCEEDED", progress: 100 };

function webhookRequest(
  body: unknown = payload,
  token = webhookSecret,
  headers: HeadersInit = {},
): Request {
  return new Request(
    `https://fitment.example/api/v1/webhooks/meshy?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
  );
}

describe("Meshy webhook route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.environment.mockReturnValue({ meshyWebhookSecret: webhookSecret });
    mocks.registerWebhook.mockResolvedValue({ inboxId: "inbox-1", duplicate: false });
    mocks.processWebhook.mockResolvedValue(undefined);
  });

  it("reports not configured without exposing token validation", async () => {
    mocks.configured.mockReturnValue(false);

    const response = await POST(webhookRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "not_configured" } });
    expect(mocks.environment).not.toHaveBeenCalled();
    expect(mocks.registerWebhook).not.toHaveBeenCalled();
  });

  it("rejects missing or incorrect opaque tokens before reading or storing the event", async () => {
    const missing = new Request("https://fitment.example/api/v1/webhooks/meshy", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const missingResponse = await POST(missing);
    const incorrectResponse = await POST(webhookRequest(payload, "x".repeat(webhookSecret.length)));

    expect(missingResponse.status).toBe(401);
    expect(incorrectResponse.status).toBe(401);
    await expect(incorrectResponse.json()).resolves.toMatchObject({
      error: { code: "invalid_token" },
    });
    expect(mocks.registerWebhook).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("rejects malformed and oversized webhook bodies", async () => {
    const malformed = await POST(webhookRequest({ status: "SUCCEEDED", progress: 100 }));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ error: { code: "invalid_webhook" } });

    const oversized = await POST(webhookRequest(payload, webhookSecret, {
      "content-length": String(1024 * 1024 + 1),
    }));
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toMatchObject({ error: { code: "request_too_large" } });
    expect(mocks.registerWebhook).not.toHaveBeenCalled();
  });

  it("stores a deterministic event identity and defers canonical processing", async () => {
    let deferred: (() => Promise<void>) | undefined;
    mocks.after.mockImplementation((callback) => {
      deferred = callback;
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true, duplicate: false });
    expect(mocks.registerWebhook).toHaveBeenCalledWith(
      "meshy",
      "meshy-task-123:SUCCEEDED:100",
      sha256Hex(stableJson(payload)),
      payload,
    );
    expect(mocks.processWebhook).not.toHaveBeenCalled();

    await deferred?.();
    expect(mocks.processWebhook).toHaveBeenCalledWith("inbox-1", "meshy-task-123");
  });

  it("acknowledges unrelated Meshy task types without storing them", async () => {
    const response = await POST(webhookRequest({
      type: "text-to-3d",
      id: "other-task-123",
      status: "SUCCEEDED",
      progress: 100,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true, ignored: true });
    expect(mocks.registerWebhook).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("accepts a duplicate replay without scheduling it twice", async () => {
    mocks.after.mockImplementation((callback) => {
      void callback();
    });
    mocks.registerWebhook
      .mockResolvedValueOnce({ inboxId: "inbox-1", duplicate: false })
      .mockResolvedValueOnce({ inboxId: "inbox-1", duplicate: true });

    const first = await POST(webhookRequest());
    const replay = await POST(webhookRequest());

    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    await expect(replay.json()).resolves.toEqual({ accepted: true, duplicate: true });
    expect(mocks.registerWebhook).toHaveBeenCalledTimes(2);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(mocks.processWebhook).toHaveBeenCalledOnce());
  });
});
