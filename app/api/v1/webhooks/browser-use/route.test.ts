import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  after: vi.fn<(callback: () => Promise<void>) => void>(),
  verifyWebhook: vi.fn(),
  registerWebhook: vi.fn(),
  processWebhook: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => Promise<void>) => mocks.after(callback),
  };
});

vi.mock("@/lib/live-search/env", () => ({
  isLiveSearchConfigured: () => true,
  getLiveSearchServerEnvironment: () => ({
    browserUseWebhookSecret: "browser-use-webhook-secret-at-least-32-characters",
  }),
}));

vi.mock("@/lib/live-search/providers/browser-use", () => ({
  verifyBrowserUseWebhook: (...args: readonly unknown[]) => mocks.verifyWebhook(...args),
}));

vi.mock("@/lib/live-search/repository", () => ({
  registerWebhook: (...args: readonly unknown[]) => mocks.registerWebhook(...args),
}));

vi.mock("@/lib/live-search/service", () => ({
  processBrowserUseWebhook: (...args: readonly unknown[]) => mocks.processWebhook(...args),
}));

import { POST } from "./route";

function webhookRequest(payload: unknown, headers: HeadersInit = {}): Request {
  return new Request("https://fitment.example/api/v1/webhooks/browser-use", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-browser-use-signature": "a".repeat(64),
      "x-browser-use-timestamp": "1800000000",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

const event = {
  type: "agent.task.status_update",
  timestamp: "2026-08-16T00:00:00.000Z",
  payload: { task_id: "task-123", session_id: "session-123", status: "finished" },
};

describe("Browser Use webhook route security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyWebhook.mockReturnValue(true);
    mocks.after.mockImplementation((callback) => {
      void callback();
    });
    mocks.processWebhook.mockResolvedValue(undefined);
  });

  it("rejects an unauthenticated webhook before touching the inbox", async () => {
    mocks.verifyWebhook.mockReturnValue(false);

    const response = await POST(webhookRequest(event));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_signature" } });
    expect(mocks.registerWebhook).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared payload before signature verification", async () => {
    const response = await POST(webhookRequest(event, {
      "content-length": String(1024 * 1024 + 1),
    }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "request_too_large" } });
    expect(mocks.verifyWebhook).not.toHaveBeenCalled();
    expect(mocks.registerWebhook).not.toHaveBeenCalled();
  });

  it("rejects a signed payload that is not a supported Browser Use event", async () => {
    const response = await POST(webhookRequest({ ...event, type: "unknown.event" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_webhook" } });
    expect(mocks.registerWebhook).not.toHaveBeenCalled();
  });

  it("acknowledges a signed Browser Use webhook test without enqueueing it", async () => {
    const response = await POST(webhookRequest({
      type: "test",
      timestamp: "2026-08-16T00:00:00.000Z",
      payload: {},
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true, test: true });
    expect(mocks.registerWebhook).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("rejects a task event without its canonical session id", async () => {
    const response = await POST(webhookRequest({
      ...event,
      payload: { task_id: "task-123", status: "finished" },
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_webhook" } });
    expect(mocks.registerWebhook).not.toHaveBeenCalled();
  });

  it("deduplicates an authenticated replay and schedules processing only once", async () => {
    mocks.registerWebhook
      .mockResolvedValueOnce({ inboxId: "inbox-1", duplicate: false })
      .mockResolvedValueOnce({ inboxId: "inbox-1", duplicate: true });

    const first = await POST(webhookRequest(event));
    const replay = await POST(webhookRequest(event));

    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    await expect(first.json()).resolves.toEqual({ accepted: true, duplicate: false });
    await expect(replay.json()).resolves.toEqual({ accepted: true, duplicate: true });
    expect(mocks.registerWebhook).toHaveBeenCalledTimes(2);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(mocks.processWebhook).toHaveBeenCalledOnce();
    });
    expect(mocks.processWebhook).toHaveBeenCalledWith("inbox-1", "session-123");
  });
});
