import "server-only";

export interface PublicSupabaseEnvironment {
  readonly url: string;
  readonly publishableKey: string;
}

export interface BrowserUseWebhookEnvironment {
  readonly browserUseWebhookSecret: string;
}

export type BrowserUseModel =
  | "bu-mini"
  | "bu-max"
  | "bu-ultra"
  | "gemini-3-flash"
  | "claude-sonnet-4.6"
  | "claude-opus-4.6";

export interface LiveSearchServerEnvironment extends PublicSupabaseEnvironment {
  readonly secretKey: string;
  readonly firecrawlApiKey: string;
  readonly browserUseApiKey: string;
  readonly browserUseWebhookSecret: string;
  readonly browserUseModel: BrowserUseModel;
  /** Present only when the separately approval-gated 3D pipeline is enabled. */
  readonly meshyApiKey?: string;
  readonly meshyWebhookSecret?: string;
  readonly cronSecret: string;
  readonly abuseHashSecret: string;
  readonly browserUseMaxCostUsd: number;
  readonly maxResults: number;
  /** How many candidate product URLs discovery may gather before extraction. */
  readonly discoveryPoolSize: number;
  /** Validated products to reach before discovery may stop early. */
  readonly completenessFloor: number;
  /** Validated products wanted from each requested retailer. */
  readonly minPerRetailer: number;
  /** Candidate pages kept in flight at once; bounds provider burst. */
  readonly extractionConcurrency: number;
  /** Hard cap on page scrapes per search; the provider plan is rate-limited per minute. */
  readonly maxScrapesPerSearch: number;
  /** Per-page scrape ceiling. Slow retailer pages fail fast instead of holding the budget. */
  readonly extractionPageTimeoutMs: number;
  /** Wall-clock ceiling for discovery plus extraction, inside the route's maxDuration. */
  readonly discoveryBudgetMs: number;
}

