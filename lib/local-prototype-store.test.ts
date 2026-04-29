import { describe, expect, it, vi } from "vitest";
import { analyzePromptToPrototype } from "./analyzer";
import { loadPrototypeFromLocalStorage, savePrototypeToLocalStorage } from "./local-prototype-store";

describe("local prototype store", () => {
  it("saves and loads a prototype", () => {
    const spec = analyzePromptToPrototype("smart water bottle");

    const status = savePrototypeToLocalStorage(spec);
    const loaded = loadPrototypeFromLocalStorage(spec.id);

    expect(status.kind).toBe("saved");
    expect(loaded?.id).toBe(spec.id);
  });

  it("ignores malformed JSON", () => {
    window.localStorage.setItem("reality-mvp:prototype:bad", "{bad json");

    expect(loadPrototypeFromLocalStorage("bad")).toBeUndefined();
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
