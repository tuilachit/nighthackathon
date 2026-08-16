import { after } from "next/server";
import { NextResponse } from "next/server";
import { getLiveSearchServerEnvironment, isLiveSearchConfigured } from "@/lib/live-search/env";
import { apiError, handleRouteError } from "@/lib/live-search/http";
import { sha256Hex, stableJson } from "@/lib/live-search/hashing";
import { verifyBrowserUseWebhook } from "@/lib/live-search/providers/browser-use";
import { registerWebhook } from "@/lib/live-search/repository";
import { readBoundedText } from "@/lib/live-search/request";
import { processBrowserUseWebhook } from "@/lib/live-search/service";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const maxDuration = 60;

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  if (!isLiveSearchConfigured()) {
    return apiError(503, "not_configured", "Live search is not configured in this environment.");
  }
  try {
    const rawBody = await readBoundedText(request, MAX_WEBHOOK_BYTES);
    const environment = getLiveSearchServerEnvironment();
    if (!verifyBrowserUseWebhook(
      rawBody,
      request.headers.get("x-browser-use-signature"),
      request.headers.get("x-browser-use-timestamp"),
      environment.browserUseWebhookSecret,
    )) {
      return apiError(401, "invalid_signature", "Webhook signature is invalid or expired.");
    }
    const payload = parseJsonObject(rawBody);
    if (payload !== undefined && isBrowserTestEvent(payload)) {
      return NextResponse.json({ accepted: true, test: true });
    }
    const event = payload === undefined ? undefined : readBrowserEvent(payload);
    if (event === undefined) {
      return apiError(400, "invalid_webhook", "Browser Use webhook payload is invalid.");
    }
    const eventKey = `${event.type}:${event.sessionId}:${event.taskId}:${event.status}:${event.timestamp}`;
    const inbox = await registerWebhook("browser_use", eventKey, sha256Hex(stableJson(payload)), payload);
    if (!inbox.duplicate) {
      after(async () => {
        try {
          await processBrowserUseWebhook(inbox.inboxId, event.sessionId);
        } catch (error) {
          console.error("Deferred Browser Use webhook processing failed", error);
        }
      });
    }
    return NextResponse.json({ accepted: true, duplicate: inbox.duplicate }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isBrowserTestEvent(input: Record<string, unknown>): boolean {
  return input.type === "test" && typeof input.timestamp === "string";
}

function readBrowserEvent(input: Record<string, unknown>): {
  readonly type: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly status: string;
  readonly timestamp: string;
} | undefined {
  const body = input.payload;
  if (
    input.type !== "agent.task.status_update" ||
    typeof input.timestamp !== "string" ||
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return undefined;
  }
  const event = body as Record<string, unknown>;
  return validProviderId(event.session_id) &&
    validProviderId(event.task_id) &&
    typeof event.status === "string" &&
    event.status.length > 0 &&
    event.status.length <= 100
    ? {
        type: input.type,
        sessionId: event.session_id,
        taskId: event.task_id,
        status: event.status,
        timestamp: input.timestamp,
      }
    : undefined;
}

function validProviderId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
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
