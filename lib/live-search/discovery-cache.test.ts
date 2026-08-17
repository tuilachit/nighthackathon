import { describe, expect, it } from "vitest";
import {
  DISCOVERY_CACHE_TTL_MS,
  buildDiscoveryCacheIdentity,
  isRecentDiscoveryObservation,
  normalizePrompt,
} from "./discovery-cache";

describe("buildDiscoveryCacheIdentity", () => {
  it("normalizes prompt whitespace, casing, and retailer order", () => {
    const first = buildDiscoveryCacheIdentity({
      kind: "prompt",
      text: "  Narrow   OAK shelf ",
      retailers: ["kmart-au", "ikea-au"],
    });
    const second = buildDiscoveryCacheIdentity({
      kind: "prompt",
      text: "narrow oak SHELF",
      retailers: ["ikea-au", "kmart-au"],
    });
    expect(first).toEqual(second);
  });

  it("removes only known tracking parameters from link keys", () => {
    const first = buildDiscoveryCacheIdentity({
      kind: "product-link",
      url: "https://example.com/item?variant=oak&utm_source=mail#details",
    });
    const second = buildDiscoveryCacheIdentity({
      kind: "product-link",
      url: "https://example.com/item?variant=oak",
    });
    expect(first.key).toBe(second.key);
  });
});

describe("isRecentDiscoveryObservation", () => {
  const now = Date.parse("2026-08-17T00:00:00.000Z");

  it("includes the exact 24-hour boundary", () => {
    expect(isRecentDiscoveryObservation(new Date(now - DISCOVERY_CACHE_TTL_MS).toISOString(), now)).toBe(true);
  });

  it("rejects older, future, and invalid observations", () => {
    expect(isRecentDiscoveryObservation(new Date(now - DISCOVERY_CACHE_TTL_MS - 1).toISOString(), now)).toBe(false);
    expect(isRecentDiscoveryObservation(new Date(now + 1).toISOString(), now)).toBe(false);
    expect(isRecentDiscoveryObservation("not-a-date", now)).toBe(false);
  });
});

describe("normalizePrompt", () => {
  it("collapses whitespace without changing punctuation", () => {
    expect(normalizePrompt("  White\n shelf, under $200  ")).toBe("white shelf, under $200");
  });
});
