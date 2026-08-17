import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationRequiredError } from "@/lib/live-search/auth";
import { IdempotencyConflictError, InvalidWorkflowStateError } from "@/lib/live-search/http";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  authenticate: vi.fn(),
  approve: vi.fn(),
  dispatch: vi.fn(),
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
}));

vi.mock("@/lib/live-search/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/live-search/auth")>();
  return { ...actual, requireAuthenticatedUser: mocks.authenticate };
});

vi.mock("@/lib/live-search/repository", () => ({
  approveCandidate: mocks.approve,
}));

vi.mock("@/lib/live-search/service", () => ({
  dispatchModelWorkflow: mocks.dispatch,
}));

import { POST } from "./route";

const workflowId = "11111111-1111-4111-8111-111111111111";
const candidateId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "approval-request-123456789";
const context = (id = workflowId) => ({ params: Promise.resolve({ id }) });

function approvalRequest(
  body: unknown = { candidateId },
  key: string | null = idempotencyKey,
): Request {
  return new Request(`https://fitment.example/api/v1/search-jobs/${workflowId}/approve`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key === null ? {} : { "idempotency-key": key }),
    },
    body: JSON.stringify(body),
  });
}

describe("approve live-search candidate route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.authenticate.mockResolvedValue({ id: "owner-1", isAnonymous: true });
    mocks.approve.mockResolvedValue({
      workflowId,
      candidateId,
      state: "approved",
      requestHash: "model-request-hash",
    });
    mocks.dispatch.mockResolvedValue(undefined);
  });

  it("rejects disabled service, malformed workflow ids, and invalid idempotency keys", async () => {
    mocks.configured.mockReturnValue(false);
    const disabled = await POST(approvalRequest(), context());
    expect(disabled.status).toBe(503);

    mocks.configured.mockReturnValue(true);
    const malformedId = await POST(approvalRequest(), context("not-a-uuid"));
    expect(malformedId.status).toBe(400);
    await expect(malformedId.json()).resolves.toMatchObject({
      error: { code: "invalid_workflow_id" },
    });

    const missingKey = await POST(approvalRequest({ candidateId }, null), context());
    expect(missingKey.status).toBe(400);
    await expect(missingKey.json()).resolves.toMatchObject({
      error: { code: "invalid_idempotency_key" },
    });
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("rejects malformed candidate ids before authenticating", async () => {
    const response = await POST(approvalRequest({ candidateId: "not-a-uuid" }), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_candidate_id" },
    });
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("approves for the authenticated owner and schedules model dispatch after acceptance", async () => {
    let deferred: (() => Promise<void>) | undefined;
    mocks.after.mockImplementation((callback) => {
      deferred = callback;
    });

    const response = await POST(approvalRequest(), context());

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ workflowId, candidateId, state: "approved" });
    expect(mocks.approve).toHaveBeenCalledWith(
      "owner-1",
      workflowId,
      candidateId,
      idempotencyKey,
    );
    expect(mocks.dispatch).not.toHaveBeenCalled();

    await deferred?.();
    expect(mocks.dispatch).toHaveBeenCalledWith(workflowId, "model-request-hash");
  });

  it("returns an already reusable asset without scheduling another Meshy dispatch", async () => {
    mocks.approve.mockResolvedValueOnce({
      workflowId,
      candidateId,
      state: "asset_ready",
      requestHash: "reused-model-request-hash",
    });

    const response = await POST(approvalRequest(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      workflowId,
      candidateId,
      state: "asset_ready",
    });
    expect(mocks.approve).toHaveBeenCalledWith(
      "owner-1",
      workflowId,
      candidateId,
      idempotencyKey,
    );
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("maps auth, idempotency, and invalid-state failures without scheduling work", async () => {
    mocks.authenticate.mockRejectedValueOnce(new AuthenticationRequiredError());
    const unauthenticated = await POST(approvalRequest(), context());
    expect(unauthenticated.status).toBe(401);

    mocks.authenticate.mockResolvedValueOnce({ id: "owner-1", isAnonymous: true });
    mocks.approve.mockRejectedValueOnce(new IdempotencyConflictError());
    const conflict = await POST(approvalRequest(), context());
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "idempotency_conflict" },
    });

    mocks.approve.mockRejectedValueOnce(new InvalidWorkflowStateError("Candidate does not fit."));
    const invalidState = await POST(approvalRequest(), context());
    expect(invalidState.status).toBe(409);
    await expect(invalidState.json()).resolves.toMatchObject({
      error: { code: "invalid_workflow_state" },
    });
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
