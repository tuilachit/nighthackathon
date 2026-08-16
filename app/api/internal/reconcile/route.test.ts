import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  environment: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("@/lib/live-search/env", () => ({
  isLiveSearchConfigured: mocks.configured,
  getLiveSearchServerEnvironment: mocks.environment,
}));

vi.mock("@/lib/live-search/reconciler", () => ({
  reconcileLiveSearch: mocks.reconcile,
}));

import { verifyBearerToken } from "@/lib/live-search/bearer";
import { GET } from "./route";

describe("live-search reconciler route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.environment.mockReturnValue({ cronSecret: "c".repeat(32) });
    mocks.reconcile.mockResolvedValue({
      queueMessagesCompleted: 2,
      queueMessagesDeferred: 0,
      queueMessagesDeadLettered: 0,
      providerTasksPolled: 1,
      workflowsExpired: 0,
    });
  });

  it("rejects missing or incorrect bearer credentials", async () => {
    const missing = await GET(new Request("https://fitment.test/api/internal/reconcile"));
    const incorrect = await GET(new Request("https://fitment.test/api/internal/reconcile", {
      headers: { Authorization: `Bearer ${"x".repeat(32)}` },
    }));

    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("runs bounded reconciliation for the configured bearer token", async () => {
    const response = await GET(new Request("https://fitment.test/api/internal/reconcile", {
      headers: { Authorization: `Bearer ${"c".repeat(32)}` },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      queueMessagesCompleted: 2,
      providerTasksPolled: 1,
    });
    expect(mocks.reconcile).toHaveBeenCalledOnce();
  });

  it("compares bearer values without accepting prefixes", () => {
    expect(verifyBearerToken(`Bearer ${"a".repeat(32)}`, "a".repeat(32))).toBe(true);
    expect(verifyBearerToken(`Bearer ${"a".repeat(31)}`, "a".repeat(32))).toBe(false);
    expect(verifyBearerToken(`bearer ${"a".repeat(32)}`, "a".repeat(32))).toBe(false);
  });
});
