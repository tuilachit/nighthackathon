import { defineConfig, devices } from "@playwright/test";

const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).flatMap(([key, value]) =>
    value === undefined || isSensitiveEnvironmentName(key)
      ? []
      : [[key, value]],
  ),
);

function isSensitiveEnvironmentName(name: string): boolean {
  return /(api_?key|secret|token|password|supabase|turnstile|meshy|browser_use|openai|anthropic|firecrawl|scraping)/i.test(
    name,
  );
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  webServer: {
    command: "npm run dev -- --port 3010",
    url: "http://127.0.0.1:3010",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...inheritedEnvironment,
      // E2E owns every live response and must never open a real Realtime socket.
      NEXT_PUBLIC_SUPABASE_URL: "https://your-project-ref.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_your_key",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      SUPABASE_SECRET_KEY: "",
      BROWSER_USE_API_KEY: "",
      BROWSER_USE_WEBHOOK_SECRET: "",
      MESHY_API_KEY: "",
      MESHY_WEBHOOK_SECRET: "",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      FIRECRAWL_API_KEY: "",
      CRON_SECRET: "",
      ABUSE_HASH_SECRET: "",
      ENABLE_MESHY: "false",
    },
  },
  use: {
    baseURL: "http://127.0.0.1:3010",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      // This is responsive browser emulation, not real-device AR validation.
      name: "pixel-5-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      // WebKit with the iPhone Safari profile covers the touch/viewport journey;
      // physical-device Quick Look remains a separate manual acceptance check.
      name: "ios-safari",
      use: { ...devices["iPhone 13"] },
    },
  ],
});
