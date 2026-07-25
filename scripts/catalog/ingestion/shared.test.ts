import { describe, expect, it } from "vitest";
import {
  dimensionsFromInches,
  inferCategory,
  parseInches,
} from "./shared";

describe("catalog ingestion units", () => {
  it("parses decimal, fraction, and mixed-fraction inches", () => {
    expect(parseInches("9.5")).toBe(9.5);
    expect(parseInches('7 7/8"')).toBe(7.875);
    expect(parseInches("3/4")).toBe(0.75);
    expect(parseInches("1/0")).toBeUndefined();
  });

  it("normalizes dimensions to whole millimetres", () => {
    expect(dimensionsFromInches("24 3/8", "65", "9 1/2")).toEqual({
      widthMm: 619,
      heightMm: 1651,
      depthMm: 241,
    });
  });

  it("keeps category inference deterministic", () => {
    expect(inferCategory("BILLY bookcase")).toBe("bookcase");
    expect(inferCategory("Wall shelving unit")).toBe("shelving-unit");
  });
});
