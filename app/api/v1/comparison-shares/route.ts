import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/live-search/auth";
import { apiError, handleRouteError } from "@/lib/live-search/http";
import {
  buildPublicSharedComparisonSnapshot,
  createPublicShareToken,
  PUBLIC_SHARE_SCHEMA_VERSION,
} from "@/lib/live-search/public-share";
import {
  createComparisonShare,
  getWorkflowForOwner,
} from "@/lib/live-search/repository";
import { readBoundedJson } from "@/lib/live-search/request";
import { isUuid } from "@/lib/live-search/validation";
import { stableJson } from "@/lib/live-search/hashing";
import type {
  LiveSearchWorkflow,
  PublicSharedComparisonSnapshot,
} from "@/lib/live-search/types";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const maxDuration = 15;

const MAX_SHARE_BYTES = 4 * 1024;

/** Creates an immutable public snapshot from owner-authorized server rows. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readBoundedJson(request, MAX_SHARE_BYTES);
    const command = parseShareCommand(body);
    if (command === undefined) {
      return apiError(
        400,
        "invalid_share_request",
        "One to three unique workflow and candidate selections are required.",
      );
    }
    const user = await requireAuthenticatedUser();
    const workflows = new Map<string, LiveSearchWorkflow>();
    await Promise.all([...new Set(command.selections.map((selection) => selection.workflowId))].map(
      async (workflowId) => {
        workflows.set(workflowId, await getWorkflowForOwner(workflowId, user.id));
      },
    ));
    let payload;
    try {
      payload = buildMultiWorkflowSnapshot(command.selections, workflows);
    } catch (error) {
      return apiError(
        400,
        "invalid_share_selection",
        error instanceof Error ? error.message : "The comparison selection is invalid.",
      );
    }
    const { token, tokenHash } = createPublicShareToken();
    const stored = await createComparisonShare({
      ownerId: user.id,
      tokenHash,
      schemaVersion: PUBLIC_SHARE_SCHEMA_VERSION,
      payload,
    });
    return NextResponse.json(
      {
        path: `/fit/share/${token}`,
        expiresAt: stored.expiresAt,
      },
      { status: 201, headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

interface ShareSelection {
  readonly workflowId: string;
  readonly candidateId: string;
}

function parseShareCommand(input: unknown): {
  readonly selections: readonly ShareSelection[];
} | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  const row = input as Record<string, unknown>;
  const selections = Array.isArray(row.selections)
    ? row.selections.flatMap((entry) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
        const selection = entry as Record<string, unknown>;
        return isUuid(selection.workflowId) && isUuid(selection.candidateId)
          ? [{ workflowId: selection.workflowId, candidateId: selection.candidateId }]
          : [];
      })
    : isUuid(row.workflowId) && Array.isArray(row.candidateIds)
      ? row.candidateIds.flatMap((candidateId) => isUuid(candidateId)
          ? [{ workflowId: row.workflowId as string, candidateId }]
          : [])
      : [];
  if (
    selections.length < 1 ||
    selections.length > 3 ||
    (Array.isArray(row.selections) && selections.length !== row.selections.length) ||
    new Set(selections.map((selection) => `${selection.workflowId}:${selection.candidateId}`)).size !== selections.length
  ) {
    return undefined;
  }
  return { selections };
}

function buildMultiWorkflowSnapshot(
  selections: readonly ShareSelection[],
  workflows: ReadonlyMap<string, LiveSearchWorkflow>,
): PublicSharedComparisonSnapshot {
  const firstWorkflow = workflows.get(selections[0]?.workflowId ?? "");
  if (firstWorkflow === undefined) {
    throw new Error("The first comparison workflow was not found.");
  }
  const measurementIdentity = stableJson(firstWorkflow.measurement);
  const pieces = selections.map((selection) => {
    const workflow = workflows.get(selection.workflowId);
    if (workflow === undefined || stableJson(workflow.measurement) !== measurementIdentity) {
      throw new Error("Compared products must use the same measured space.");
    }
    return buildPublicSharedComparisonSnapshot(workflow, [selection.candidateId]);
  });
  const checkedAt = pieces.reduce(
    (latest, piece) => Date.parse(piece.checkedAt) > Date.parse(latest) ? piece.checkedAt : latest,
    pieces[0]?.checkedAt ?? firstWorkflow.updatedAt,
  );
  return {
    measurement: firstWorkflow.measurement,
    intent: pieces[0]?.intent ?? firstWorkflow.intent ?? {
      kind: "prompt",
      text: firstWorkflow.queryText,
      retailers: firstWorkflow.retailers,
    },
    candidates: pieces.flatMap((piece) => piece.candidates),
    checkedAt,
    isPartial: pieces.some((piece) => piece.isPartial),
    coverageNotes: [...new Set(pieces.flatMap((piece) => piece.coverageNotes))].slice(0, 10),
  };
}
