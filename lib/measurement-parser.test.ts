import { describe, expect, it } from "vitest";
import { parseMeasurementInput } from "./measurement-parser";

describe("parseMeasurementInput", () => {
  it.each([
    ["width 90 cm", { width: 900 }, ["height", "depth"]],
    ["W900mm", { width: 900 }, ["height", "depth"]],
    ["door 82cm", { access: 820 }, ["width", "height", "depth"]],
  ] as const)("parses the labelled partial input %s", (input, values, missing) => {
    expect(parseMeasurementInput(input)).toEqual({
      status: "incomplete",
      values,
      missing,
    });
  });

  it("uses the selected unit for a value without a unit", () => {
    expect(parseMeasurementInput("access 820", "mm")).toEqual({
      status: "incomplete",
      values: { access: 820 },
      missing: ["width", "height", "depth"],
    });
  });

  it("uses centimetres as the default selected unit", () => {
    expect(parseMeasurementInput("width 90, height 180, depth 35")).toEqual({
      status: "complete",
      detectedUnit: "cm",
      measurement: {
        widthMm: 900,
        heightMm: 1800,
        depthMm: 350,
        uncertaintyMm: 25,
        source: "manual",
      },
    });
  });

  it("maps an ordered triple to width by height by depth", () => {
    expect(parseMeasurementInput("900 × 1800 × 350 mm")).toEqual({
      status: "complete",
      detectedUnit: "mm",
      measurement: {
        widthMm: 900,
        heightMm: 1800,
        depthMm: 350,
        uncertaintyMm: 25,
        source: "manual",
      },
    });
  });

  it("applies a trailing unit to the whole ordered triple", () => {
    expect(parseMeasurementInput("0.9 x 1.8 x 0.35 m")).toMatchObject({
      status: "complete",
      detectedUnit: "m",
      measurement: {
        widthMm: 900,
        heightMm: 1800,
        depthMm: 350,
      },
    });
  });

  it("accepts mixed explicit units and rounds to integer millimetres", () => {
    expect(
      parseMeasurementInput(
        "width 35.4in, height 1.8m, depth 35cm, doorway 2.7ft",
      ),
    ).toEqual({
      status: "complete",
      detectedUnit: "cm",
      measurement: {
        widthMm: 899,
        heightMm: 1800,
        depthMm: 350,
        accessWidthMm: 823,
        uncertaintyMm: 25,
        source: "manual",
      },
    });
  });

  it("accepts labels after values and lets bare values use the selected unit", () => {
    expect(
      parseMeasurementInput(
        "90 cm wide, 180 high, 35 deep, doorway 82",
        "cm",
      ),
    ).toEqual({
      status: "complete",
      detectedUnit: "cm",
      measurement: {
        widthMm: 900,
        heightMm: 1800,
        depthMm: 350,
        accessWidthMm: 820,
        uncertaintyMm: 25,
        source: "manual",
      },
    });
  });

  it("does not treat an unlabelled fourth value as doorway access", () => {
    expect(parseMeasurementInput("900 × 1800 × 350 × 820 mm", "mm")).toEqual({
      status: "invalid",
      message: "Label the doorway value explicitly; a fourth unlabelled number is not treated as access.",
    });
  });

  it("allows an identical duplicate and rejects a conflicting duplicate", () => {
    expect(
      parseMeasurementInput(
        "width 90cm, width 900mm, height 180cm, depth 35cm",
      ),
    ).toMatchObject({ status: "complete" });
    expect(
      parseMeasurementInput(
        "width 90cm, width 91cm, height 180cm, depth 35cm",
      ),
    ).toEqual({
      status: "invalid",
      message: "Conflicting Width values were provided.",
    });
  });

  it("reports missing required fields in width-height-depth order", () => {
    expect(parseMeasurementInput("depth 35cm")).toEqual({
      status: "incomplete",
      values: { depth: 350 },
      missing: ["width", "height"],
    });
  });

  it("accepts inclusive room and doorway boundaries", () => {
    expect(
      parseMeasurementInput(
        "width 100mm, height 10000mm, depth 100mm, access 300mm",
      ),
    ).toMatchObject({ status: "complete" });
    expect(
      parseMeasurementInput(
        "width 10000mm, height 100mm, depth 10000mm, access 3000mm",
      ),
    ).toMatchObject({ status: "complete" });
  });

  it.each([
    ["width 99mm, height 1800mm, depth 350mm", "Width must be between 100 and 10,000 mm."],
    ["width 10001mm, height 1800mm, depth 350mm", "Width must be between 100 and 10,000 mm."],
    ["width 900mm, height 1800mm, depth 350mm, access 299mm", "Doorway must be between 300 and 3,000 mm."],
    ["width 900mm, height 1800mm, depth 350mm, access 3001mm", "Doorway must be between 300 and 3,000 mm."],
  ])("rejects values outside their bounds", (input, message) => {
    expect(parseMeasurementInput(input)).toEqual({ status: "invalid", message });
  });

  it("rejects zero and negative measurements", () => {
    expect(parseMeasurementInput("width 0mm, height 1800mm, depth 350mm")).toMatchObject({
      status: "invalid",
      message: "Width must be between 100 and 10,000 mm.",
    });
    expect(parseMeasurementInput("width -900mm, height 1800mm, depth 350mm")).toMatchObject({
      status: "invalid",
      message: "Width must be between 100 and 10,000 mm.",
    });
  });

  it("rejects unsupported units and unlabelled loose values", () => {
    expect(parseMeasurementInput("width 1yd, height 180cm, depth 35cm")).toEqual({
      status: "invalid",
      message: "Unsupported unit “yd”. Use mm, cm, m, in or ft.",
    });
    expect(parseMeasurementInput("90, 180, 35", "cm")).toEqual({
      status: "invalid",
      message: "Label each value as width, height, depth or doorway.",
    });
  });

  it("distinguishes an empty draft from unparseable text", () => {
    expect(parseMeasurementInput("  ")).toEqual({
      status: "incomplete",
      values: {},
      missing: ["width", "height", "depth"],
    });
    expect(parseMeasurementInput("roughly wardrobe sized")).toEqual({
      status: "invalid",
      message: "Enter measurements such as 90 cm wide, 180 high and 35 deep.",
    });
  });

  it("rejects an unsupported selected unit at runtime", () => {
    expect(parseMeasurementInput("900 x 1800 x 350", "yd" as "cm")).toEqual({
      status: "invalid",
      message: "Choose a supported default unit.",
    });
  });
});
