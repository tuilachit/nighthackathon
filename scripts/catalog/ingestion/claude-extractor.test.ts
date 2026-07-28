import { describe, expect, it } from "vitest";
import { buildExtractionExcerpt } from "./claude-extractor";

describe("Claude extraction excerpt", () => {
  it("preserves dimension evidence near the end of a long rendered page", () => {
    const pageText = [
      "A".repeat(20_000),
      "Overall Dimensions: Width 31.5 in, Height 70 in, Depth 11.8 in",
      "B".repeat(30_000),
    ].join("\n");

    const excerpt = buildExtractionExcerpt(pageText);

    expect(excerpt.length).toBeLessThanOrEqual(35_000);
    expect(excerpt).toContain(
      "Overall Dimensions: Width 31.5 in, Height 70 in, Depth 11.8 in",
    );
  });

  it("returns short page text unchanged", () => {
    const pageText = "Width 20 in; Height 40 in; Depth 10 in";

    expect(buildExtractionExcerpt(pageText)).toBe(pageText);
  });
});
