import { isRecord, normalizeHttpsUrl, stringValue } from "./shared";

const FIRECRAWL_SCRAPE_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const BROWSER_USE_SESSIONS_ENDPOINT =
  "https://api.browser-use.com/api/v3/sessions";
const FIRECRAWL_INTERVAL_MS = 1_100;
const BROWSER_USE_POLL_INTERVAL_MS = 3_000;
const BROWSER_USE_TIMEOUT_MS = 120_000;
const CREDIT_ERROR_PATTERN =
  /\b(credit|quota|billing|payment|required|insufficient|exhausted|limit reached)\b/i;

export interface IngestionMetrics {
  firecrawlPagesFetched: number;
  browserUseSessions: number;
  claudeCalls: number;
  retailerApiRequests: number;
}

export interface FetchedPage {
  readonly source: "firecrawl" | "browser-use";
  readonly finalUrl: string;
  readonly markdown: string;
  readonly rawHtml: string;
  readonly links: readonly string[];
}

export class ProviderCreditExhaustedError extends Error {
  public constructor(
    public readonly provider: "firecrawl" | "browser-use" | "anthropic",
    message: string,
  ) {
    super(message);
    this.name = "ProviderCreditExhaustedError";
  }
}

type FetchImplementation = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export class FirecrawlClient {
  private readonly limiter = new RequestRateLimiter(FIRECRAWL_INTERVAL_MS);

  public constructor(
    private readonly apiKey: string,
    private readonly metrics: IngestionMetrics,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {}

  /** Fetches one page as markdown, raw HTML, and discovered links. */
  public async fetchPage(targetUrl: string): Promise<FetchedPage> {
    await this.limiter.wait();
    const response = await this.fetchImplementation(FIRECRAWL_SCRAPE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ["markdown", "rawHtml", "links"],
        onlyMainContent: false,
        location: { country: "US", languages: ["en-US"] },
        removeBase64Images: true,
        blockAds: true,
        timeout: 60_000,
      }),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw providerError("firecrawl", response.status, bodyText);
    }

    const payload = parseJson(bodyText);
    if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
      throw new Error("Firecrawl returned an invalid scrape response.");
    }

    const markdown = stringValue(payload.data.markdown) ?? "";
    const rawHtml = stringValue(payload.data.rawHtml) ?? "";
    if (markdown.length === 0 && rawHtml.length === 0) {
      throw new Error("Firecrawl returned no usable page content.");
    }

    this.metrics.firecrawlPagesFetched += 1;
    const metadata = isRecord(payload.data.metadata)
      ? payload.data.metadata
      : undefined;
    return {
      source: "firecrawl",
      finalUrl:
        normalizeHttpsUrl(stringValue(metadata?.sourceURL) ?? targetUrl) ??
        targetUrl,
      markdown,
      rawHtml,
      links: httpsUrlArray(payload.data.links),
    };
  }
}

export class BrowserUseClient {
  public constructor(
    private readonly apiKey: string,
    private readonly metrics: IngestionMetrics,
    private readonly fetchImplementation: FetchImplementation = fetch,
    private readonly maxCostUsd = 0.15,
  ) {}