export function getPublicSupabaseEnvironment(): PublicSupabaseEnvironment {
  return {
    url: requiredUrl("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}

/** Configuration needed to authenticate Browser Use callbacks, independent of other features. */
export function getBrowserUseWebhookEnvironment(): BrowserUseWebhookEnvironment {
  return {
    browserUseWebhookSecret: requiredSecret("BROWSER_USE_WEBHOOK_SECRET"),
  };
}

export function getLiveSearchServerEnvironment(): LiveSearchServerEnvironment {
  const meshyApiKey = optionalEnvironment("MESHY_API_KEY");
  const meshyWebhookSecret = optionalSecret("MESHY_WEBHOOK_SECRET");
  return {
    ...getPublicSupabaseEnvironment(),
    secretKey: requiredEnvironment("SUPABASE_SECRET_KEY"),
    firecrawlApiKey: requiredEnvironment("FIRECRAWL_API_KEY"),
    browserUseApiKey: requiredEnvironment("BROWSER_USE_API_KEY"),
    browserUseWebhookSecret: requiredSecret("BROWSER_USE_WEBHOOK_SECRET"),
    browserUseModel: browserUseModel(),
    ...(meshyApiKey === undefined ? {} : { meshyApiKey }),
    ...(meshyWebhookSecret === undefined ? {} : { meshyWebhookSecret }),
    cronSecret: requiredSecret("CRON_SECRET"),
    abuseHashSecret: requiredSecret("ABUSE_HASH_SECRET"),
    browserUseMaxCostUsd: boundedNumber("BROWSER_USE_MAX_COST_USD", 1, 0.05, 2),
    maxResults: Math.round(boundedNumber("LIVE_SEARCH_MAX_RESULTS", 12, 3, 40)),
    discoveryPoolSize: Math.round(boundedNumber("LIVE_SEARCH_DISCOVERY_POOL", 30, 8, 60)),
    completenessFloor: Math.round(boundedNumber("LIVE_SEARCH_MIN_PRODUCTS", 8, 1, 30)),
    minPerRetailer: Math.round(boundedNumber("LIVE_SEARCH_MIN_PER_RETAILER", 3, 1, 15)),
    // Firecrawl enforces a per-plan maxConcurrency (2 on the plan in use, readable
    // from /v2/team/queue-status). Exceeding it does not fail fast: the surplus is
    // queued server-side and the queue wait is charged against our own request
    // timeout, which is what produced SCRAPE_TIMEOUT on pages that answer in about
    // two seconds when the limit is respected. Measured on the same four retailer
    // URLs: concurrency 4 gave 7.2-14.9s and one timeout; concurrency 2 gave
    // 0.64-2.1s and four successes.
    extractionConcurrency: Math.round(boundedNumber("LIVE_SEARCH_EXTRACTION_CONCURRENCY", 2, 1, 16)),
    maxScrapesPerSearch: Math.round(boundedNumber("LIVE_SEARCH_MAX_SCRAPES", 8, 1, 60)),
    // Within the concurrency limit these pages answer in about two seconds, so the
    // ceiling exists only to bound a genuinely stuck page rather than to absorb
    // provider queueing.
    extractionPageTimeoutMs: Math.round(boundedNumber("LIVE_SEARCH_PAGE_TIMEOUT_MS", 15_000, 3_000, 25_000)),
    discoveryBudgetMs: Math.round(boundedNumber("LIVE_SEARCH_DISCOVERY_BUDGET_MS", 40_000, 5_000, 50_000)),
  };
}

function browserUseModel(): BrowserUseModel {
  const value = process.env.BROWSER_USE_MODEL?.trim() || "claude-sonnet-4.6";
  if (
    value === "bu-mini" ||
    value === "bu-max" ||
    value === "bu-ultra" ||
    value === "gemini-3-flash" ||
    value === "claude-sonnet-4.6" ||
    value === "claude-opus-4.6"
  ) {
    return value;
  }
  throw new Error("BROWSER_USE_MODEL is not a supported Browser Use v3 model.");
}

export function isLiveSearchConfigured(): boolean {
  return [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "SUPABASE_SECRET_KEY",
    "FIRECRAWL_API_KEY",
    "BROWSER_USE_API_KEY",
    "BROWSER_USE_WEBHOOK_SECRET",
    "CRON_SECRET",
    "ABUSE_HASH_SECRET",
  ].every((name) => (process.env[name]?.trim().length ?? 0) > 0);
}

export function isBrowserUseWebhookConfigured(): boolean {
  return (process.env.BROWSER_USE_WEBHOOK_SECRET?.trim().length ?? 0) > 0;
}

/** Meshy is deliberately optional for retailer search and required only after approval. */
export function isModelGenerationConfigured(): boolean {
  return ["MESHY_API_KEY", "MESHY_WEBHOOK_SECRET"].every(
    (name) => (process.env[name]?.trim().length ?? 0) > 0,
  );
}

/** Returns the server-only HMAC secret used for privacy-bounded product events. */
export function getProductEventHashSecret(): string {
  return requiredSecret("ABUSE_HASH_SECRET");
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for the live-search backend.`);
  }
  return value;
}

function requiredSecret(name: string): string {
  const value = requiredEnvironment(name);
  if (value.length < 32 || /^replace_|^your_|placeholder/i.test(value)) {
    throw new Error(`${name} must be a random secret of at least 32 characters.`);
  }
  return value;
}

function optionalEnvironment(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function optionalSecret(name: string): string | undefined {
  const value = optionalEnvironment(name);
  if (value === undefined) {
    return undefined;
  }
  if (value.length < 32 || /^replace_|^your_|placeholder/i.test(value)) {
    throw new Error(`${name} must be a random secret of at least 32 characters.`);
  }
  return value;
}

function requiredUrl(name: string): string {
  const value = requiredEnvironment(name);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      throw new Error("invalid");
    }
    return url.origin;
  } catch {
    throw new Error(`${name} must be an HTTPS origin.`);
  }
}

function boundedNumber(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name]?.trim();
  const value = raw === undefined || raw.length === 0 ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be from ${minimum} to ${maximum}.`);
  }
  return value;
}
