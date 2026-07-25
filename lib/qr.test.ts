import { describe, expect, it } from "vitest";
import { createDeterministicQrPattern } from "./qr";

describe("createDeterministicQrPattern", () => {
  it("creates a stable visual handoff pattern", () => {
    const first = createDeterministicQrPattern("https://example.com/ar/smart-hydration-bottle");
    const second = createDeterministicQrPattern("https://example.com/ar/smart-hydration-bottle");

    expect(first).toEqual(second);
    expect(first.size).toBe(29);
    expect(first.modules.length).toBeGreaterThan(100);
  });
});
