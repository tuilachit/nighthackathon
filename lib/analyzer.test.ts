import { describe, expect, it } from "vitest";
import { analyzePromptToPrototype, classifyProductCategory, DEFAULT_PROMPT } from "./analyzer";

describe("analyzer", () => {
  it("keeps the create prompt empty and seeds a generic prototype", () => {
    const spec = analyzePromptToPrototype(DEFAULT_PROMPT);

    expect(DEFAULT_PROMPT).toBe("");
    expect(spec.id).toBe("reality-mvp-prototype");
    expect(spec.category).toBe("unknown");
    expect(spec.prompt).toBe("A product concept captured in Reality MVP.");
  });

  it("classifies supported product categories", () => {
    expect(classifyProductCategory("desk lamp for focus")).toBe("lamp");
    expect(classifyProductCategory("chair with posture sensors")).toBe("chair");
    expect(classifyProductCategory("storage box for tools")).toBe("box");
    expect(classifyProductCategory("connected wearable device")).toBe("device");
  });

  it("falls back when a prompt has no known category", () => {
    const spec = analyzePromptToPrototype("a strange product for artists");

    expect(spec.category).toBe("unknown");
    expect(spec.model.category).toBe("bottle");
    expect(spec.statuses.asset.kind).toBe("fallback");
  });
});
