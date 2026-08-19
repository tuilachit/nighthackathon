import { after } from "next/server";
import { NextResponse } from "next/server";
import { getLiveSearchServerEnvironment, isModelGenerationConfigured } from "@/lib/live-search/env";
import { apiError, handleRouteError } from "@/lib/live-search/http";
import { sha256Hex, stableJson } from "@/lib/live-search/hashing";
import { readMeshyWebhookTaskId, verifyMeshyWebhookToken } from "@/lib/live-search/providers/meshy";
import { registerWebhook } from "@/lib/live-search/repository";
import { readBoundedText } from "@/lib/live-search/request";
import { processMeshyWebhook } from "@/lib/live-search/service";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const maxDuration = 60;

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  if (!isModelGenerationConfigured()) {
    return apiError(503, "not_configured", "Model generation is not configured in this environment.");
  }
  const environment = getLiveSearchServerEnvironment();
  const token = new URL(request.url).searchParams.get("token");
  if (!verifyMeshyWebhookToken(token, environment.meshyWebhookSecret!)) {
    return apiError(401, "invalid_token", "Webhook token is invalid.");
  }
  try {
    const rawBody = await readBoundedText(request, MAX_WEBHOOK_BYTES);
    const payload = parseJsonObject(rawBody);
    if (payload !== undefined && typeof payload.type === "string" && payload.type !== "image-to-3d") {
      return NextResponse.json({ accepted: true, ignored: true });
    }
    const taskId = readMeshyWebhookTaskId(payload);
    if (payload === undefined || taskId === undefined) {
      return apiError(400, "invalid_webhook", "Meshy webhook payload is invalid.");
    }
    const status = typeof payload.status === "string" ? payload.status : "unknown";
    const progress = typeof payload.progress === "number" ? payload.progress : 0;
    const eventKey = `${taskId}:${status}:${progress}`;
    const inbox = await registerWebhook("meshy", eventKey, sha256Hex(stableJson(payload)), payload);
    if (!inbox.duplicate) {
      after(async () => {
        try {
          await processMeshyWebhook(inbox.inboxId, taskId);
        } catch (error) {
          console.error("Deferred Meshy webhook processing failed", error);
        }
      });
    }
    return NextResponse.json({ accepted: true, duplicate: inbox.duplicate }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
