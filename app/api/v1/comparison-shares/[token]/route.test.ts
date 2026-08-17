import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveShare: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/live-search/repository", () => ({
  resolveComparisonShare: mocks.resolveShare,
}));

import { GET } from "./route";

const token = "A".repeat(43);
const expiresAt = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
const snapshot = {
  measurement: {
    widthMm: 900,
    heightMm: 1_800,
    depthMm: 350,
    accessWidthMm: 820,
    uncertaintyMm: 25,
    source: "manual",
  },
  intent: {
    kind: "prompt",
    text: "narrow bookcase",
    retailers: ["ikea-au"],
  },
  candidates: [{
    key: "a".repeat(24),
    retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
    name: "BILLY bookcase",
    imageUrl: "https://www.ikea.com/images/billy.jpg",
    price: { minor: 12_900, currency: "AUD" },
    availability: "in_stock",
    assembledDimensions: { widthMm: 700, heightMm: 1_600, depthMm: 280 },
    packages: [],
    fitStatus: "fits",
    fit: {
      fits: true,
      orientation: "default",
      widthClearanceMm: 135,
      heightClearanceMm: 165,
      depthClearanceMm: 25,
      minimumClearanceMm: 25,
      confidence: "medium",
      reasons: [],
    },
    access: { status: "skipped", passes: true, basis: "unknown" },
    provenance: {
      source: "retailer-page",
      evidence: "Width 700 mm; height 1600 mm; depth 280 mm.",
      observedAt: "2026-08-17T00:00:00.000Z",
      freshness: "live",
    },
    productUrl: "https://www.ikea.com/au/en/p/billy-bookcase/",
  }],
  checkedAt: "2026-08-17T00:00:00.000Z",
  isPartial: false,
  coverageNotes: [],
};
const context = (value = token) => ({ params: Promise.resolve({ token: value }) });

describe("resolve public comparison share route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveShare.mockResolvedValue({
      payload: snapshot,
      schemaVersion: 1,
      expiresAt,
    });
  });

  it("resolves by token hash and returns a cacheable public snapshot", async () => {
    const response = await GET(new Request("https://fitment.example"), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(
      /^public, max-age=60, s-maxage=\d+, stale-while-revalidate=300$/,
    );
    await expect(response.json()).resolves.toEqual({ snapshot, expiresAt });
    expect(mocks.resolveShare).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(mocks.resolveShare.mock.calls[0]?.[0]).not.toBe(token);
  });

  it("returns the same not-found response for malformed, absent, or incompatible shares", async () => {
    const malformed = await GET(
      new Request("https://fitment.example"),
      context("not-a-token"),
    );
    expect(malformed.status).toBe(404);
    expect(mocks.resolveShare).not.toHaveBeenCalled();

    mocks.resolveShare.mockResolvedValueOnce(undefined);
    const absent = await GET(new Request("https://fitment.example"), context());
    expect(absent.status).toBe(404);

    mocks.resolveShare.mockResolvedValueOnce({
      payload: snapshot,
      schemaVersion: 99,
      expiresAt,
    });
    const incompatible = await GET(new Request("https://fitment.example"), context());
    expect(incompatible.status).toBe(404);
  });

  it("fails closed for expired shares and malformed public payloads", async () => {
    mocks.resolveShare.mockResolvedValueOnce({
      payload: snapshot,
      schemaVersion: 1,
      expiresAt: new Date(Date.now() - 1).toISOString(),
    });
    const expired = await GET(new Request("https://fitment.example"), context());
    expect(expired.status).toBe(404);

    mocks.resolveShare.mockResolvedValueOnce({
      payload: {
        ...snapshot,
        candidates: [{ ...snapshot.candidates[0], candidateId: "private-candidate-id" }],
      },
      schemaVersion: 1,
      expiresAt,
    });
    const malformed = await GET(new Request("https://fitment.example"), context());
    expect(malformed.status).toBe(404);
  });
});
