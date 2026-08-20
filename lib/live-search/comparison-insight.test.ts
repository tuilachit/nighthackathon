import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionCandidate } from "@/lib/live-search/types";
import {
  containsOnlyKnownNumbers,
  generateComparisonInsight,
  type ComparisonInsightInput,
} from "./comparison-insight";

function candidate(key: string, name: string, priceMinor: number, clearanceMm: number): DecisionCandidate {
  return {
    key,
    workflowId: "00000000-0000-4000-8000-000000000001",
    candidateId: key,
    retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
    name,
    price: { minor: priceMinor, currency: "AUD" },
    availability: "in_stock",
    assembledDimensions: { widthMm: 600, heightMm: 1400, depthMm: 375 },
    packages: [],
    fitStatus: "fits",
    fit: {
      fits: true,
      orientation: "default",
      widthClearanceMm: clearanceMm,
      heightClearanceMm: clearanceMm,
      depthClearanceMm: clearanceMm,
      minimumClearanceMm: clearanceMm,
      confidence: "high",
      reasons: [],
    },
    access: { status: "skipped", passes: true, basis: "unknown" },
    provenance: {
      source: "retailer-page",
      evidence: "Width: 60 cm",
      observedAt: "2026-08-20T00:00:00.000Z",
      freshness: "cached",
    },
    productUrl: "https://www.ikea.com/au/en/p/x-1",
  } as DecisionCandidate;
}

const INPUT: ComparisonInsightInput = {
  measurement: { widthMm: 1600, heightMm: 1200, depthMm: 700 },
  first: candidate("a", "SKRUVBY Bookcase, black-blue", 24900, 55),
  second: candidate("b", "LAIVA Bookcase, black-brown", 3599, 21),
};

function providerResponse(text: string): Response {
  return Response.json({
    content: [{ text }],
    choices: [{ message: { content: text } }],
  });
}

describe("generateComparisonInsight", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubEnv("OPENAI_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns sanitized insight text from the provider", async () => {
    const fetchImplementation = vi.fn(async () => providerResponse(
      "SKRUVBY leaves 55 mm of clearance against LAIVA's 21 mm. LAIVA is far cheaper if budget leads.",
    ));
    const insight = await generateComparisonInsight(INPUT, fetchImplementation as unknown as typeof fetch);
    expect(insight).toContain("SKRUVBY");
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("rejects output containing a number that is not in the facts", async () => {
    const fetchImplementation = vi.fn(async () => providerResponse(
      "SKRUVBY is 97% more stable and leaves 55 mm of clearance.",
    ));
    expect(await generateComparisonInsight(INPUT, fetchImplementation as unknown as typeof fetch)).toBeUndefined();
  });

  it("rejects markdown, links, and oversized output", async () => {
    const linky = vi.fn(async () => providerResponse("See https://example.com for details."));
    expect(await generateComparisonInsight(INPUT, linky as unknown as typeof fetch)).toBeUndefined();

    const oversized = vi.fn(async () => providerResponse("word ".repeat(200)));
    expect(await generateComparisonInsight(INPUT, oversized as unknown as typeof fetch)).toBeUndefined();
  });

  it("returns undefined without any configured key and never calls the network", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchImplementation = vi.fn();
    expect(await generateComparisonInsight(INPUT, fetchImplementation as unknown as typeof fetch)).toBeUndefined();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("falls back to OpenAI when only that key is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toContain("api.openai.com");
      return providerResponse("Both fit; LAIVA is the budget pick.");
    });
    const insight = await generateComparisonInsight(INPUT, fetchImplementation as unknown as typeof fetch);
    expect(insight).toBe("Both fit; LAIVA is the budget pick.");
  });

  it("swallows provider failures into undefined", async () => {
    const failing = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await generateComparisonInsight(INPUT, failing as unknown as typeof fetch)).toBeUndefined();
  });
});

describe("containsOnlyKnownNumbers", () => {
  it("accepts numbers present in the payload and rejects invented ones", () => {
    expect(containsOnlyKnownNumbers("55 mm beats 21 mm", "clearance 55 and 21")).toBe(true);
    expect(containsOnlyKnownNumbers("about 40 mm", "clearance 55 and 21")).toBe(false);
  });
});
