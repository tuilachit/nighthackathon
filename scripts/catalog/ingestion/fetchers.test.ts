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
