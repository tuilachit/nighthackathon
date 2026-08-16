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
  if (url === undefined || publishableKey === undefined) {
    throw new Error("Live search is not configured.");
  }
  browserClient = createBrowserClient(url, publishableKey);
  return browserClient;
}
