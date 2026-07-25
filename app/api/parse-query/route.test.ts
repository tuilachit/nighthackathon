import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/parse-query", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects an empty query", async () => {
    const response = await POST(
      new Request("http://localhost/api/parse-query", {
        method: "POST",
        body: JSON.stringify({ text: "  " }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("reports unavailable without an API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await POST(
      new Request("http://localhost/api/parse-query", {
        method: "POST",
        body: JSON.stringify({ text: "cozy storage" }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ available: false });
  });
});
