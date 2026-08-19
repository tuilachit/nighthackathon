import "server-only";

export interface PublicSupabaseEnvironment {
  readonly url: string;
  readonly publishableKey: string;
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
  readonly meshyApiKey: string;
  readonly meshyWebhookSecret: string;
  readonly cronSecret: string;
  readonly abuseHashSecret: string;
  readonly browserUseMaxCostUsd: number;
  readonly maxResults: number;
}

export function getPublicSupabaseEnvironment(): PublicSupabaseEnvironment {
  return {
    url: requiredUrl("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}

export function getLiveSearchServerEnvironment(): LiveSearchServerEnvironment {
  return {
    ...getPublicSupabaseEnvironment(),
    secretKey: requiredEnvironment("SUPABASE_SECRET_KEY"),
    firecrawlApiKey: requiredEnvironment("FIRECRAWL_API_KEY"),
    browserUseApiKey: requiredEnvironment("BROWSER_USE_API_KEY"),
    browserUseWebhookSecret: requiredSecret("BROWSER_USE_WEBHOOK_SECRET"),
    browserUseModel: browserUseModel(),
    meshyApiKey: requiredEnvironment("MESHY_API_KEY"),
    meshyWebhookSecret: requiredSecret("MESHY_WEBHOOK_SECRET"),
    cronSecret: requiredSecret("CRON_SECRET"),
    abuseHashSecret: requiredSecret("ABUSE_HASH_SECRET"),
    browserUseMaxCostUsd: boundedNumber("BROWSER_USE_MAX_COST_USD", 1, 0.05, 2),
    maxResults: Math.round(boundedNumber("LIVE_SEARCH_MAX_RESULTS", 6, 3, 20)),
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
    "MESHY_API_KEY",
    "MESHY_WEBHOOK_SECRET",
    "CRON_SECRET",
    "ABUSE_HASH_SECRET",
  ].every((name) => (process.env[name]?.trim().length ?? 0) > 0);
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
