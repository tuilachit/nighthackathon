import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzePromptToPrototype } from "@/lib/analyzer";
import {
  LOCAL_PROTOTYPE_UPDATED_EVENT,
  savePrototypeToLocalStorage,
} from "@/lib/local-prototype-store";
import { useActivePrototype } from "./useActivePrototype";

describe("useActivePrototype", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resyncs a generic route to the latest locally generated prototype", () => {
    const placeholder = analyzePromptToPrototype("");
    const generated = analyzePromptToPrototype("wearable sensor with visible vents");
    const { result } = renderHook(() => useActivePrototype(placeholder));

    expect(result.current).toBe(placeholder);

    act(() => {
      savePrototypeToLocalStorage(generated);
    });

    expect(result.current).toEqual(generated);
  });

  it("adopts a refreshed route prototype when no local override exists", () => {
    const initialPrototype = analyzePromptToPrototype("desk lamp");
    const refreshedPrototype = {
      ...initialPrototype,
      name: "Refreshed Desk Lamp",
    };
    const { result, rerender } = renderHook(
      ({ prototype }) => useActivePrototype(prototype),
      { initialProps: { prototype: initialPrototype } },
    );

    rerender({ prototype: refreshedPrototype });

    expect(result.current).toBe(refreshedPrototype);
  });

  it("falls back to the route prototype when local storage is cleared", () => {
    const routePrototype = analyzePromptToPrototype("");
    const generatedPrototype = analyzePromptToPrototype("wearable sensor");
    const { result } = renderHook(() => useActivePrototype(routePrototype));

    act(() => {
      savePrototypeToLocalStorage(generatedPrototype);
    });
    expect(result.current).toEqual(generatedPrototype);

    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage"));
    });

    expect(result.current).toBe(routePrototype);
  });

  it("removes the custom and storage event listeners on cleanup", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const prototype = analyzePromptToPrototype("");
    const { unmount } = renderHook(() => useActivePrototype(prototype));
    const prototypeUpdateListener = addEventListener.mock.calls.find(
      ([eventName]) => eventName === LOCAL_PROTOTYPE_UPDATED_EVENT,
    )?.[1];
    const storageListener = addEventListener.mock.calls.find(
      ([eventName]) => eventName === "storage",
    )?.[1];

    expect(prototypeUpdateListener).toBeDefined();
    expect(storageListener).toBeDefined();

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith(
      LOCAL_PROTOTYPE_UPDATED_EVENT,
      prototypeUpdateListener,
    );
    expect(removeEventListener).toHaveBeenCalledWith("storage", storageListener);
  });
});
