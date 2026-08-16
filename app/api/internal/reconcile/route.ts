import { NextResponse } from "next/server";
import { verifyBearerToken } from "@/lib/live-search/bearer";
import {
  getLiveSearchServerEnvironment,
  isLiveSearchConfigured,
} from "@/lib/live-search/env";
import { apiError, handleRouteError } from "@/lib/live-search/http";
import { reconcileLiveSearch } from "@/lib/live-search/reconciler";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const maxDuration = 60;

/** Consumes bounded durable work and polls provider tasks whose webhook was missed. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isLiveSearchConfigured()) {
    return apiError(503, "not_configured", "Live search is not configured in this environment.");
  }
  const environment = getLiveSearchServerEnvironment();
  const authorization = request.headers.get("authorization");
  if (!verifyBearerToken(authorization, environment.cronSecret)) {
    return apiError(401, "invalid_reconciler_token", "Reconciler authorization is invalid.");
  }

  try {
    const report = await reconcileLiveSearch();
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
