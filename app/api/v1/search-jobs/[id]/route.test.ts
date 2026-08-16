import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationRequiredError } from "@/lib/live-search/auth";
import { ResourceNotFoundError } from "@/lib/live-search/http";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  authenticate: vi.fn(),
  getWorkflow: vi.fn(),
}));

vi.mock("@/lib/live-search/env", () => ({
  isLiveSearchConfigured: mocks.configured,
}));

vi.mock("@/lib/live-search/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/live-search/auth")>();
  return { ...actual, requireAuthenticatedUser: mocks.authenticate };
});

vi.mock("@/lib/live-search/repository", () => ({
  getWorkflowForOwner: mocks.getWorkflow,
}));

import { GET } from "./route";

const workflowId = "11111111-1111-4111-8111-111111111111";
const context = (id = workflowId) => ({ params: Promise.resolve({ id }) });

describe("get live-search workflow route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.authenticate.mockResolvedValue({ id: "owner-1", isAnonymous: true });
    mocks.getWorkflow.mockResolvedValue({
      id: workflowId,
      state: "searching",
      queryText: "narrow shelf",
      measurement: {
        widthMm: 900,
        heightMm: 1800,
        depthMm: 350,
        uncertaintyMm: 25,
        source: "manual",
      },
      retailers: ["ikea-au"],
      candidates: [],
      createdAt: "2026-08-16T00:00:00.000Z",
      updatedAt: "2026-08-16T00:00:00.000Z",
    });
  });

  it("rejects requests when disabled or when the workflow id is malformed", async () => {
    mocks.configured.mockReturnValue(false);
    const disabled = await GET(new Request("https://fitment.example"), context());
    expect(disabled.status).toBe(503);

    mocks.configured.mockReturnValue(true);
    const malformed = await GET(new Request("https://fitment.example"), context("not-a-uuid"));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: "invalid_workflow_id" },
    });
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("looks up the workflow with both its id and authenticated owner", async () => {
    const response = await GET(new Request("https://fitment.example"), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    await expect(response.json()).resolves.toMatchObject({ id: workflowId, state: "searching" });
    expect(mocks.getWorkflow).toHaveBeenCalledWith(workflowId, "owner-1");
  });

  it("maps authentication and owner-scoped not-found failures", async () => {
    mocks.authenticate.mockRejectedValueOnce(new AuthenticationRequiredError());
    const unauthenticated = await GET(new Request("https://fitment.example"), context());
    expect(unauthenticated.status).toBe(401);

    mocks.authenticate.mockResolvedValueOnce({ id: "owner-1", isAnonymous: true });
    mocks.getWorkflow.mockRejectedValueOnce(new ResourceNotFoundError("Workflow"));
    const missing = await GET(new Request("https://fitment.example"), context());
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: "not_found" } });
  });
});
