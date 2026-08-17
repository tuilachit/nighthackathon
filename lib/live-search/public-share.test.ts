import { describe, expect, it } from "vitest";
import {
  PUBLIC_SHARE_TTL_MS,
  buildPublicSharedComparisonSnapshot,
  createPublicShareToken,
  hashPublicShareToken,
  isPublicShareToken,
  isPublicSharedComparisonSnapshot,
  isUnexpiredPublicShare,
  publicShareExpiresAt,
} from "./public-share";
import type { LiveCandidate, LiveSearchWorkflow } from "./types";

const workflowId = "11111111-1111-4111-8111-111111111111";

function candidate(index: number): LiveCandidate {
  return {
    id: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
    rank: index - 1,
    fitStatus: "fits",
    observation: {
      retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
      retailerProductId: `private-retailer-id-${index}`,
      name: `Bookcase ${index}`,
      category: "bookcase",
      productUrl: `https://www.ikea.com/au/en/p/bookcase-${index}`,
      imageUrl: `https://www.ikea.com/images/bookcase-${index}.jpg`,
      priceMinor: 10_000 + index,
      currency: "AUD",
      availability: "in_stock",
      assembledDimensions: { widthMm: 700, heightMm: 1_600, depthMm: 280 },
      packages: [],
      dimensionsSource: "retailer-page",
      dimensionsEvidence: "Width 700 mm; height 1600 mm; depth 280 mm.",
      observedAt: `2026-08-17T00:0${index}:00.000Z`,
      confidence: "high",
    },
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
  };
}

function workflow(): LiveSearchWorkflow & { readonly ownerId: string } {
  return {
    id: workflowId,
    ownerId: "private-owner-id",
    state: "ready_for_approval",
    queryText: "narrow bookcase",
    intent: {
      kind: "prompt",
      text: "narrow bookcase",
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
    freshness: "live",
    checkedAt: "2026-08-17T00:05:00.000Z",
    candidates: [candidate(1), candidate(2), candidate(3), candidate(4)],
    isPartial: false,
    coverageNotes: [],
    approvedCandidateId: candidate(1).id,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:05:00.000Z",
  };
}

describe("public share tokens", () => {
  it("generates an opaque token and stores only its deterministic hash", () => {
    const share = createPublicShareToken();
    expect(isPublicShareToken(share.token)).toBe(true);
    expect(share.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(share.tokenHash).toBe(hashPublicShareToken(share.token));
    expect(share.tokenHash).not.toContain(share.token);
  });

  it("rejects malformed tokens", () => {
    expect(isPublicShareToken("short")).toBe(false);
    expect(() => hashPublicShareToken("short")).toThrow();
  });
});

describe("public share expiry", () => {
  it("expires after exactly 30 days", () => {
    const now = new Date("2026-08-17T00:00:00Z");
    const expiresAt = publicShareExpiresAt(now);
    expect(Date.parse(expiresAt) - now.getTime()).toBe(PUBLIC_SHARE_TTL_MS);
    expect(isUnexpiredPublicShare(expiresAt, Date.parse("2026-09-15T23:59:59.999Z"))).toBe(true);
    expect(isUnexpiredPublicShare(expiresAt, Date.parse(expiresAt))).toBe(false);
  });
});

describe("public comparison snapshots", () => {
  it.each([1, 2, 3])(
    "builds a valid %i-candidate snapshot without leaking private identifiers",
    (candidateCount) => {
      const source = workflow();
      const selectedIds = source.candidates.slice(0, candidateCount).map((entry) => entry.id);

      const snapshot = buildPublicSharedComparisonSnapshot(source, selectedIds);
      const serialized = JSON.stringify(snapshot);

      expect(snapshot.candidates).toHaveLength(candidateCount);
      expect(isPublicSharedComparisonSnapshot(snapshot)).toBe(true);
      expect(serialized).not.toContain(source.id);
      expect(serialized).not.toContain(source.ownerId);
      for (const entry of source.candidates) {
        expect(serialized).not.toContain(entry.id);
        expect(serialized).not.toContain(entry.observation.retailerProductId);
      }
      expect(serialized).not.toMatch(/"(?:workflowId|candidateId|ownerId)"/);
    },
  );

  it("rejects empty, oversized, and out-of-workflow selections", () => {
    const source = workflow();

    expect(() => buildPublicSharedComparisonSnapshot(source, [])).toThrow(
      "one to three candidates",
    );
    expect(() => buildPublicSharedComparisonSnapshot(
      source,
      source.candidates.map((entry) => entry.id),
    )).toThrow("one to three candidates");
    expect(() => buildPublicSharedComparisonSnapshot(
      source,
      ["99999999-9999-4999-8999-999999999999"],
    )).toThrow("not found");
  });

  it("fails closed for malformed payloads and private identifiers at any depth", () => {
    const valid = buildPublicSharedComparisonSnapshot(workflow(), [candidate(1).id]);
    const malformed: unknown[] = [
      null,
      {},
      { ...valid, candidates: [] },
      { ...valid, candidates: [valid.candidates[0], valid.candidates[0], valid.candidates[0], valid.candidates[0]] },
      { ...valid, measurement: { ...valid.measurement, widthMm: 0 } },
      { ...valid, checkedAt: "not-a-date" },
      { ...valid, intent: { kind: "prompt", text: "bookcase", retailers: ["unknown-au"] } },
      { ...valid, workflowId },
      {
        ...valid,
        candidates: [{ ...valid.candidates[0], provenance: { ...valid.candidates[0]?.provenance, ownerId: "private" } }],
      },
      {
        ...valid,
        candidates: [{ ...valid.candidates[0], candidateId: candidate(1).id }],
      },
    ];

    for (const payload of malformed) {
      expect(isPublicSharedComparisonSnapshot(payload)).toBe(false);
    }
  });
});
