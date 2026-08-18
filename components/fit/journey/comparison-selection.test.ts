import { describe, expect, it } from "vitest";
import { selectDefaultCrossRetailerComparison } from "./comparison-selection";
import { candidateFixture } from "./test-support";

describe("selectDefaultCrossRetailerComparison", () => {
  it("handles fewer than two candidates", () => {
    const only = candidateFixture();

    expect(selectDefaultCrossRetailerComparison([])).toEqual([]);
    expect(selectDefaultCrossRetailerComparison([only])).toEqual([only]);
  });

  it("keeps the top-ranked product and prefers the next retailer", () => {
    const first = candidateFixture({ key: "ikea-1", name: "First IKEA" });
    const second = candidateFixture({ key: "ikea-2", name: "Second IKEA" });
    const crossRetailer = candidateFixture({
      key: "kmart-1",
      name: "First Kmart",
      retailer: "kmart",
    });
    const ranked = [first, second, crossRetailer] as const;

    expect(selectDefaultCrossRetailerComparison(ranked)).toEqual([
      first,
      crossRetailer,
    ]);
    expect(ranked).toEqual([first, second, crossRetailer]);
  });

  it("falls back to the first two ranked products when only one retailer exists", () => {
    const first = candidateFixture({ key: "ikea-1" });
    const second = candidateFixture({ key: "ikea-2" });

    expect(selectDefaultCrossRetailerComparison([first, second])).toEqual([
      first,
      second,
    ]);
  });
});
