import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/live-search/auth";
import { isLiveSearchConfigured } from "@/lib/live-search/env";
import { apiError, handleRouteError } from "@/lib/live-search/http";
import { stopBrowserSearchSession } from "@/lib/live-search/providers/browser-use";
import { cancelWorkflowForOwner } from "@/lib/live-search/repository";
import { isUuid } from "@/lib/live-search/validation";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const maxDuration = 20;

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

/** Durably cancels owner work first, then best-effort stops an accepted Browser Use session. */
export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isLiveSearchConfigured()) {
    return apiError(503, "not_configured", "Live search is not configured in this environment.");
  }
  const { id } = await context.params;
  if (!isUuid(id)) {
    return apiError(400, "invalid_workflow_id", "Workflow id must be a UUID.");
  }
  try {
    const user = await requireAuthenticatedUser();
    const cancelled = await cancelWorkflowForOwner(user.id, id);
    let providerStop: "not-needed" | "requested" | "failed" = "not-needed";
    if (!cancelled.alreadyTerminal && cancelled.browserExternalId !== undefined) {
      try {
        await stopBrowserSearchSession(cancelled.browserExternalId);
        providerStop = "requested";
      } catch (error) {
        providerStop = "failed";
        console.error("Browser Use session stop failed after durable cancellation", error);
      }
    }
    return NextResponse.json(
      {
        workflowId: cancelled.workflowId,
        state: cancelled.state,
        alreadyTerminal: cancelled.alreadyTerminal,
        providerStop,
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
