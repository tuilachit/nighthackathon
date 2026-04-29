import { describe, expect, it } from "vitest";
import { categoryUsesValidatedAsset, getFallbackModel } from "./assets";

describe("assets", () => {
  it("keeps the bottle path as the validated fallback", () => {
    const model = getFallbackModel("bottle");

    expect(model.glbPath).toBe("/models/bottle.glb");
    expect(model.category).toBe("bottle");
    expect(categoryUsesValidatedAsset("bottle")).toBe(true);
  });

  it("maps unsupported categories to the bottle model", () => {
    expect(getFallbackModel("lamp").category).toBe("bottle");
    expect(getFallbackModel("unknown").category).toBe("bottle");
  });
});
