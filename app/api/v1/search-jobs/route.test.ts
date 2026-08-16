import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationRequiredError } from "@/lib/live-search/auth";
import { IdempotencyConflictError } from "@/lib/live-search/http";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  environment: vi.fn(),
  authenticate: vi.fn(),
  createWorkflow: vi.fn(),
  dispatch: vi.fn(),
  requestHash: vi.fn(),
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

vi.mock("@/lib/live-search/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/live-search/auth")>();
  return { ...actual, requireAuthenticatedUser: mocks.authenticate };
});

vi.mock("@/lib/live-search/repository", () => ({
  createWorkflow: mocks.createWorkflow,
}));

vi.mock("@/lib/live-search/service", () => ({
  dispatchSearchWorkflow: mocks.dispatch,
  liveSearchRequestHash: mocks.requestHash,
}));

import { POST } from "./route";

const workflowId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "search-request-1234567890";
const command = {
  queryText: "narrow oak shelf",
  measurement: {
    widthMm: 900,
    heightMm: 1800,
    depthMm: 350,
    uncertaintyMm: 25,
    accessWidthMm: 820,
    source: "manual",
  },
  retailers: ["ikea-au", "ikea-au", "kmart-au"],
};

function commandRequest(body: unknown = command, key: string | null = idempotencyKey): Request {
  return new Request("https://fitment.example/api/v1/search-jobs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key === null ? {} : { "idempotency-key": key }),
    },
    body: JSON.stringify(body),
  });
}

describe("create live-search job route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.environment.mockReturnValue({
      abuseHashSecret: "abuse-hash-secret-that-is-at-least-32-characters",
    });
    mocks.authenticate.mockResolvedValue({ id: "owner-1", isAnonymous: true });
    mocks.requestHash.mockReturnValue("request-hash");
    mocks.createWorkflow.mockResolvedValue({ workflowId, state: "queued", reused: false });
    mocks.dispatch.mockResolvedValue(undefined);
  });

  it("reports not configured before reading the command", async () => {
    mocks.configured.mockReturnValue(false);

    const response = await POST(commandRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "not_configured" } });
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("rejects missing, short, and oversized idempotency keys", async () => {
    for (const key of [null, "too-short", "x".repeat(201)]) {
      const response = await POST(commandRequest(command, key));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "invalid_idempotency_key" },
      });
    }
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("rejects invalid commands before authenticating or writing", async () => {
    const response = await POST(commandRequest({ ...command, retailers: ["wayfair-au"] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_request", details: ["Unsupported retailer: wayfair-au."] },
    });
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.createWorkflow).not.toHaveBeenCalled();
  });

  it("creates an owner-scoped idempotent workflow and schedules dispatch after acceptance", async () => {
    let deferred: (() => Promise<void>) | undefined;
    mocks.after.mockImplementation((callback) => {
      deferred = callback;
    });

    const response = await POST(commandRequest());

    expect(response.status).toBe(202);
    expect(response.headers.get("location")).toBe(`/api/v1/search-jobs/${workflowId}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ workflowId, state: "queued", reused: false });
    const normalizedCommand = {
      ...command,
      retailers: ["ikea-au", "kmart-au"],
    };
    expect(mocks.requestHash).toHaveBeenCalledWith(normalizedCommand);
    expect(mocks.createWorkflow).toHaveBeenCalledWith(
      "owner-1",
      expect.stringMatching(/^[0-9a-f]{64}$/),
      normalizedCommand,
      "request-hash",
      idempotencyKey,
    );
    expect(mocks.dispatch).not.toHaveBeenCalled();

    await deferred?.();
    expect(mocks.dispatch).toHaveBeenCalledWith(workflowId, "request-hash");
  });

  it("maps authentication and idempotency conflicts to stable API errors", async () => {
    mocks.authenticate.mockRejectedValueOnce(new AuthenticationRequiredError());
    const unauthenticated = await POST(commandRequest());
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({
      error: { code: "authentication_required" },
    });

    mocks.authenticate.mockResolvedValueOnce({ id: "owner-1", isAnonymous: true });
    mocks.createWorkflow.mockRejectedValueOnce(new IdempotencyConflictError());
    const conflict = await POST(commandRequest());
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "idempotency_conflict" },
    });
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
