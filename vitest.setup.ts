import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";

/**
 * Paid providers must never be reached from automated tests. Every provider
 * module accepts an injected fetch for exactly this reason; this guard turns a
 * forgotten injection into a loud failure instead of a silent charge.
 */
const PAID_PROVIDER_HOSTS = [
  "api.firecrawl.dev",
  "api.openai.com",
  "api.browser-use.com",
  "api.meshy.ai",
  "api.anthropic.com",
] as const;

beforeAll(() => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      host = "";
    }
    if (PAID_PROVIDER_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
      throw new Error(
        `Test attempted a real request to paid provider ${host}. ` +
        "Inject a fetch double instead of using the global fetch.",
      );
    }
    return realFetch(input, init);
  }) as typeof fetch;
});

if (window.localStorage === undefined) {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
