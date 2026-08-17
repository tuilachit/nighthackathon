import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureProductEvent, getJourneyToken, privacySignalEnabled } from "./product-events-client";

describe("product events client", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("creates one stable opaque token per browser session", () => {
    const first = getJourneyToken(window.sessionStorage, window.crypto);
    const second = getJourneyToken(window.sessionStorage, window.crypto);
    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it("degrades when storage writes fail", () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error("blocked"); },
    } as unknown as Storage;
    expect(getJourneyToken(storage, window.crypto)).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it("honours Do Not Track and sends an allowlisted event otherwise", async () => {
    const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    const original = Object.getOwnPropertyDescriptor(Navigator.prototype, "doNotTrack");
    Object.defineProperty(Navigator.prototype, "doNotTrack", { configurable: true, get: () => "1" });
    expect(privacySignalEnabled(window.navigator)).toBe(true);
    captureProductEvent("cache_hit", { age_bucket: "under_1h" });
    expect(fetchMock).not.toHaveBeenCalled();
    if (original === undefined) {
      Reflect.deleteProperty(Navigator.prototype, "doNotTrack");
    } else {
      Object.defineProperty(Navigator.prototype, "doNotTrack", original);
    }
    captureProductEvent("cache_hit", { age_bucket: "under_1h" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/product-events",
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
  });
});
