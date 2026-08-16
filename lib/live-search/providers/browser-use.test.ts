import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/live-search/env", () => ({
  getLiveSearchServerEnvironment: () => ({
    browserUseApiKey: "browser-key",
    browserUseMaxCostUsd: 0.35,
    maxResults: 12,
  }),
}));

import { createBrowserSearchSession, verifyBrowserUseWebhook } from "./browser-use";

const SECRET = "browser-use-webhook-secret-at-least-32-characters";
const NOW_SECONDS = 1_800_000_000;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createBrowserSearchSession", () => {
  it("sends the measured envelope, balanced retailer goal, and strict confidence schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "session-123",
      status: "created",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createBrowserSearchSession(
      "narrow oak bookcase",
      ["ikea-au", "kmart-au"],
      {
        widthMm: 900,
        heightMm: 1_800,
        depthMm: 350,
        accessWidthMm: 820,
        uncertaintyMm: 25,
        source: "manual",
      },
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "claude-sonnet-4.6",
      proxyCountryCode: "au",
      maxCostUsd: 0.35,
    });
    expect(body.task).toContain('"widthMm":900');
    expect(body.task).toContain("Aim for 6 source-qualified products from each requested retailer");
    expect(body.outputSchema).toMatchObject({
      properties: {
        products: {
          items: {
            properties: { confidence: { const: "high" } },
            required: expect.arrayContaining(["confidence"]),
          },
        },
      },
    });
  });
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === "object" && value !== null) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}

function sign(rawBody: string, timestamp: string, secret = SECRET): string {
  const parsed = JSON.parse(rawBody) as unknown;
  const canonicalBody = JSON.stringify(canonicalize(parsed));
  return createHmac("sha256", secret)
    .update(`${timestamp}.${canonicalBody}`)
    .digest("hex");
}

describe("verifyBrowserUseWebhook", () => {
  it("accepts the documented timestamp plus canonical-JSON HMAC", () => {
    const rawBody = JSON.stringify({
      z: "last",
      payload: { status: "finished", task_id: "task-123" },
      a: [{ y: 2, x: 1 }],
    });
    const timestamp = String(NOW_SECONDS - 10);

    expect(
      verifyBrowserUseWebhook(rawBody, sign(rawBody, timestamp), timestamp, SECRET, NOW_SECONDS),
    ).toBe(true);
  });

  it("does not authenticate a signature over raw key order instead of canonical JSON", () => {
    const rawBody = '{"z":1,"a":2}';
    const timestamp = String(NOW_SECONDS);
    const rawSignature = createHmac("sha256", SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    expect(
      verifyBrowserUseWebhook(rawBody, rawSignature, timestamp, SECRET, NOW_SECONDS),
    ).toBe(false);
  });

  it("accepts the replay-window boundary and rejects stale or future replays", () => {
    const rawBody = JSON.stringify({ type: "agent.task.status_update", payload: { task_id: "task-1" } });
    const boundaryTimestamp = String(NOW_SECONDS - 300);
    const staleTimestamp = String(NOW_SECONDS - 301);
    const futureTimestamp = String(NOW_SECONDS + 301);

    expect(
      verifyBrowserUseWebhook(
        rawBody,
        sign(rawBody, boundaryTimestamp),
        boundaryTimestamp,
        SECRET,
        NOW_SECONDS,
      ),
    ).toBe(true);
    expect(
      verifyBrowserUseWebhook(rawBody, sign(rawBody, staleTimestamp), staleTimestamp, SECRET, NOW_SECONDS),
    ).toBe(false);
    expect(
      verifyBrowserUseWebhook(rawBody, sign(rawBody, futureTimestamp), futureTimestamp, SECRET, NOW_SECONDS),
    ).toBe(false);
  });

  it.each([
    ["a missing signature", null, String(NOW_SECONDS), "{}"],
    ["a missing timestamp", "00".repeat(32), null, "{}"],
    ["a non-numeric timestamp", "00".repeat(32), "1e3", "{}"],
    ["an unsafe integer timestamp", "00".repeat(32), "999999999999999999999", "{}"],
    ["malformed JSON", "00".repeat(32), String(NOW_SECONDS), "{"],
    ["non-hex signature text", "z".repeat(64), String(NOW_SECONDS), "{}"],
    ["a truncated signature", "00".repeat(31), String(NOW_SECONDS), "{}"],
  ])("rejects %s", (_label, signature, timestamp, rawBody) => {
    expect(
      verifyBrowserUseWebhook(rawBody, signature, timestamp, SECRET, NOW_SECONDS),
    ).toBe(false);
  });

  it("rejects a validly shaped signature made with another secret", () => {
    const rawBody = JSON.stringify({ payload: { task_id: "task-123" } });
    const timestamp = String(NOW_SECONDS);

    expect(
      verifyBrowserUseWebhook(
        rawBody,
        sign(rawBody, timestamp, "a-different-secret-at-least-32-characters"),
        timestamp,
        SECRET,
        NOW_SECONDS,
      ),
    ).toBe(false);
  });
});
