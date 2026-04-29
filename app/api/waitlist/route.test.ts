import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/waitlist", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects invalid email", async () => {
    const response = await POST(
      new Request("http://localhost/api/waitlist", {
        method: "POST",
        body: JSON.stringify({
          prototypeId: "smart-hydration-bottle",
          productName: "Smart Hydration Bottle",
          email: "bad",
          source: "launch-page",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Enter a valid email address." });
  });

  it("returns a Notion page id after a successful sync", async () => {
    vi.stubEnv("ENABLE_NOTION", "true");
    vi.stubEnv("NOTION_TOKEN", "secret_token");
    vi.stubEnv("NOTION_WAITLIST_DATA_SOURCE_ID", "data-source-id");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "notion-page-id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/waitlist", {
        method: "POST",
        body: JSON.stringify({
          prototypeId: "smart-hydration-bottle",
          productName: "Smart Hydration Bottle",
          email: "founder@example.com",
          source: "launch-page",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, notionPageId: "notion-page-id" });
  });
});
