import { afterEach, describe, expect, it, vi } from "vitest";
import { isImmersiveArSupported } from "./webxr-support";

describe("isImmersiveArSupported", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "xr");
  });

  it("is false when navigator.xr does not exist", async () => {
    await expect(isImmersiveArSupported()).resolves.toBe(false);
  });

  it("is true when the browser reports immersive-ar support", async () => {
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: { isSessionSupported: vi.fn().mockResolvedValue(true) },
    });

    await expect(isImmersiveArSupported()).resolves.toBe(true);
  });

  it("is false when isSessionSupported rejects", async () => {
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: { isSessionSupported: vi.fn().mockRejectedValue(new Error("no xr hardware")) },
    });

    await expect(isImmersiveArSupported()).resolves.toBe(false);
  });
});
