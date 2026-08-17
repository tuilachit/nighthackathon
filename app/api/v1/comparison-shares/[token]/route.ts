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

interface RouteContext {
  readonly params: Promise<{ readonly token: string }>;
}

/** Resolves a read-only immutable share without granting owner authority. */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { token } = await context.params;
  if (!isPublicShareToken(token)) {
    return apiError(404, "share_not_found", "This comparison link is invalid or expired.");
  }
  try {
    const share = await resolveComparisonShare(hashPublicShareToken(token));
    if (
      share === undefined ||
      share.schemaVersion !== PUBLIC_SHARE_SCHEMA_VERSION ||
      !isUnexpiredPublicShare(share.expiresAt) ||
      !isPublicSharedComparisonSnapshot(share.payload)
    ) {
      return apiError(404, "share_not_found", "This comparison link is invalid or expired.");
    }
    const maxAge = Math.max(0, Math.floor((Date.parse(share.expiresAt) - Date.now()) / 1_000));
    return NextResponse.json(
      { snapshot: share.payload, expiresAt: share.expiresAt },
      {
        headers: {
          "Cache-Control": `public, max-age=60, s-maxage=${maxAge}, stale-while-revalidate=300`,
        },
      },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
