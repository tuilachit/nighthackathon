import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationRequiredError } from "@/lib/live-search/auth";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  createShare: vi.fn(),
  getWorkflow: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/live-search/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/live-search/auth")>();
  return { ...actual, requireAuthenticatedUser: mocks.authenticate };
});

vi.mock("@/lib/live-search/repository", () => ({
  createComparisonShare: mocks.createShare,
  getWorkflowForOwner: mocks.getWorkflow,
}));

import { POST } from "./route";

const workflowId = "11111111-1111-4111-8111-111111111111";
const candidateId = "22222222-2222-4222-8222-222222222222";
const expiresAt = "2026-09-16T00:00:00.000Z";

function shareRequest(body: unknown): Request {
  return new Request("https://fitment.example/api/v1/comparison-shares", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function workflowSnapshot(): Record<string, unknown> {
  return {
    id: workflowId,
    state: "ready_for_approval",
    queryText: "narrow oak shelf",
    intent: {
      kind: "prompt",
      text: "narrow oak shelf",
      retailers: ["ikea-au"],
    },
    measurement: {
      widthMm: 900,
      heightMm: 1_800,
      depthMm: 350,
      accessWidthMm: 820,
      uncertaintyMm: 25,
      source: "manual",
    },
    retailers: ["ikea-au"],
    cachePolicy: "prefer-recent",
    cacheHit: false,
    freshness: "live",
    checkedAt: "2026-08-17T00:00:00.000Z",
    candidates: [{
      id: candidateId,
      rank: 0,
      fitStatus: "fits",
      observation: {
        retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
        retailerProductId: "private-retailer-id",
        name: "BILLY bookcase",
        category: "bookcase",
        productUrl: "https://www.ikea.com/au/en/p/billy-bookcase/",
        imageUrl: "https://www.ikea.com/images/billy.jpg",
        priceMinor: 12_900,
        currency: "AUD",
        availability: "in_stock",
        assembledDimensions: { widthMm: 700, heightMm: 1_600, depthMm: 280 },
        packages: [],
        dimensionsSource: "retailer-page",
        dimensionsEvidence: "Width: 70 cm; Height: 160 cm; Depth: 28 cm",
        observedAt: "2026-08-17T00:00:00.000Z",
        confidence: "high",
      },
      fit: {
        fits: true,
        orientation: "default",
        widthClearanceMm: 135,
        heightClearanceMm: 165,
        depthClearanceMm: 25,
        minimumClearanceMm: 25,
        confidence: "high",
        reasons: [],
      },
      access: { status: "skipped", passes: true, basis: "unknown" },
    }],
    isPartial: false,
    coverageNotes: [],
    approvedCandidateId: candidateId,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  };
}

describe("create public comparison share route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authenticate.mockResolvedValue({ id: "owner-1", isAnonymous: true });
    mocks.getWorkflow.mockResolvedValue(workflowSnapshot());
    mocks.createShare.mockResolvedValue({
      shareId: "33333333-3333-4333-8333-333333333333",
      expiresAt,
    });
  });

  it("authorizes the owner, hashes the token, and stores no private row identifiers", async () => {
    const response = await POST(shareRequest({
      workflowId,
      candidateIds: [candidateId],
    }));

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    const body = await response.json() as { path: string; expiresAt: string };
    expect(body.expiresAt).toBe(expiresAt);
    expect(body.path).toMatch(/^\/fit\/share\/[A-Za-z0-9_-]{43}$/);
    expect(mocks.getWorkflow).toHaveBeenCalledWith(workflowId, "owner-1");

    const stored = mocks.createShare.mock.calls[0]?.[0] as {
      ownerId: string;
      tokenHash: string;
      schemaVersion: number;
      payload: Readonly<Record<string, unknown>>;
    };
    expect(stored).toMatchObject({
      ownerId: "owner-1",
      tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      schemaVersion: 1,
    });
    const serialized = JSON.stringify(stored.payload);
    expect(serialized).not.toContain(workflowId);
    expect(serialized).not.toContain(candidateId);
    expect(serialized).not.toContain("private-retailer-id");
    expect(serialized).not.toContain("owner-1");
  });

  it("rejects malformed and duplicate selections before authentication", async () => {
    for (const body of [
      { workflowId: "not-a-uuid", candidateIds: [candidateId] },
      { workflowId, candidateIds: [] },
      { workflowId, candidateIds: [candidateId, candidateId] },
    ]) {
      const response = await POST(shareRequest(body));
      expect(response.status).toBe(400);
    }
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.createShare).not.toHaveBeenCalled();
  });

  it("rejects a candidate outside the authenticated owner's workflow", async () => {
    const response = await POST(shareRequest({
      workflowId,
      candidateIds: ["44444444-4444-4444-8444-444444444444"],
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_share_selection" },
    });
    expect(mocks.createShare).not.toHaveBeenCalled();
  });

  it("requires an authenticated owner", async () => {
    mocks.authenticate.mockRejectedValue(new AuthenticationRequiredError());

    const response = await POST(shareRequest({ workflowId, candidateIds: [candidateId] }));

    expect(response.status).toBe(401);
    expect(mocks.getWorkflow).not.toHaveBeenCalled();
    expect(mocks.createShare).not.toHaveBeenCalled();
  });
});
