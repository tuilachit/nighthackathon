import { defineConfig, devices } from "@playwright/test";

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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
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
