import { NextResponse } from "next/server";
import { isLiveSearchConfigured } from "@/lib/live-search/env";
import { requireAuthenticatedUser } from "@/lib/live-search/auth";
import { apiError, handleRouteError } from "@/lib/live-search/http";
import { getWorkflowForOwner } from "@/lib/live-search/repository";
import { publicWorkflowErrorMessage } from "@/lib/live-search/public-errors";
import { isUuid } from "@/lib/live-search/validation";

export const runtime = "nodejs";
export const preferredRegion = "syd1";

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isLiveSearchConfigured()) {
    return apiError(503, "not_configured", "Live search is not configured in this environment.");
  }
  const { id } = await context.params;
  if (!isUuid(id)) {
    return apiError(400, "invalid_workflow_id", "Workflow id must be a UUID.");
  }
  try {
    const user = await requireAuthenticatedUser();
    const workflow = await getWorkflowForOwner(id, user.id);
    const publicWorkflow = workflow.error === undefined
      ? workflow
      : {
          ...workflow,
          error: {
            code: workflow.error.code,
            message: publicWorkflowErrorMessage(workflow.error.code),
          },
        };
    return NextResponse.json(publicWorkflow, {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
