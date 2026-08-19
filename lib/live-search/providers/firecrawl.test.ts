import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  discoverProductPagesWithFirecrawl,
  extractProductWithFirecrawl,
  searchProductsWithFirecrawl,
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

  it("sends the user's own words without an injected category noun", async () => {
    const fetchImplementation = vi.fn(async (
      _input: string | URL,
      _init?: RequestInit,
    ) => {
      void _input;
      void _init;
      return Response.json({ success: true, data: { web: [] } });
    });

    await discoverProductPagesWithFirecrawl({
      kind: "prompt",
      text: "black bookshelf",
      retailers: ["ikea-au", "kmart-au"],
    }, 6, fetchImplementation);

    const queries = fetchImplementation.mock.calls.map(
      (call) => (JSON.parse(String(call[1]?.body)) as { query: string }).query,
    );
    expect(queries).toEqual([
      "black bookshelf site:ikea.com/au/en/p/",
      "black bookshelf site:kmart.com.au/product/",
    ]);
    for (const query of queries) {
      expect(query).not.toContain("furniture");
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
          priceText: "$149.00",
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
      imageCandidates: ["https://www.ikea.com/image.jpg"],
    });

    const requestBody = JSON.parse(
      String(fetchImplementation.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      onlyMainContent: true,
      onlyCleanContent: true,
      location: { country: "AU", languages: ["en-AU"] },
    });
    expect(requestBody.formats).toEqual(expect.arrayContaining(["markdown", "images"]));
  });

  it.each([
    ["$129.00", 12_900],
    ["$129", 12_900],
    ["$1,299.99", 129_999],
    ["A$89.50", 8_950],
  ])("converts the displayed price %s to %i minor units", async (priceText, expected) => {
    // Production returned priceMinor 129 for a $129 bookcase because the provider
    // was asked to convert to minor units itself. The conversion is now ours.
    const fetchImplementation = vi.fn(async () => Response.json({
      success: true,
      data: {
        markdown: "# SKRUVBY",
        images: ["https://www.ikea.com/image.jpg"],
        metadata: { sourceURL: "https://www.ikea.com/au/en/p/skruvby-1/" },
        json: {
          canonicalUrl: "https://www.ikea.com/au/en/p/skruvby-1/",
          name: "SKRUVBY bookcase",
          priceText,
          currency: "AUD",
        },
      },
    }));

    await expect(extractProductWithFirecrawl(
      "https://www.ikea.com/au/en/p/skruvby-1/",
      fetchImplementation,
    )).resolves.toMatchObject({ priceMinor: expected, currency: "AUD" });
  });

  it("recovers the price from page text when the provider omits priceText", async () => {
    const fetchImplementation = vi.fn(async () => Response.json({
      success: true,
      data: {
        markdown: "SKRUVBY Bookcase, black-blue\n$129.00\nIn stock",
        images: ["https://www.ikea.com/image.jpg"],
        metadata: { sourceURL: "https://www.ikea.com/au/en/p/skruvby-1/" },
        json: {
          canonicalUrl: "https://www.ikea.com/au/en/p/skruvby-1/",
          name: "SKRUVBY bookcase",
          currency: "AUD",
        },
      },
    }));

    await expect(extractProductWithFirecrawl(
      "https://www.ikea.com/au/en/p/skruvby-1/",
      fetchImplementation,
    )).resolves.toMatchObject({ priceMinor: 12_900, currency: "AUD" });
  });

  it("omits the price rather than trusting a provider-supplied minor-unit integer", async () => {
    const fetchImplementation = vi.fn(async () => Response.json({
      success: true,
      data: {
        markdown: "SKRUVBY Bookcase",
        images: ["https://www.ikea.com/image.jpg"],
        metadata: { sourceURL: "https://www.ikea.com/au/en/p/skruvby-1/" },
        json: {
          canonicalUrl: "https://www.ikea.com/au/en/p/skruvby-1/",
          name: "SKRUVBY bookcase",
          priceMinor: 129,
          currency: "AUD",
        },
      },
    }));

    const extraction = await extractProductWithFirecrawl(
      "https://www.ikea.com/au/en/p/skruvby-1/",
      fetchImplementation,
    );
    expect(extraction.priceMinor).toBeUndefined();
  });

  it("recovers dimensions only from explicit labelled retailer text", async () => {
    const fetchImplementation = vi.fn(async () => Response.json({
      success: true,
      data: {
        markdown: [
          "# BILLY bookcase",
          "Width: 80 cm",
          "Depth: 28 cm",
          "Height: 202 cm",
        ].join("\n"),
        images: ["https://www.ikea.com/images/billy.jpg"],
        metadata: {
          sourceURL: "https://www.ikea.com/au/en/p/billy-123/",
          title: "BILLY bookcase",
        },
        json: {
          canonicalUrl: "https://www.ikea.com/au/en/p/billy-123/",
          retailerProductId: "123",
          category: "bookcase",
          priceText: "$149.00",
          currency: "AUD",
          availability: "in_stock",
        },
      },
    }));

    await expect(extractProductWithFirecrawl(
      "https://www.ikea.com/au/en/p/billy-123/",
      fetchImplementation,
    )).resolves.toMatchObject({
      name: "BILLY bookcase",
      dimensions: { widthMm: 800, heightMm: 2020, depthMm: 280 },
      dimensionsEvidence: "Width: 80 cm; Height: 202 cm; Depth: 28 cm",
    });
  });

  it("rejects conflicting labelled dimensions instead of guessing", async () => {
    const fetchImplementation = vi.fn(async () => Response.json({
      success: true,
      data: {
        markdown: [
          "Width: 80 cm",
          "Width: 40 cm",
          "Height: 202 cm",
          "Depth: 28 cm",
        ].join("\n"),
        metadata: {
          sourceURL: "https://www.ikea.com/au/en/p/billy-123/",
          title: "BILLY bookcase",
        },
        json: {
          canonicalUrl: "https://www.ikea.com/au/en/p/billy-123/",
        },
      },
    }));

    const result = await extractProductWithFirecrawl(
      "https://www.ikea.com/au/en/p/billy-123/",
      fetchImplementation,
    );

    expect(result.dimensions).toBeUndefined();
    expect(result.dimensionsEvidence).toBeUndefined();
  });

  it.each([
    [
      "Dimensions: 61cm x 15cm x 3.8cm (W x D x H)",
      { widthMm: 610, heightMm: 38, depthMm: 150 },
    ],
    [
      "Dimensions: 1220 W x 610 D x 1830 H mm",
      { widthMm: 1220, heightMm: 1830, depthMm: 610 },
    ],
  ])("recovers explicit retailer axis legend: %s", async (markdown, expected) => {
    const fetchImplementation = vi.fn(async () => Response.json({
      success: true,
      data: {
        markdown,
        metadata: {
          sourceURL: "https://www.kmart.com.au/product/bookcase-123/",
          title: "Bookcase",
        },
        json: {
          canonicalUrl: "https://www.kmart.com.au/product/bookcase-123/",
        },
      },
    }));

    const result = await extractProductWithFirecrawl(
      "https://www.kmart.com.au/product/bookcase-123/",
      fetchImplementation,
    );

    expect(result.dimensions).toEqual(expected);
    expect(markdown).toContain(result.dimensionsEvidence);
  });

  it("keeps bounded raster photo alternatives and drops obvious icons", async () => {
    const fetchImplementation = vi.fn(async () => Response.json({
      success: true,
      data: {
        images: [
          "https://www.ikea.com/icon.svg",
          "https://www.ikea.com/images/products/billy-front.jpg",
          "https://www.ikea.com/images/products/billy-side.webp",
        ],
        json: {
          canonicalUrl: "https://www.ikea.com/au/en/p/billy-123/",
          name: "BILLY bookcase",
          imageUrl: "https://www.ikea.com/logo.svg",
        },
      },
    }));

    const result = await extractProductWithFirecrawl(
      "https://www.ikea.com/au/en/p/billy-123/",
      fetchImplementation,
    );

    expect(result.imageUrl).toBe("https://www.ikea.com/images/products/billy-front.jpg");
    expect(result.imageCandidates).toEqual([
      "https://www.ikea.com/images/products/billy-front.jpg",
      "https://www.ikea.com/images/products/billy-side.webp",
    ]);
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

describe("searchProductsWithFirecrawl", () => {
  it("turns retailer pages into strictly validated observations", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const endpoint = String(input);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (endpoint.endsWith("/search")) {
        const domain = (body.includeDomains as string[])[0];
        const ikea = domain === "ikea.com";
        const productUrl = ikea
          ? "https://www.ikea.com/au/en/p/billy-bookcase-ikea-001/"
          : "https://www.kmart.com.au/product/oak-look-bookcase-kmart-001/";
        return Response.json({
          success: true,
          data: {
            web: [{
              url: productUrl,
              title: ikea ? "BILLY bookcase" : "Oak-look bookcase",
              description: "Black narrow bookcase",
              markdown: "Source product facts",
              json: {
                canonicalUrl: productUrl,
                name: ikea ? "BILLY bookcase" : "Oak-look bookcase",
                retailerProductId: ikea ? "ikea-001" : "kmart-001",
                category: "bookcase",
                imageUrl: ikea
                  ? "https://www.ikea.com/images/billy.jpg"
                  : "https://kmartau.mo.cloudinary.net/bookcase.jpg",
                priceText: ikea ? "$149.00" : "$89.00",
                currency: "AUD",
                availability: "in_stock",
                assembledDimensions: {
                  widthMm: 700,
                  heightMm: 1_600,
                  depthMm: 280,
                },
                dimensionsEvidence: "Width 70 cm; Height 160 cm; Depth 28 cm",
              },
            }],
          },
        });
      }
      throw new Error(`Unexpected Firecrawl endpoint: ${endpoint}`);
    });

    const result = await searchProductsWithFirecrawl({
      kind: "prompt",
      text: "black narrow bookcase under $250",
      retailers: ["ikea-au", "kmart-au"],
    }, 6, fetchImplementation);

    expect(result.output.products).toHaveLength(2);
    expect(result.output.partial).toBe(false);
    expect(result.output.products.map((product) => product.retailer.key)).toEqual([
      "ikea-au",
      "kmart-au",
    ]);
    expect(result.attemptedPages).toBe(2);
    expect(result.rejectedPages).toBe(0);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("returns useful partial coverage instead of rejecting the whole batch", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const endpoint = String(input);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (endpoint.endsWith("/search")) {
        const domain = (body.includeDomains as string[])[0];
        const ikea = domain === "ikea.com";
        const productUrl = ikea
          ? "https://www.ikea.com/au/en/p/billy-bookcase-ikea-001/"
          : "https://www.kmart.com.au/product/incomplete-bookcase/";
        return Response.json({
          success: true,
          data: { web: [{
            url: productUrl,
            title: "Bookcase",
            json: ikea ? {
              canonicalUrl: productUrl,
              name: "BILLY bookcase",
              retailerProductId: "ikea-001",
              category: "bookcase",
              imageUrl: "https://www.ikea.com/images/billy.jpg",
              priceText: "$149.00",
              currency: "AUD",
              availability: "in_stock",
              assembledDimensions: { widthMm: 700, heightMm: 1_600, depthMm: 280 },
              dimensionsEvidence: "Width 70 cm; Height 160 cm; Depth 28 cm",
            } : {
              canonicalUrl: productUrl,
              name: "Incomplete bookcase",
            },
          }] },
        });
      }
      throw new Error(`Unexpected Firecrawl endpoint: ${endpoint}`);
    });

    const result = await searchProductsWithFirecrawl({
      kind: "prompt",
      text: "narrow bookcase",
      retailers: ["ikea-au", "kmart-au"],
    }, 6, fetchImplementation);

    expect(result.output.products).toHaveLength(1);
    expect(result.output.partial).toBe(true);
    expect(result.output.notes.join(" ")).toContain("kmart-au");
    expect(result.rejectedPages).toBe(1);
  });

  it("opens discovered product pages when search omits structured extraction", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const endpoint = String(input);
      if (endpoint.endsWith("/search")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const domain = (body.includeDomains as string[])[0];
        const ikea = domain === "ikea.com";
        return Response.json({
          success: true,
          data: {
            web: [{
              url: ikea
                ? "https://www.ikea.com/au/en/p/billy-bookcase-ikea-001/"
                : "https://www.kmart.com.au/product/oak-look-bookcase-kmart-001/",
              title: ikea ? "BILLY bookcase" : "Oak-look bookcase",
              description: "A product result without embedded JSON",
            }],
          },
        });
      }
      if (endpoint.endsWith("/scrape")) {
        const body = JSON.parse(String(init?.body)) as { url: string };
        const ikea = body.url.includes("ikea.com");
        return Response.json({
          success: true,
          data: {
            images: [ikea
              ? "https://www.ikea.com/images/billy.jpg"
              : "https://kmartau.mo.cloudinary.net/bookcase.jpg"],
            metadata: { sourceURL: body.url },
            json: {
              canonicalUrl: body.url,
              name: ikea ? "BILLY bookcase" : "Oak-look bookcase",
              retailerProductId: ikea ? "ikea-001" : "kmart-001",
              category: "bookcase",
              priceText: ikea ? "$149.00" : "$89.00",
              currency: "AUD",
              availability: "in_stock",
              assembledDimensions: { widthMm: 700, heightMm: 1_600, depthMm: 280 },
              dimensionsEvidence: "Width 70 cm; Height 160 cm; Depth 28 cm",
            },
          },
        });
      }
      throw new Error(`Unexpected Firecrawl endpoint: ${endpoint}`);
    });

    const result = await searchProductsWithFirecrawl({
      kind: "prompt",
      text: "black bookshelf",
      retailers: ["ikea-au", "kmart-au"],
    }, 6, fetchImplementation);

    expect(result.output.products).toHaveLength(2);
    expect(result.rejectedPages).toBe(0);
    expect(fetchImplementation).toHaveBeenCalledTimes(4);
  });

  it("accepts discovered pages whose dimensions are explicit only in markdown", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const endpoint = String(input);
      if (endpoint.endsWith("/search")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const domain = (body.includeDomains as string[])[0];
        const productUrl = domain === "ikea.com"
          ? "https://www.ikea.com/au/en/p/billy-bookcase-ikea-001/"
          : "https://www.kmart.com.au/product/oak-look-bookcase-kmart-001/";
        return Response.json({
          success: true,
          data: { web: [{ url: productUrl, title: "Bookcase" }] },
        });
      }
      if (endpoint.endsWith("/scrape")) {
        const body = JSON.parse(String(init?.body)) as { url: string };
        const ikea = body.url.includes("ikea.com");
        return Response.json({
          success: true,
          data: {
            markdown: "Width: 70 cm\nHeight: 160 cm\nDepth: 28 cm",
            images: [ikea
              ? "https://www.ikea.com/images/billy.jpg"
              : "https://kmartau.mo.cloudinary.net/bookcase.jpg"],
            metadata: { sourceURL: body.url },
            json: {
              canonicalUrl: body.url,
              name: ikea ? "BILLY bookcase" : "Oak-look bookcase",
              retailerProductId: ikea ? "ikea-001" : "kmart-001",
              category: "bookcase",
              priceText: ikea ? "$149.00" : "$89.00",
              currency: "AUD",
              availability: "in_stock",
            },
          },
        });
      }
      throw new Error(`Unexpected Firecrawl endpoint: ${endpoint}`);
    });

    const result = await searchProductsWithFirecrawl({
      kind: "prompt",
      text: "black bookshelf",
      retailers: ["ikea-au", "kmart-au"],
    }, 6, fetchImplementation);

    expect(result.output.products).toHaveLength(2);
    expect(result.output.partial).toBe(false);
    expect(result.output.products[0]?.assembledDimensions).toEqual({
      widthMm: 700,
      heightMm: 1600,
      depthMm: 280,
    });
    expect(result.rejectedPages).toBe(0);
  });

  it("keeps one retailer's results when the other retailer times out", async () => {
    const fetchImplementation = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const domain = (body.includeDomains as string[])[0];
      if (domain === "kmart.com.au") {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }
      const productUrl = "https://www.ikea.com/au/en/p/billy-bookcase-ikea-001/";
      return Response.json({
        success: true,
        data: { web: [{
          url: productUrl,
          title: "BILLY bookcase",
          json: {
            canonicalUrl: productUrl,
            name: "BILLY bookcase",
            retailerProductId: "ikea-001",
            category: "bookcase",
            imageUrl: "https://www.ikea.com/images/billy.jpg",
              priceText: "$149.00",
            currency: "AUD",
            availability: "in_stock",
            assembledDimensions: { widthMm: 700, heightMm: 1_600, depthMm: 280 },
            dimensionsEvidence: "Width 70 cm; Height 160 cm; Depth 28 cm",
          },
        }] },
      });
    });

    const result = await searchProductsWithFirecrawl({
      kind: "prompt",
      text: "narrow bookcase",
      retailers: ["ikea-au", "kmart-au"],
    }, 6, fetchImplementation);

    expect(result.output.products).toHaveLength(1);
    expect(result.output.products[0]?.retailer.key).toBe("ikea-au");
    expect(result.output.partial).toBe(true);
    expect(result.output.notes.join(" ")).toContain("kmart-au");
  });
});
