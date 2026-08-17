import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import AgentPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

describe("legacy /agent redirect", () => {
  it("redirects the old entry point into the unified fit journey", async () => {
    await expect(
      AgentPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/fit");
  });

  it("preserves the durable owner job handle", async () => {
    await expect(
      AgentPage({
        searchParams: Promise.resolve({
          job: "00000000-0000-4000-8000-000000000001",
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(
      "/fit?job=00000000-0000-4000-8000-000000000001",
    );
  });
});
