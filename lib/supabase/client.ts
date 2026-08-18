"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

/** Returns the singleton browser client used for Auth and compact Realtime updates. */
export function createSupabaseBrowserClient() {
  if (browserClient !== undefined) {
    return browserClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (
    url === undefined ||
    publishableKey === undefined ||
    !hasUsableSupabasePublicEnvironment(url, publishableKey)
  ) {
    throw new Error("Live search is not configured.");
  }
  browserClient = createBrowserClient(url, publishableKey);
  return browserClient;
}

/** Prevents example configuration from opening noisy or misleading Realtime sockets. */
export function hasUsableSupabasePublicEnvironment(
  url: string | undefined,
  publishableKey: string | undefined,
): boolean {
  return (
    url !== undefined &&
    publishableKey !== undefined &&
    url !== "https://your-project-ref.supabase.co" &&
    publishableKey !== "sb_publishable_your_key"
  );
}
