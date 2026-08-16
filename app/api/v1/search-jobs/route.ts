import { after } from "next/server";
import { NextResponse } from "next/server";
import { deriveActorHash } from "@/lib/live-search/abuse";
import { getLiveSearchServerEnvironment, isLiveSearchConfigured } from "@/lib/live-search/env";
import { requireAuthenticatedUser } from "@/lib/live-search/auth";
import { apiError, handleRouteError } from "@/lib/live-search/http";
import { createWorkflow } from "@/lib/live-search/repository";
import { readBoundedJson } from "@/lib/live-search/request";
import { dispatchSearchWorkflow, liveSearchRequestHash } from "@/lib/live-search/service";
import { validateCreateLiveSearchRequest } from "@/lib/live-search/validation";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const maxDuration = 30;

const MAX_COMMAND_BYTES = 16 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  if (!isLiveSearchConfigured()) {
    return apiError(503, "not_configured", "Live search is not configured in this environment.");
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (idempotencyKey === undefined || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
    return apiError(400, "invalid_idempotency_key", "Idempotency-Key must contain 16 to 200 characters.");
  }
  try {
    const body = await readBoundedJson(request, MAX_COMMAND_BYTES);
    const validation = validateCreateLiveSearchRequest(body);
    if (!validation.ok || validation.value === undefined) {
      return apiError(400, "invalid_request", "The live-search request is invalid.", validation.errors);
    }
    const environment = getLiveSearchServerEnvironment();
    const user = await requireAuthenticatedUser();
    const actorHash = deriveActorHash(request, user.id, environment.abuseHashSecret);
    const requestHash = liveSearchRequestHash(validation.value);
    const workflow = await createWorkflow(
      user.id,
      actorHash,
      validation.value,
      requestHash,
      idempotencyKey,
    );
    after(async () => {
      try {
        await dispatchSearchWorkflow(workflow.workflowId, requestHash);
      } catch (error) {
        console.error("Deferred search dispatch failed", error);
      }
    });
    return NextResponse.json(
      { workflowId: workflow.workflowId, state: workflow.state, reused: workflow.reused },
      {
        status: 202,
        headers: {
          "Cache-Control": "no-store",
          Location: `/api/v1/search-jobs/${workflow.workflowId}`,
        },
      },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
