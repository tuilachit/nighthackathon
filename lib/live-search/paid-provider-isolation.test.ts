import { describe, expect, it } from "vitest";

/**
 * Proves the global guard in vitest.setup.ts is active. If a future change
 * removes or weakens it, this test fails before any real provider is charged.
 */
describe("paid-provider isolation", () => {
  it.each([
    "https://api.firecrawl.dev/v2/search",
    "https://api.openai.com/v1/responses",
    "https://api.browser-use.com/api/v3/sessions",
    "https://api.meshy.ai/openapi/v1/image-to-3d",
  ])("blocks a real request to %s", async (url) => {
    await expect(fetch(url, { method: "POST" })).rejects.toThrow(/paid provider/);
  });

  it("blocks subdomains of a paid provider host", async () => {
    await expect(fetch("https://eu.api.firecrawl.dev/v2/scrape")).rejects.toThrow(/paid provider/);
  });
});
