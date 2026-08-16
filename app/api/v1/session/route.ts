import { NextResponse } from "next/server";
import { apiError, handleRouteError } from "@/lib/live-search/http";
import { isLiveSearchConfigured } from "@/lib/live-search/env";
import { readBoundedJson } from "@/lib/live-search/request";
import { createSupabaseAnonymousAuthClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const preferredRegion = "syd1";

const MAX_SESSION_BYTES = 4 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  if (!isLiveSearchConfigured()) {
    return apiError(503, "not_configured", "Live search is not configured in this environment.");
  }
  const forwardedFor = request.headers
    .get("x-vercel-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();
  const supabase = await createSupabaseAnonymousAuthClient(
    forwardedFor === undefined || forwardedFor.length === 0 ? undefined : forwardedFor,
  );
  const existing = await supabase.auth.getClaims();
  if (typeof existing.data?.claims?.sub === "string") {
    return NextResponse.json({ authenticated: true, anonymous: existing.data.claims.is_anonymous === true });
  }

  try {
    const body = await readBoundedJson(request, MAX_SESSION_BYTES);
    const captchaToken = readCaptchaToken(body);
    if (captchaToken === undefined) {
      return apiError(400, "captcha_required", "Complete the anti-abuse check to start live search.");
    }
    const { data, error } = await supabase.auth.signInAnonymously({
      options: { captchaToken },
    });
    if (error !== null || data.user === null) {
      console.error("Anonymous Supabase sign-in failed", error);
      return apiError(
        error?.code === "captcha_failed" ? 400 : 503,
        error?.code === "captcha_failed" ? "captcha_failed" : "authentication_unavailable",
        error?.code === "captcha_failed"
          ? "The anti-abuse check expired. Complete it again."
          : "A secure guest session could not be created.",
      );
    }
    return NextResponse.json({ authenticated: true, anonymous: true }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

function readCaptchaToken(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  const token = (input as Record<string, unknown>).captchaToken;
  return typeof token === "string" && token.length >= 20 && token.length <= 4_000
    ? token
    : undefined;
}
