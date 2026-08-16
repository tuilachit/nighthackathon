import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getLiveSearchServerEnvironment, getPublicSupabaseEnvironment } from "@/lib/live-search/env";

const SUPABASE_REQUEST_TIMEOUT_MS = 12_000;

/** Creates a cookie-aware Supabase client that preserves the caller's RLS identity. */
export async function createSupabaseServerClient() {
  const environment = getPublicSupabaseEnvironment();
  return createCookieClient(environment.url, environment.publishableKey);
}

/** Creates the anonymous-auth client while forwarding Vercel's trusted client IP. */
export async function createSupabaseAnonymousAuthClient(forwardedFor?: string) {
  const environment = getLiveSearchServerEnvironment();
  return createCookieClient(
    environment.url,
    environment.secretKey,
    forwardedFor === undefined
      ? undefined
      : { "Sb-Forwarded-For": forwardedFor },
  );
}

async function createCookieClient(
  url: string,
  key: string,
  headers?: Readonly<Record<string, string>>,
) {
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    ...(headers === undefined ? {} : { global: { headers } }),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        for (const value of values) {
          cookieStore.set(value.name, value.value, value.options);
        }
      },
    },
  });
}

/** Creates the privileged worker client. Never import this module from client code. */
export function createSupabaseAdminClient() {
  const environment = getLiveSearchServerEnvironment();
  return createClient(environment.url, environment.secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { fetch: fetchWithTimeout },
  });
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS);
  const signal = init?.signal == null
    ? timeoutSignal
    : AbortSignal.any([init.signal, timeoutSignal]);
  return globalThis.fetch(input, { ...init, signal });
}
