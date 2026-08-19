import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getLiveSearchServerEnvironment, isLiveSearchConfigured } from "./env";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "turnstile-site-key");
  vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");
  vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-key");
  vi.stubEnv("BROWSER_USE_API_KEY", "browser-key");
  vi.stubEnv("BROWSER_USE_WEBHOOK_SECRET", "b".repeat(32));
  vi.stubEnv("MESHY_API_KEY", "meshy-key");
  vi.stubEnv("MESHY_WEBHOOK_SECRET", "m".repeat(32));
  vi.stubEnv("CRON_SECRET", "c".repeat(32));
  vi.stubEnv("ABUSE_HASH_SECRET", "a".repeat(32));
  vi.stubEnv("BROWSER_USE_MODEL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getLiveSearchServerEnvironment", () => {
  it("defaults difficult rendered-page recovery to Claude Sonnet", () => {
    expect(getLiveSearchServerEnvironment().browserUseModel).toBe(
      "claude-sonnet-4.6",
    );
  });

  it("keeps the Firecrawl key server-only in the live environment", () => {
    expect(getLiveSearchServerEnvironment().firecrawlApiKey).toBe("fc-test-key");
  });

  it("does not require Meshy before a user approves 3D generation", () => {
    vi.stubEnv("MESHY_API_KEY", "");
    vi.stubEnv("MESHY_WEBHOOK_SECRET", "");

    expect(isLiveSearchConfigured()).toBe(true);
    expect(getLiveSearchServerEnvironment().meshyApiKey).toBeUndefined();
  });

  it("allows the rendered-page fallback enough budget to complete", () => {
    expect(getLiveSearchServerEnvironment().browserUseMaxCostUsd).toBe(1);
  });

  it("allows an explicit supported model override", () => {
    vi.stubEnv("BROWSER_USE_MODEL", "claude-sonnet-4.6");
    expect(getLiveSearchServerEnvironment().browserUseModel).toBe(
      "claude-sonnet-4.6",
    );
  });

  it("fails closed for an unknown provider model", () => {
    vi.stubEnv("BROWSER_USE_MODEL", "invented-model");
    expect(() => getLiveSearchServerEnvironment()).toThrow(
      "BROWSER_USE_MODEL is not a supported Browser Use v3 model.",
    );
  });
});
