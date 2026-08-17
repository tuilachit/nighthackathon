import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics/next", () => ({ Analytics: () => null }));

import { stripSensitiveLocation } from "./AnalyticsPrivacy";

describe("stripSensitiveLocation", () => {
  it("removes query parameters and fragments from page analytics", () => {
    expect(stripSensitiveLocation({
      type: "pageview",
      url: "https://tryfitment.vercel.app/fit?job=secret&w=900#private",
    })).toEqual({ type: "pageview", url: "https://tryfitment.vercel.app/fit" });
  });

  it("redacts opaque public-share tokens from the pathname", () => {
    expect(stripSensitiveLocation({
      type: "pageview",
      url: `https://tryfitment.vercel.app/fit/share/${"a".repeat(43)}?source=qr`,
    })).toEqual({
      type: "pageview",
      url: "https://tryfitment.vercel.app/fit/share/[token]",
    });
  });
});
