import { describe, expect, it } from "vitest";
import { hasUsableSupabasePublicEnvironment } from "./client";

describe("Supabase browser environment", () => {
  it("rejects missing and documented placeholder values", () => {
    expect(hasUsableSupabasePublicEnvironment(undefined, undefined)).toBe(false);
    expect(
      hasUsableSupabasePublicEnvironment(
        "https://your-project-ref.supabase.co",
        "sb_publishable_your_key",
      ),
    ).toBe(false);
  });

  it("accepts an explicitly configured public client", () => {
    expect(
      hasUsableSupabasePublicEnvironment(
        "https://project-ref.supabase.co",
        "sb_publishable_test-key",
      ),
    ).toBe(true);
  });
});
