import { describe, expect, it } from "vitest";
import { parseSpaceMeasurementSearchParams, toSpaceMeasurementSearchParams } from "./space-measurement-params";
import type { SpaceMeasurement } from "./measurement-geometry";

describe("space measurement search params", () => {
  it("round-trips a measurement through query params", () => {
    const space: SpaceMeasurement = { widthMm: 812, depthMm: 405, heightMm: 900, uncertaintyMm: 25, source: "webxr" };

    const params = toSpaceMeasurementSearchParams(space);
    expect(parseSpaceMeasurementSearchParams(params)).toEqual(space);
  });

  it("rejects missing params", () => {
    expect(parseSpaceMeasurementSearchParams(new URLSearchParams())).toBeUndefined();
  });

  it("rejects a zero or negative dimension", () => {
    const params = new URLSearchParams({ widthMm: "0", depthMm: "405", heightMm: "900", uncertaintyMm: "25", source: "manual" });
    expect(parseSpaceMeasurementSearchParams(params)).toBeUndefined();
  });

  it("rejects an unknown source value", () => {
    const params = new URLSearchParams({ widthMm: "812", depthMm: "405", heightMm: "900", uncertaintyMm: "25", source: "made-up" });
    expect(parseSpaceMeasurementSearchParams(params)).toBeUndefined();
  });

  it("accepts zero uncertainty", () => {
    const params = new URLSearchParams({ widthMm: "812", depthMm: "405", heightMm: "900", uncertaintyMm: "0", source: "demo" });
    expect(parseSpaceMeasurementSearchParams(params)).toEqual({
      widthMm: 812,
      depthMm: 405,
      heightMm: 900,
      uncertaintyMm: 0,
      source: "demo",
    });
  });
});
