import type { ScrapingRequestOptions } from "./types";

const SCRAPINGANT_ENDPOINT = "https://api.scrapingant.com/v2/general";
const MAX_ATTEMPTS = 3;
const MINIMUM_REQUEST_INTERVAL_MS = 1_100;

export class ScrapingAntClient {
  private requestQueue: Promise<void> = Promise.resolve();
  private lastRequestStartedAt = 0;

  public constructor(private readonly apiKey: string) {}

  public async fetchText(
    targetUrl: string,
    options: ScrapingRequestOptions = {},
  ): Promise<string> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.fetchWithinFreeTierLimit(
          targetUrl,
          options,
        );
        const body = await response.text();
        if (!response.ok) {
          throw new Error(`ScrapingAnt returned HTTP ${response.status}.`);
        }
        const targetStatus = Number.parseInt(
          response.headers.get("ant-page-status-code") ?? "",
          10,
        );
        if (Number.isFinite(targetStatus) && targetStatus >= 400) {
          throw new Error(`The retailer returned HTTP ${targetStatus}.`);
        }
        return body;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_ATTEMPTS) {
          await wait(attempt * 750);
        }
      }
    }

    throw lastError ?? new Error("ScrapingAnt request failed.");
  }

  private fetchWithinFreeTierLimit(
    targetUrl: string,
    options: ScrapingRequestOptions,
  ): Promise<Response> {
    const request = this.requestQueue.then(async () => {
      const delay = Math.max(
        0,
        this.lastRequestStartedAt +
          MINIMUM_REQUEST_INTERVAL_MS -
          Date.now(),
      );
      if (delay > 0) {
        await wait(delay);
      }
      this.lastRequestStartedAt = Date.now();
      return fetch(this.createUrl(targetUrl, options), {
        headers: { Accept: "text/html,application/json" },
      });
    });
    this.requestQueue = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  }

  private createUrl(
    targetUrl: string,
    options: ScrapingRequestOptions,
  ): URL {
    const url = new URL(SCRAPINGANT_ENDPOINT);
    url.searchParams.set("x-api-key", this.apiKey);
    url.searchParams.set("url", targetUrl);
    url.searchParams.set("browser", options.renderJs === true ? "true" : "false");
    url.searchParams.set(
      "proxy_type",
      options.useResidentialProxy === true ? "residential" : "datacenter",
    );
    url.searchParams.set("proxy_country", "US");
    url.searchParams.set("timeout", "60");
    if (options.waitForSelector !== undefined) {
      url.searchParams.set("wait_for_selector", options.waitForSelector);
    }
    return url;
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
