import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  discoverProductPagesWithFirecrawl,
  extractProductWithFirecrawl,
} from "./firecrawl";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");
  vi.stubEnv("FIRECRAWL_API_KEY", "fc-secret");
  vi.stubEnv("BROWSER_USE_API_KEY", "browser-key");
  vi.stubEnv("BROWSER_USE_WEBHOOK_SECRET", "b".repeat(32));
  vi.stubEnv("MESHY_API_KEY", "meshy-key");
  vi.stubEnv("MESHY_WEBHOOK_SECRET", "m".repeat(32));
  vi.stubEnv("CRON_SECRET", "c".repeat(32));
  vi.stubEnv("ABUSE_HASH_SECRET", "a".repeat(32));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("discoverProductPagesWithFirecrawl", () => {
  it("searches each requested Australian retailer and rejects foreign domains", async () => {
    const fetchImplementation = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { includeDomains: string[] };
      const ikea = request.includeDomains[0] === "ikea.com";
      return Response.json({
        success: true,
        data: {
          web: [
            {
              url: ikea
                ? "https://www.ikea.com/au/en/p/billy-bookcase-123/?utm_source=test"
                : "https://www.kmart.com.au/product/blake-bookcase-456/",
              title: ikea ? "BILLY bookcase" : "Blake bookcase",
              description: "Black shelving",
            },
            {
              url: "https://evil.example/product",
              title: "Wrong domain",
            },
          ],
        },
      });
    });

    const result = await discoverProductPagesWithFirecrawl({
      kind: "prompt",
      text: "black bookshelf",
      retailers: ["ikea-au", "kmart-au"],
    }, 6, fetchImplementation);

    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.retailer?.key)).toEqual([
      "ikea-au",
      "kmart-au",
    ]);
    expect(result[0]?.url).not.toContain("utm_source");
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    for (const call of fetchImplementation.mock.calls) {
      expect(call[1]?.headers).toMatchObject({ Authorization: "Bearer fc-secret" });
      expect(JSON.parse(String(call[1]?.body))).toMatchObject({
        country: "AU",
        location: "Sydney,New South Wales,Australia",
        limit: 3,
      });
    }
  });

  it("preserves one canonical exact product link without a provider call", async () => {
    const fetchImplementation = vi.fn();
    const result = await discoverProductPagesWithFirecrawl({
      kind: "product-link",
      url: "https://example.com/chair/?utm_source=share#details",
    }, 6, fetchImplementation);

    expect(result).toEqual([expect.objectContaining({
      url: "https://example.com/chair",
    })]);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});

describe("extractProductWithFirecrawl", () => {
  it("accepts compact source-backed facts and complete dimensions", async () => {
    const fetchImplementation = vi.fn(async (
      _input: string | URL,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return Response.json({
      success: true,
      data: {
        markdown: "# BILLY\nProduct dimensions",
        images: ["https://www.ikea.com/image.jpg"],
        metadata: { sourceURL: "https://www.ikea.com/au/en/p/billy-123/" },
        json: {
          canonicalUrl: "https://www.ikea.com/au/en/p/billy-123/",
          name: "BILLY bookcase",
          retailerProductId: "123",
          category: "bookcase",
          priceMinor: 14900,
          currency: "AUD",
          availability: "in_stock",
          assembledDimensions: {
            widthMm: 800,
            heightMm: 2020,
            depthMm: 280,
          },
          dimensionsEvidence: "Width 80 cm, depth 28 cm, height 202 cm",
        },
      },
      });
    });

    await expect(extractProductWithFirecrawl(
      "https://www.ikea.com/au/en/p/billy-123/",
      fetchImplementation,
    )).resolves.toMatchObject({
      name: "BILLY bookcase",
      imageUrl: "https://www.ikea.com/image.jpg",
      priceMinor: 14900,
      currency: "AUD",
      dimensions: { widthMm: 800, heightMm: 2020, depthMm: 280 },
    });

    const requestBody = JSON.parse(
      String(fetchImplementation.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      onlyMainContent: true,
      onlyCleanContent: true,
      location: { country: "AU", languages: ["en-AU"] },
    });
  });

  it("keeps a recommendation when dimensions are not explicit", async () => {
    const fetchImplementation = vi.fn(async (
      _input: string | URL,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return Response.json({
      success: true,
      data: {
        markdown: "Dimensions: 80 x 28 x 202 cm",
        json: {
          canonicalUrl: "https://www.ikea.com/au/en/p/billy-123/",
          name: "BILLY bookcase",
        },
      },
      });
    });

    const result = await extractProductWithFirecrawl(
      "https://www.ikea.com/au/en/p/billy-123/",
      fetchImplementation,
    );
    expect(result.name).toBe("BILLY bookcase");
    expect(result.dimensions).toBeUndefined();
    expect(result.markdown).toContain("80 x 28 x 202 cm");
  });

  it("rejects a canonical redirect to another registrable domain", async () => {
    const fetchImplementation = vi.fn(async (
      _input: string | URL,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return Response.json({
      success: true,
      data: {
        json: {
          canonicalUrl: "https://evil.com/product",
          name: "Wrong product",
        },
      },
      });
    });

    await expect(extractProductWithFirecrawl(
      "https://www.ikea.com/au/en/p/billy-123/",
      fetchImplementation,
    )).rejects.toThrow("left the submitted retailer domain");
  });

  it("classifies provider throttling as retryable", async () => {
    const fetchImplementation = vi.fn(async (
      _input: string | URL,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return new Response("rate limited", { status: 429 });
    });

    await expect(extractProductWithFirecrawl(
      "https://www.ikea.com/au/en/p/billy-123/",
      fetchImplementation,
    )).rejects.toMatchObject({
      status: 429,
      retryable: true,
    });
  });
});