  /** Uses one bounded cloud-browser session to recover rendered page text. */
  public async fetchPage(targetUrl: string): Promise<FetchedPage> {
    const createResponse = await this.fetchImplementation(
      BROWSER_USE_SESSIONS_ENDPOINT,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          task: [
            `Open ${targetUrl}.`,
            "Return the canonical final URL, the visible product/listing page text,",
            "and all HTTPS product links visible on the page.",
            "Do not infer or calculate product dimensions.",
          ].join(" "),
          model: "claude-sonnet-4.6",
          keepAlive: false,
          maxCostUsd: this.maxCostUsd,
          proxyCountryCode: "us",
          enableRecording: false,
          outputSchema: {
            type: "object",
            properties: {
              finalUrl: { type: "string" },
              pageText: { type: "string" },
              links: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["finalUrl", "pageText", "links"],
            additionalProperties: false,
          },
        }),
      },
    );
    const createBody = await createResponse.text();
    if (!createResponse.ok) {
      throw providerError("browser-use", createResponse.status, createBody);
    }

    const created = parseJson(createBody);
    if (!isRecord(created) || stringValue(created.id) === undefined) {
      throw new Error("Browser Use returned an invalid session response.");
    }
    this.metrics.browserUseSessions += 1;
    const sessionId = stringValue(created.id);
    if (sessionId === undefined) {
      throw new Error("Browser Use did not return a session id.");
    }

    const deadline = Date.now() + BROWSER_USE_TIMEOUT_MS;
    let session: Record<string, unknown> = created;
    while (!isTerminalBrowserStatus(stringValue(session.status))) {
      if (Date.now() >= deadline) {
        throw new Error("Browser Use session timed out.");
      }
      await wait(BROWSER_USE_POLL_INTERVAL_MS);
      const pollResponse = await this.fetchImplementation(
        `${BROWSER_USE_SESSIONS_ENDPOINT}/${sessionId}`,
        { headers: this.headers(false) },
      );
      const pollBody = await pollResponse.text();
      if (!pollResponse.ok) {
        throw providerError("browser-use", pollResponse.status, pollBody);
      }
      const polled = parseJson(pollBody);
      if (!isRecord(polled)) {
        throw new Error("Browser Use returned an invalid poll response.");
      }
      session = polled;
    }

    if (
      session.status !== "stopped" ||
      session.isTaskSuccessful === false
    ) {
      const detail =
        stringValue(session.lastStepSummary) ??
        `Browser Use session ended with ${String(session.status)}.`;
      if (CREDIT_ERROR_PATTERN.test(detail)) {
        throw new ProviderCreditExhaustedError("browser-use", detail);
      }
      throw new Error(detail);
    }

    const output = parseBrowserOutput(session.output);
    const finalUrl =
      normalizeHttpsUrl(output.finalUrl) ??
      normalizeHttpsUrl(targetUrl) ??
      targetUrl;
    if (output.pageText.trim().length === 0) {
      throw new Error("Browser Use returned no visible page text.");
    }
    return {
      source: "browser-use",
      finalUrl,
      markdown: output.pageText.trim(),
      rawHtml: "",
      links: output.links.flatMap((link) => {
        const normalized = normalizeHttpsUrl(link);
        return normalized === undefined ? [] : [normalized];
      }),
    };
  }

  private headers(includeContentType = true): Record<string, string> {
    return {
      "X-Browser-Use-API-Key": this.apiKey,
      ...(includeContentType ? { "Content-Type": "application/json" } : {}),
    };
  }
}

export class ProductPageFetcher {
  public constructor(
    private readonly firecrawl: FirecrawlClient,
    private readonly browserUse: BrowserUseClient,
  ) {}

  /** Uses Firecrawl by default and Browser Use only for non-credit failures. */
  public async fetchPage(targetUrl: string): Promise<FetchedPage> {
    try {
      return await this.firecrawl.fetchPage(targetUrl);
    } catch (error) {
      if (error instanceof ProviderCreditExhaustedError) {
        throw error;
      }
      return this.browserUse.fetchPage(targetUrl);
    }
  }

  /** Forces the rendered-browser tier after usable static text still fails extraction. */
  public fetchRenderedPage(targetUrl: string): Promise<FetchedPage> {
    return this.browserUse.fetchPage(targetUrl);
  }
}

class RequestRateLimiter {
  private lastRequestAt = 0;

  public constructor(private readonly intervalMs: number) {}

  public async wait(): Promise<void> {
    const delay = Math.max(
      0,
      this.lastRequestAt + this.intervalMs - Date.now(),
    );
    if (delay > 0) {
      await wait(delay);
    }
    this.lastRequestAt = Date.now();
  }
}

function providerError(
  provider: "firecrawl" | "browser-use",
  status: number,
  body: string,
): Error {
  const message = `${provider} returned HTTP ${status}: ${body.slice(0, 240)}`;
  return status === 402 ||
    status === 429 ||
    CREDIT_ERROR_PATTERN.test(body)
    ? new ProviderCreditExhaustedError(provider, message)
    : new Error(message);
}

function parseBrowserOutput(value: unknown): {
  readonly finalUrl: string;
  readonly pageText: string;
  readonly links: readonly string[];
} {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!isRecord(parsed)) {
    throw new Error("Browser Use returned invalid structured output.");
  }
  const finalUrl = stringValue(parsed.finalUrl);
  const pageText = stringValue(parsed.pageText);
  if (finalUrl === undefined || pageText === undefined) {
    throw new Error("Browser Use output omitted required page fields.");
  }
  return { finalUrl, pageText, links: stringArray(parsed.links) };
}

function isTerminalBrowserStatus(status: string | undefined): boolean {
  return (
    status === "stopped" ||
    status === "timed_out" ||
    status === "error"
  );
}

function httpsUrlArray(value: unknown): readonly string[] {
  return stringArray(value).flatMap((entry) => {
    const normalized = normalizeHttpsUrl(entry);
    return normalized === undefined ? [] : [normalized];
  });
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
