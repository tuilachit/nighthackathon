import { describe, expect, it } from "vitest";
import { hashJourneyToken, validateProductEvent } from "./product-events";

const journeyToken = "uW0yGmZsRj6k7F4TQ5n2xA";

describe("validateProductEvent", () => {
  it("accepts an allowlisted privacy-safe event", () => {
    expect(validateProductEvent({
      name: "results_presented",
      journeyToken,
      properties: {
        coverage: "partial",
        fits_bucket: "1_3",
        access_bucket: "0",
        near_bucket: "4_plus",
        latency_bucket: "10_30s",
      },
    }).name).toBe("results_presented");
  });

  it.each(["query", "measurement", "roomName", "productId", "workflowId", "url", "error"])(
    "rejects forbidden/unrecognized property %s",
    (key) => {
      expect(() => validateProductEvent({
        name: "search_submitted",
        journeyToken,
        properties: { intent: "prompt", retailer_count: 2, cache_policy: "prefer_recent", [key]: "secret" },
      })).toThrow(`Property ${key} is not allowed`);
    },
  );

  it("rejects arbitrary values and raw token formats", () => {
    expect(() => validateProductEvent({
      name: "retailer_outbound",
      journeyToken: "short",
      properties: { retailer: "some-shop", surface: "card", tier: "fits" },
    })).toThrow();
  });
});

describe("hashJourneyToken", () => {
  it("is stable within a UTC day and rotates across days", () => {
    const first = hashJourneyToken(journeyToken, "a".repeat(32), new Date("2026-08-17T01:00:00Z"));
    const sameDay = hashJourneyToken(journeyToken, "a".repeat(32), new Date("2026-08-17T23:00:00Z"));
    const nextDay = hashJourneyToken(journeyToken, "a".repeat(32), new Date("2026-08-18T00:00:00Z"));
    expect(first).toBe(sameDay);
    expect(nextDay).not.toBe(first);
  });
});
