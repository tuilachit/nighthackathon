import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  resolveShare: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/live-search/repository", () => ({
  resolveComparisonShare: mocks.resolveShare,
}));
vi.mock("@/components/fit/PublicSharedComparison", () => ({
  PublicSharedComparison: () => null,
}));

import SharedComparisonPage from "./page";

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
  intent: { kind: "prompt", text: "narrow bookcase", retailers: ["ikea-au"] },
  candidates: [{
    key: "a".repeat(24),
    retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
    name: "BILLY bookcase",
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

const pageProps = (value = token) => ({ params: Promise.resolve({ token: value }) });

describe("public shared comparison page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveShare.mockResolvedValue({ payload: snapshot, schemaVersion: 1, expiresAt });
  });

  it("renders a validated, unexpired public snapshot", async () => {
    const element = await SharedComparisonPage(pageProps());

    expect(element.props.snapshot).toEqual(snapshot);
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.resolveShare).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/));
  });

  it.each([
    ["expired", { payload: snapshot, schemaVersion: 1, expiresAt: "2026-01-01T00:00:00.000Z" }],
    ["incompatible schema", { payload: snapshot, schemaVersion: 2, expiresAt }],
    ["malformed payload", { payload: { ...snapshot, ownerId: "private" }, schemaVersion: 1, expiresAt }],
  ])("fails closed for an %s share", async (_label, share) => {
    mocks.resolveShare.mockResolvedValueOnce(share);

    await expect(SharedComparisonPage(pageProps())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("rejects malformed tokens before repository access", async () => {
    await expect(SharedComparisonPage(pageProps("not-a-token"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mocks.resolveShare).not.toHaveBeenCalled();
  });
});
