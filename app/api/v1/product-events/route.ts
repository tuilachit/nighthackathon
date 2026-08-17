import { NextResponse } from "next/server";
import { getProductEventHashSecret } from "@/lib/live-search/env";
import { apiError, handleRouteError } from "@/lib/live-search/http";
import {
  hashJourneyToken,
  validateProductEvent,
} from "@/lib/live-search/product-events";
import { recordProductEvent } from "@/lib/live-search/repository";
import { readBoundedJson } from "@/lib/live-search/request";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const maxDuration = 10;

const MAX_EVENT_BYTES = 2 * 1024;

/** Records only allowlisted, measurement-free funnel metadata. */
export async function POST(request: Request): Promise<NextResponse> {
  if (privacySignalEnabled(request)) {
    return new NextResponse(null, { status: 204 });
  }
  if (!isSameOriginRequest(request)) {
    return apiError(403, "cross_origin_denied", "Product events must come from this site.");
  }
  try {
    const body = await readBoundedJson(request, MAX_EVENT_BYTES);
    let event: ReturnType<typeof validateProductEvent>;
    try {
      event = validateProductEvent(body);
    } catch (error) {
      return apiError(
        400,
        "invalid_product_event",
        error instanceof Error ? error.message : "The product event is invalid.",
      );
    }
    const secret = getProductEventHashSecret();
    const recorded = await recordProductEvent({
      eventName: event.name,
      journeyHash: hashJourneyToken(event.journeyToken, secret),
      properties: event.properties,
    });
    return NextResponse.json(
      { recorded },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

function privacySignalEnabled(request: Request): boolean {
  return request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1";
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    return origin === new URL(request.url).origin;
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin";
}
