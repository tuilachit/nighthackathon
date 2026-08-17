import { after } from "next/server";
import { NextResponse } from "next/server";
import { isLiveSearchConfigured } from "@/lib/live-search/env";
import { requireAuthenticatedUser } from "@/lib/live-search/auth";
import { apiError, handleRouteError } from "@/lib/live-search/http";
import { approveCandidate } from "@/lib/live-search/repository";
import { readBoundedJson } from "@/lib/live-search/request";
import { dispatchModelWorkflow } from "@/lib/live-search/service";
import { isUuid } from "@/lib/live-search/validation";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const maxDuration = 30;

const MAX_APPROVAL_BYTES = 2 * 1024;

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isLiveSearchConfigured()) {
    return apiError(503, "not_configured", "Live search is not configured in this environment.");
  }
  const { id } = await context.params;
  if (!isUuid(id)) {
    return apiError(400, "invalid_workflow_id", "Workflow id must be a UUID.");
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (idempotencyKey === undefined || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
    return apiError(400, "invalid_idempotency_key", "Idempotency-Key must contain 16 to 200 characters.");
  }
  try {
    const body = await readBoundedJson(request, MAX_APPROVAL_BYTES);
    const candidateId = readCandidateId(body);
    if (candidateId === undefined) {
      return apiError(400, "invalid_candidate_id", "candidateId must be a UUID.");
    }
    const user = await requireAuthenticatedUser();
    const approval = await approveCandidate(user.id, id, candidateId, idempotencyKey);
    if (approval.state !== "asset_ready") {
      after(async () => {
        try {
          await dispatchModelWorkflow(approval.workflowId, approval.requestHash);
        } catch (error) {
          console.error("Deferred model dispatch failed", error);
        }
      });
    }
    return NextResponse.json(
      { workflowId: approval.workflowId, candidateId: approval.candidateId, state: approval.state },
      {
        status: approval.state === "asset_ready" ? 200 : 202,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

function readCandidateId(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  const candidateId = (input as Record<string, unknown>).candidateId;
  return isUuid(candidateId) ? candidateId : undefined;
}
