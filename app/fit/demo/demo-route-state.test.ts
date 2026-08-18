import { describe, expect, it } from "vitest";
import {
  CACHED_FURNITURE_QUERIES,
  DEMO_SPACE_MEASUREMENT,
} from "@/lib/fit-config";
import {
  buildDemoComparisonHref,
  buildDemoResultsHref,
  parseDemoResultsRouteState,
} from "./demo-route-state";

describe("demo route state", () => {
  it("defaults malformed or absent query state safely", () => {
    expect(parseDemoResultsRouteState({
      tier: "unknown",
      page: "0",
      q: " ",
      compare: "same,same",
    })).toEqual({
      selectedTier: "fits",
      pageIndex: 0,
      queryText: CACHED_FURNITURE_QUERIES[0],
      comparedProductIds: [],
      measurement: DEMO_SPACE_MEASUREMENT,
    });
  });

  it("parses controlled tier, one-based page, query, and comparison IDs", () => {
    expect(parseDemoResultsRouteState({
      tier: ["access_issue", "fits"],
      page: "3",
      q: " white shelf ",
      compare: "ikea-one,target-two",
    })).toEqual({
      selectedTier: "access_issue",
      pageIndex: 2,
      queryText: "white shelf",
      comparedProductIds: ["ikea-one", "target-two"],
      measurement: DEMO_SPACE_MEASUREMENT,
    });
  });

  it("builds canonical result and dedicated comparison URLs", () => {
    const state = parseDemoResultsRouteState({
      tier: "near_miss",
      page: "2",
      q: "black bookcase under $50",
      compare: "ikea-one",
    });

    expect(buildDemoResultsHref(state)).toBe(
      "/fit/demo/results?tier=near_miss&q=black+bookcase+under+%2450&page=2&compare=ikea-one",
    );
    expect(buildDemoComparisonHref(state, ["ikea-one", "target-two"])).toBe(
      "/fit/demo/compare?tier=near_miss&q=black+bookcase+under+%2450&page=2&compare=ikea-one%2Ctarget-two",
    );
    expect(() => buildDemoComparisonHref(state, ["same", "same"])).toThrow(TypeError);
  });

  it("keeps a valid legacy shared measurement readable across demo navigation", () => {
    const state = parseDemoResultsRouteState({
      tier: "fits",
      w: "880",
      h: "1750",
      d: "330",
      a: "760",
      u: "25",
      source: "manual",
      q: "narrow shelf",
      compare: "ikea-one,target-two,wayfair-three",
    });

    expect(state.measurement).toEqual({
      widthMm: 880,
      heightMm: 1750,
      depthMm: 330,
      accessWidthMm: 760,
      uncertaintyMm: 25,
      source: "manual",
    });
    expect(state.comparedProductIds).toEqual(["ikea-one", "target-two"]);
    expect(buildDemoResultsHref(state)).toBe(
      "/fit/demo/results?tier=fits&w=880&h=1750&d=330&a=760&u=25&source=manual&q=narrow+shelf&compare=ikea-one%2Ctarget-two",
    );
  });
});
