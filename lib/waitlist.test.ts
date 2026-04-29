import { afterEach, describe, expect, it, vi } from "vitest";
import { createNotionWaitlistLead, parseWaitlistRequest } from "./waitlist";

describe("waitlist", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("validates a complete waitlist request", () => {
    const parsed = parseWaitlistRequest({
      prototypeId: "smart-hydration-bottle",
      productName: "Smart Hydration Bottle",
      email: "FOUNDER@example.com",
      name: "Founder",
      role: "Builder",
      source: "launch-page",
    });

    expect(parsed).toMatchObject({
      prototypeId: "smart-hydration-bottle",
      productName: "Smart Hydration Bottle",
      email: "founder@example.com",
      source: "launch-page",
    });
  });

  it("rejects missing and invalid email values", () => {
    expect(parseWaitlistRequest({ prototypeId: "x", productName: "Product" })).toMatchObject({
      ok: false,
      error: "Email is required.",
      status: 400,
    });
    expect(parseWaitlistRequest({ prototypeId: "x", productName: "Product", email: "bad" })).toMatchObject({
      ok: false,
      error: "Enter a valid email address.",
      status: 400,
    });
  });

  it("returns a setup error when Notion is disabled", async () => {
    const result = await createNotionWaitlistLead({
      prototypeId: "smart-hydration-bottle",
      productName: "Smart Hydration Bottle",
      email: "founder@example.com",
      source: "launch-page",
    });

    expect(result).toMatchObject({
      ok: false,
      error: "Notion waitlist is not enabled. Set ENABLE_NOTION=true.",
      status: 503,
    });
  });

  it("creates a Notion page when configured", async () => {
    vi.stubEnv("ENABLE_NOTION", "true");
    vi.stubEnv("NOTION_TOKEN", "secret_token");
    vi.stubEnv("NOTION_WAITLIST_DATABASE_ID", "database-id");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "notion-page-id" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createNotionWaitlistLead({
      prototypeId: "smart-hydration-bottle",
      productName: "Smart Hydration Bottle",
      email: "founder@example.com",
      name: "Founder",
      role: "Builder",
      source: "launch-page",
    });

    expect(result).toEqual({ ok: true, notionPageId: "notion-page-id" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.notion.com/v1/pages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret_token",
          "Notion-Version": "2026-03-11",
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      parent: { type: "database_id", database_id: "database-id" },
    });
  });
});
