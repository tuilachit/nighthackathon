import { NextResponse } from "next/server";
import { apiError, handleRouteError } from "@/lib/live-search/http";
import {
  hashPublicShareToken,
  isPublicShareToken,
  isPublicSharedComparisonSnapshot,
  isUnexpiredPublicShare,
  PUBLIC_SHARE_SCHEMA_VERSION,
} from "@/lib/live-search/public-share";
import { resolveComparisonShare } from "@/lib/live-search/repository";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";

const NO_STORE_CACHE_CONTROL = "private, no-store, max-age=0";

interface RouteContext {
  readonly params: Promise<{ readonly token: string }>;
}

/** Resolves a read-only immutable share without granting owner authority. */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { token } = await context.params;
  if (!isPublicShareToken(token)) {
    return preventShareCaching(
      apiError(404, "share_not_found", "This comparison link is invalid or expired."),
    );
  }
  try {
    const share = await resolveComparisonShare(hashPublicShareToken(token));
    if (
      share === undefined ||
      share.schemaVersion !== PUBLIC_SHARE_SCHEMA_VERSION ||
      !isUnexpiredPublicShare(share.expiresAt) ||
      !isPublicSharedComparisonSnapshot(share.payload)
    ) {
      return preventShareCaching(
        apiError(404, "share_not_found", "This comparison link is invalid or expired."),
      );
    }
    return preventShareCaching(
      NextResponse.json({ snapshot: share.payload, expiresAt: share.expiresAt }),
    );
  } catch (error) {
    return preventShareCaching(handleRouteError(error));
  }
}

function preventShareCaching(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", NO_STORE_CACHE_CONTROL);
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Vercel-CDN-Cache-Control", "no-store");
  return response;
}
