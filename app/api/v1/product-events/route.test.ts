import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventSecret: vi.fn(),
  recordEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/live-search/env", () => ({
  getProductEventHashSecret: mocks.eventSecret,
}));

vi.mock("@/lib/live-search/repository", () => ({
  recordProductEvent: mocks.recordEvent,
}));

import { POST } from "./route";

const journeyToken = "abcdefghijklmnopqrstuv";
const validEvent = {
  name: "search_submitted",
  journeyToken,
  properties: {
    intent: "prompt",
    retailer_count: 2,
    cache_policy: "prefer_recent",
  },
};

function eventRequest(
  body: unknown = validEvent,
  headers: Readonly<Record<string, string>> = {},
): Request {
  return new Request("https://fitment.example/api/v1/product-events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://fitment.example",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("privacy-bounded product event route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.eventSecret.mockReturnValue("event-hash-secret-that-is-at-least-32-characters");
    mocks.recordEvent.mockResolvedValue(true);
  });

  it("records only an HMAC journey identity and allowlisted properties", async () => {
    const response = await POST(eventRequest());

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ recorded: true });
    expect(mocks.recordEvent).toHaveBeenCalledWith({
      eventName: "search_submitted",
      journeyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      properties: validEvent.properties,
    });
    expect(JSON.stringify(mocks.recordEvent.mock.calls)).not.toContain(journeyToken);
  });

  it.each([
    { queryText: "oak shelf" },
    { widthMm: 900 },
    { workflowId: "11111111-1111-4111-8111-111111111111" },
    { productUrl: "https://retailer.example/item" },
  ])("rejects forbidden or identifying event properties: %o", async (forbidden) => {
    const response = await POST(eventRequest({
      ...validEvent,
      properties: { ...validEvent.properties, ...forbidden },
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_product_event" },
    });
    expect(mocks.eventSecret).not.toHaveBeenCalled();
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });

  it("rejects cross-origin submissions before parsing or persistence", async () => {
    const response = await POST(eventRequest(validEvent, {
      origin: "https://attacker.example",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "cross_origin_denied" },
    });
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });

  it.each<Readonly<Record<string, string>>>([
    { "sec-gpc": "1" },
    { dnt: "1" },
  ])("honours privacy signals with a no-op 204: %o", async (headers) => {
    const response = await POST(eventRequest(validEvent, headers));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(mocks.eventSecret).not.toHaveBeenCalled();
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });
});
