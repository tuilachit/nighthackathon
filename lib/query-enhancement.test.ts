import { afterEach, describe, expect, it, vi } from "vitest";
import { enhanceFurnitureQuery } from "./query-enhancement";

describe("enhanceFurnitureQuery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("stays unavailable without an API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(enhanceFurnitureQuery("a walnut shelf")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns validated structured output", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  category: "shelving-unit",
                  maxPrice: null,
                  materials: ["Walnut"],
                  colors: [],
                  styles: ["Modern"],
                  keywords: ["display"],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(enhanceFurnitureQuery("a walnut display shelf")).resolves.toEqual({
      category: "shelving-unit",
      materials: ["walnut"],
      colors: [],
      styles: ["modern"],
      keywords: ["display"],
    });

    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      model: string;
      response_format: { json_schema: { strict: boolean } };
    };
    expect(request.model).toBe("gpt-5.6-luna");
    expect(request.response_format.json_schema.strict).toBe(true);
  });

  it("rejects malformed model output", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"category":"bookcase"}' } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(enhanceFurnitureQuery("book storage")).resolves.toBeUndefined();
  });
});
