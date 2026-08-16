import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { deriveActorHash } from "./abuse";

const SECRET = "abuse-hash-secret-that-is-at-least-32-characters";

describe("deriveActorHash", () => {
  it("is stable for the trusted network identity without revealing it", () => {
    const request = new Request("https://fitment.example/api/v1/search-jobs", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.42, 10.0.0.1",
        "user-agent": "phone-browser",
      },
    });
    const first = deriveActorHash(request, "owner-one", SECRET);
    const second = deriveActorHash(request, "owner-two", SECRET);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("203.0.113.42");
  });

  it("falls back to the authenticated owner when the Vercel header is absent", () => {
    const request = new Request("https://fitment.example/api/v1/search-jobs");

    expect(deriveActorHash(request, "owner-one", SECRET)).not.toBe(
      deriveActorHash(request, "owner-two", SECRET),
    );
  });
});
