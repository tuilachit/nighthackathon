import { describe, expect, it } from "vitest";
import {
  BrowserUseClient,
  FirecrawlClient,
  ProductPageFetcher,
  ProviderCreditExhaustedError,
  type IngestionMetrics,
} from "./fetchers";

describe("two-tier page fetching", () => {
  it("returns Firecrawl markdown and does not create a browser session", async () => {
    const metrics = emptyMetrics();
    const firecrawl = new FirecrawlClient(
      "firecrawl-key",
      metrics,
      async () =>
        jsonResponse({
          success: true,
          data: {
            markdown: "# Product",
            rawHtml: "<h1>Product</h1>",
            links: ["https://example.com/product"],
            images: ["https://example.com/product.jpg"],
            metadata: { sourceURL: "https://example.com/product" },
          },
        }),
    );
    const browserUse = new BrowserUseClient(
      "browser-key",
      metrics,
      async () => {
        throw new Error("Browser Use should not be called.");
      },
    );

    const result = await new ProductPageFetcher(
      firecrawl,
      browserUse,
    ).fetchPage("https://example.com/product");

    expect(result.source).toBe("firecrawl");
    expect(metrics).toMatchObject({
      firecrawlPagesFetched: 1,
      browserUseSessions: 0,
    });
  });

  it("falls back to one terminal Browser Use session after a fetch failure", async () => {
    const metrics = emptyMetrics();
    const firecrawl = new FirecrawlClient(
      "firecrawl-key",
      metrics,
      async () => new Response("blocked", { status: 500 }),
    );
    const browserUse = new BrowserUseClient(
      "browser-key",
      metrics,
      async () =>
        jsonResponse({
          id: "session-id",
          status: "stopped",
          isTaskSuccessful: true,
          output: {
            finalUrl: "https://example.com/product",
            pageText: "Rendered product text",
            links: [],
            imageUrls: ["https://example.com/product.jpg"],
            evidenceText: "Width 20 in; Height 40 in; Depth 10 in",
            primaryImageUrl: "https://example.com/product.jpg",
          },
        }),
    );

    const result = await new ProductPageFetcher(
      firecrawl,
      browserUse,
    ).fetchPage("https://example.com/product");

    expect(result.source).toBe("browser-use");
    expect(metrics.browserUseSessions).toBe(1);
  });

  it("stops instead of falling back when Firecrawl reports exhausted credits", async () => {
    const metrics = emptyMetrics();
    let browserCalled = false;
    const firecrawl = new FirecrawlClient(
      "firecrawl-key",
      metrics,
      async () => new Response("Insufficient credits", { status: 402 }),
    );
    const browserUse = new BrowserUseClient(
      "browser-key",
      metrics,
      async () => {
        browserCalled = true;
        return new Response();
      },
    );

    await expect(
      new ProductPageFetcher(firecrawl, browserUse).fetchPage(
        "https://example.com/product",
      ),
    ).rejects.toBeInstanceOf(ProviderCreditExhaustedError);
    expect(browserCalled).toBe(false);
  });

  it("can force the rendered tier after static extraction is incomplete", async () => {
    const metrics = emptyMetrics();
    const firecrawl = new FirecrawlClient(
      "firecrawl-key",
      metrics,
      async () => {
        throw new Error("The default tier should not run.");
      },
    );
    const browserUse = new BrowserUseClient(
      "browser-key",
      metrics,
      async () =>
        jsonResponse({
          id: "session-id",
          status: "stopped",
          isTaskSuccessful: true,
          output: {
            finalUrl: "https://example.com/product",
            pageText: "Rendered dimensions and product facts",
            links: [],
            imageUrls: ["https://example.com/product.jpg"],
            evidenceText: "Width 20 in; Height 40 in; Depth 10 in",
            primaryImageUrl: "https://example.com/product.jpg",
          },
        }),
    );

    const result = await new ProductPageFetcher(
      firecrawl,
      browserUse,
    ).fetchRenderedPage("https://example.com/product");

    expect(result.source).toBe("browser-use");
    expect(metrics.browserUseSessions).toBe(1);
  });

  it("stops a remote browser session when polling fails", async () => {
    const metrics = emptyMetrics();
    const requests: string[] = [];
    const browserUse = new BrowserUseClient(
      "browser-key",
      metrics,
      async (input, init) => {
        const url = String(input);
        requests.push(`${init?.method ?? "GET"} ${url}`);
        if (init?.method === "POST" && url.endsWith("/sessions")) {
          return jsonResponse({ id: "session-id", status: "started" });
        }
        if (init?.method === "POST" && url.endsWith("/stop")) {
          return jsonResponse({ id: "session-id", status: "stopped" });
        }
        return new Response("poll failed", { status: 500 });
      },
    );

    await expect(
      browserUse.fetchPage("https://example.com/product"),
    ).rejects.toThrow("poll failed");
    expect(requests.at(-1)).toContain("/session-id/stop");
  }, 10_000);
});

function emptyMetrics(): IngestionMetrics {
  return {
    firecrawlPagesFetched: 0,
    browserUseSessions: 0,
    claudeCalls: 0,
    retailerApiRequests: 0,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
