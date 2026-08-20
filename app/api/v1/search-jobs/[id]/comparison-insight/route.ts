import { NextResponse } from "next/server";
import { isLiveSearchConfigured } from "@/lib/live-search/env";
import { requireAuthenticatedUser } from "@/lib/live-search/auth";
import { apiError, handleRouteError } from "@/lib/live-search/http";
import { getWorkflowForOwner } from "@/lib/live-search/repository";
import { toDecisionCandidate } from "@/lib/live-search/decision-candidate";
import { buildComparisonVerdict } from "@/lib/live-search/comparison-verdict";
import { generateComparisonInsight } from "@/lib/live-search/comparison-insight";
import { isUuid } from "@/lib/live-search/validation";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const maxDuration = 15;

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>;
}

/**
 * Owner-scoped decision support for one comparison pair. The candidates are
 * loaded from the caller's own workflow — no client-supplied text ever reaches
 * the model — and the deterministic verdict is returned even when no model key
 * is configured or the provider fails.
 */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!isLiveSearchConfigured()) {
    return apiError(503, "not_configured", "Live search is not configured in this environment.");
  }
  const { id } = await context.params;
  const url = new URL(request.url);
  const firstId = url.searchParams.get("a");
  const secondId = url.searchParams.get("b");
  if (!isUuid(id) || !isUuid(firstId) || !isUuid(secondId) || firstId === secondId) {
    return apiError(400, "invalid_comparison_request", "Workflow id and two distinct candidate ids are required.");
  }
  try {
    const user = await requireAuthenticatedUser();
    const workflow = await getWorkflowForOwner(id, user.id);
    const firstCandidate = workflow.candidates.find((candidate) => candidate.id === firstId);
    const secondCandidate = workflow.candidates.find((candidate) => candidate.id === secondId);
    if (firstCandidate === undefined || secondCandidate === undefined) {
      return apiError(404, "candidate_not_found", "Both candidates must belong to this retailer check.");
    }
    const first = toDecisionCandidate(workflow, firstCandidate);
    const second = toDecisionCandidate(workflow, secondCandidate);
    const verdict = buildComparisonVerdict(first, second);
    const insight = await generateComparisonInsight({
      measurement: workflow.measurement,
      first,
      second,
    });
    return NextResponse.json(
      {
        summary: verdict.summary,
        factors: verdict.factors,
        ...(insight === undefined ? {} : { insight }),
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
