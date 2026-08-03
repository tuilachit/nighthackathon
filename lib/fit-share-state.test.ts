import { describe, expect, it } from "vitest";
import { DEMO_SPACE_MEASUREMENT } from "./fit-config";
import {
  buildFitShareUrl,
  parseFitShareParams,
} from "./fit-share-state";

describe("fit share state", () => {
  it("round-trips measurement, query, and comparison IDs", () => {
    const url = buildFitShareUrl("https://tryfitment.com", {
      measurement: DEMO_SPACE_MEASUREMENT,
      query: "white cube bookcase under $50",
      comparedProductIds: ["ikea-one", "target-two"],
    });
    const parsedUrl = new URL(url);

    expect(parseFitShareParams(parsedUrl.searchParams)).toEqual({
      status: "valid",
      state: {
        measurement: DEMO_SPACE_MEASUREMENT,
        query: "white cube bookcase under $50",
        comparedProductIds: ["ikea-one", "target-two"],
      },
    });
  });

  it("distinguishes ordinary visits from malformed shared state", () => {
    expect(parseFitShareParams(new URLSearchParams())).toEqual({
      status: "absent",
    });
    expect(
      parseFitShareParams(
        new URLSearchParams(
          "w=0&h=1800&d=350&a=820&u=25&source=manual&q=shelf&compare=ikea-one",
        ),
      ),
    ).toEqual({ status: "invalid" });
  });

  it("rejects missing, duplicate, excessive, or unsafe comparison IDs", () => {
    const base = "w=900&h=1800&d=350&a=820&u=25&source=manual&q=shelf";
    for (const compare of [
      "",
      "same,same",
      "one,two,three,four",
      "../../unsafe",
    ]) {
      expect(
        parseFitShareParams(new URLSearchParams(`${base}&compare=${compare}`)),
      ).toEqual({ status: "invalid" });
    }
  });

  it("supports measurements without an access opening", () => {
    const url = buildFitShareUrl("https://tryfitment.com", {
      measurement: {
        ...DEMO_SPACE_MEASUREMENT,
        accessWidthMm: undefined,
        source: "manual",
      },
      query: "bookcase",
      comparedProductIds: ["ikea-one"],
    });

    const result = parseFitShareParams(new URL(url).searchParams);
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.state.measurement).not.toHaveProperty("accessWidthMm");
    }
  });
});
