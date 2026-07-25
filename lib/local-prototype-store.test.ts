import { describe, expect, it, vi } from "vitest";
import { analyzePromptToPrototype } from "./analyzer";
import {
  loadLatestPrototypeFromLocalStorage,
  loadPrototypeForRouteFromLocalStorage,
  loadPrototypeFromLocalStorage,
  savePrototypeToLocalStorage,
} from "./local-prototype-store";
import { applyGeneratedModelResult } from "./model-generation";

describe("local prototype store", () => {
  it("saves and loads a prototype", () => {
    const spec = analyzePromptToPrototype("smart water bottle");

    const status = savePrototypeToLocalStorage(spec);
    const loaded = loadPrototypeFromLocalStorage(spec.id);

    expect(status.kind).toBe("saved");
    expect(loaded?.id).toBe(spec.id);
  });

  it("tracks the latest generated prototype for route handoff", () => {
    const placeholder = analyzePromptToPrototype("");
    const generated = applyGeneratedModelResult(analyzePromptToPrototype("wearable sensor with visible vents"), {
      id: "generated-model",
      mode: "text-to-3d",
      status: "succeeded",
      glbUrl: "https://assets.meshy.ai/users/abc/tasks/123/output/model.glb?Expires=4931020800&Signature=test",
      refinedMeshyPrompt: "wearable sensor with visible vents",
      fallbackModelPath: "/models/bottle.glb",
    });

    savePrototypeToLocalStorage(placeholder);
    savePrototypeToLocalStorage(generated);

    expect(loadLatestPrototypeFromLocalStorage()?.id).toBe(generated.id);
    expect(loadPrototypeForRouteFromLocalStorage("reality-mvp-prototype")?.id).toBe(generated.id);
  });

  it("ignores malformed JSON", () => {
    window.localStorage.setItem("reality-mvp:prototype:bad", "{bad json");

    expect(loadPrototypeFromLocalStorage("bad")).toBeUndefined();
  });

  it("ignores older prototype shapes without statuses", () => {
    window.localStorage.setItem(
      "reality-mvp:prototype:legacy",
      JSON.stringify({
        id: "legacy",
        name: "Legacy Prototype",
        prompt: "old prompt",
        refined3DPrompt: "old prompt",
        model: { glbPath: "/models/bottle.glb" },
        meshy: { state: "pending" },
      }),
    );

    expect(loadPrototypeFromLocalStorage("legacy")).toBeUndefined();
  });

  it("returns failed when storage writes throw", () => {
    const spec = analyzePromptToPrototype("smart water bottle");
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(savePrototypeToLocalStorage(spec).kind).toBe("failed");
    spy.mockRestore();
  });
});
