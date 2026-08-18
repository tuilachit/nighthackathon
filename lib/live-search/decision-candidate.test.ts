import { describe, expect, it } from "vitest";
import type { LiveCandidate, LiveSearchWorkflow } from "./types";
import { toDecisionCandidate } from "./decision-candidate";

const candidate = {
  id: "00000000-0000-4000-8000-000000000002",
  rank: 1,
  fitStatus: "fits",
  observation: {
    retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
    retailerProductId: "item-1",
    name: "Narrow shelf",
    category: "shelving",
    productUrl: "https://www.ikea.com/au/en/p/item-1",
    imageUrl: "https://www.ikea.com/au/en/images/item-1.jpg",
    priceMinor: 12_900,
    currency: "AUD",
    availability: "in_stock",
    assembledDimensions: { widthMm: 600, heightMm: 1_600, depthMm: 280 },
    packages: [],
    dimensionsSource: "retailer-page",
    dimensionsEvidence: "Width 60 cm; height 160 cm; depth 28 cm.",
    observedAt: "2026-08-18T00:00:00.000Z",
    confidence: "high",
  },
  fit: {
    fits: true,
    orientation: "default",
    widthClearanceMm: 235,
    heightClearanceMm: 165,
    depthClearanceMm: 5,
    minimumClearanceMm: 5,
    confidence: "high",
    reasons: [],
  },
  access: { status: "skipped", passes: true, basis: "unknown" },
} satisfies LiveCandidate;

const workflow = {
  id: "00000000-0000-4000-8000-000000000001",
  state: "ready_for_approval",
  queryText: "narrow shelf",
  measurement: {
    widthMm: 900,
    heightMm: 1_800,
    depthMm: 350,
    uncertaintyMm: 25,
    source: "manual",
  },
  retailers: ["ikea-au"],
  freshness: "cached",
  candidates: [candidate],
  isPartial: false,
  coverageNotes: [],
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
} satisfies LiveSearchWorkflow;

describe("toDecisionCandidate", () => {
  it("preserves decision facts and owner-scoped identifiers", () => {
    const decision = toDecisionCandidate(workflow, candidate);
    expect(decision).toMatchObject({
      key: candidate.id,
      workflowId: workflow.id,
      candidateId: candidate.id,
      retailer: candidate.observation.retailer,
      price: { minor: 12_900, currency: "AUD" },
      provenance: { freshness: "cached" },
      fitStatus: "fits",
    });
  });
});
