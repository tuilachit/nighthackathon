import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResourceNotFoundError } from "@/lib/live-search/http";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  cancelWorkflow: vi.fn(),
  configured: vi.fn(),
  stopBrowserSession: vi.fn(),
}));

vi.mock("@/lib/live-search/env", () => ({
  isLiveSearchConfigured: mocks.configured,
}));

vi.mock("@/lib/live-search/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/live-search/auth")>();
  return { ...actual, requireAuthenticatedUser: mocks.authenticate };
});

vi.mock("@/lib/live-search/repository", () => ({
  cancelWorkflowForOwner: mocks.cancelWorkflow,
}));

vi.mock("@/lib/live-search/providers/browser-use", () => ({
  stopBrowserSearchSession: mocks.stopBrowserSession,
}));

import { POST } from "./route";

const workflowId = "11111111-1111-4111-8111-111111111111";
const context = (id = workflowId) => ({ params: Promise.resolve({ id }) });

describe("cancel live-search workflow route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.authenticate.mockResolvedValue({ id: "owner-1", isAnonymous: true });
    mocks.cancelWorkflow.mockResolvedValue({
      workflowId,
      state: "cancelled",
      alreadyTerminal: false,
      browserExternalId: "browser-session-1",
    });
    mocks.stopBrowserSession.mockResolvedValue(undefined);
  });

  it("rejects disabled or malformed requests before authentication", async () => {
    mocks.configured.mockReturnValue(false);
    const disabled = await POST(new Request("https://fitment.example"), context());
    expect(disabled.status).toBe(503);

    mocks.configured.mockReturnValue(true);
    const malformed = await POST(
      new Request("https://fitment.example"),
      context("not-a-uuid"),
    );
    expect(malformed.status).toBe(400);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("cancels owner-scoped state first and requests one provider stop", async () => {
    const response = await POST(new Request("https://fitment.example"), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toEqual({
      workflowId,
      state: "cancelled",
      alreadyTerminal: false,
      providerStop: "requested",
    });
    expect(mocks.cancelWorkflow).toHaveBeenCalledWith("owner-1", workflowId);
    expect(mocks.stopBrowserSession).toHaveBeenCalledOnce();
    expect(mocks.stopBrowserSession).toHaveBeenCalledWith("browser-session-1");
  });

  it("stops a provider at most once across repeated cancellation commands", async () => {
    mocks.cancelWorkflow
      .mockResolvedValueOnce({
        workflowId,
        state: "cancelled",
        alreadyTerminal: false,
        browserExternalId: "browser-session-1",
      })
      .mockResolvedValueOnce({
        workflowId,
        state: "cancelled",
        alreadyTerminal: true,
      });

    const first = await POST(new Request("https://fitment.example"), context());
    const second = await POST(new Request("https://fitment.example"), context());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({
      alreadyTerminal: true,
      providerStop: "not-needed",
    });
    expect(mocks.stopBrowserSession).toHaveBeenCalledTimes(1);
  });

  it("keeps durable cancellation successful when the provider stop fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.stopBrowserSession.mockRejectedValue(new Error("provider unavailable"));

    const response = await POST(new Request("https://fitment.example"), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: "cancelled",
      providerStop: "failed",
    });
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("does not expose another owner's workflow", async () => {
    mocks.cancelWorkflow.mockRejectedValue(new ResourceNotFoundError("Workflow"));

    const response = await POST(new Request("https://fitment.example"), context());

    expect(response.status).toBe(404);
    expect(mocks.stopBrowserSession).not.toHaveBeenCalled();
  });
});
