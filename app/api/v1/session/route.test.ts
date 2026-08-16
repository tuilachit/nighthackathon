import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  createAuthClient: vi.fn(),
  getClaims: vi.fn(),
  signInAnonymously: vi.fn(),
}));

vi.mock("@/lib/live-search/env", () => ({
  isLiveSearchConfigured: mocks.configured,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAnonymousAuthClient: mocks.createAuthClient,
}));

import { POST } from "./route";

describe("live-search session route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.createAuthClient.mockResolvedValue({
      auth: {
        getClaims: mocks.getClaims,
        signInAnonymously: mocks.signInAnonymously,
      },
    });
    mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null });
    mocks.signInAnonymously.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  it("reports not configured without creating an auth client", async () => {
    mocks.configured.mockReturnValue(false);

    const response = await POST(sessionRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "not_configured" } });
    expect(mocks.createAuthClient).not.toHaveBeenCalled();
  });

  it("reuses a verified existing session without signing in again", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user-1", is_anonymous: false } },
      error: null,
    });

    const response = await POST(sessionRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: true, anonymous: false });
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it("creates an anonymous session when no verified session exists", async () => {
    const response = await POST(sessionRequest("203.0.113.42"));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ authenticated: true, anonymous: true });
    expect(mocks.signInAnonymously).toHaveBeenCalledOnce();
    expect(mocks.signInAnonymously).toHaveBeenCalledWith({
      options: { captchaToken: "turnstile-token-at-least-twenty-characters" },
    });
    expect(mocks.createAuthClient).toHaveBeenCalledWith("203.0.113.42");
  });

  it("requires a CAPTCHA token before creating a new anonymous identity", async () => {
    const response = await POST(sessionRequest(undefined, {}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "captcha_required" } });
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it("maps an anonymous sign-in failure to an unavailable response", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.signInAnonymously.mockResolvedValue({
      data: { user: null },
      error: { message: "auth unavailable" },
    });

    const response = await POST(sessionRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "authentication_unavailable" },
    });
    consoleError.mockRestore();
  });
});

function sessionRequest(
  forwardedFor?: string,
  body: unknown = { captchaToken: "turnstile-token-at-least-twenty-characters" },
): Request {
  return new Request("https://fitment.example/api/v1/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(forwardedFor === undefined ? {} : { "x-vercel-forwarded-for": forwardedFor }),
    },
    body: JSON.stringify(body),
  });
}
