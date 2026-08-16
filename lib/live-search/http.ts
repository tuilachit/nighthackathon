import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "./auth";
import { InvalidJsonBodyError, RequestBodyTooLargeError } from "./request";

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: readonly string[];
  };
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: readonly string[],
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status },
  );
}

export function handleRouteError(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof AuthenticationRequiredError) {
    return apiError(401, "authentication_required", error.message);
  }
  if (error instanceof RequestBodyTooLargeError) {
    return apiError(413, "request_too_large", error.message);
  }
  if (error instanceof InvalidJsonBodyError) {
    return apiError(400, "invalid_json", error.message);
  }
  if (error instanceof IdempotencyConflictError) {
    return apiError(409, "idempotency_conflict", error.message);
  }
  if (error instanceof ResourceNotFoundError) {
    return apiError(404, "not_found", error.message);
  }
  if (error instanceof InvalidWorkflowStateError) {
    return apiError(409, "invalid_workflow_state", error.message);
  }
  if (error instanceof RateLimitExceededError) {
    return apiError(429, "rate_limit_exceeded", error.message);
  }
  if (error instanceof LiveSearchUnavailableError) {
    return apiError(503, "live_search_unavailable", error.message);
  }
  console.error("Live-search route failed", error);
  return apiError(500, "internal_error", "The live-search service could not complete the request.");
}

export class IdempotencyConflictError extends Error {
  public constructor() {
    super("That idempotency key was already used for a different request.");
    this.name = "IdempotencyConflictError";
  }
}

export class ResourceNotFoundError extends Error {
  public constructor(resource: string) {
    super(`${resource} was not found.`);
    this.name = "ResourceNotFoundError";
  }
}

export class InvalidWorkflowStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidWorkflowStateError";
  }
}

export class RateLimitExceededError extends Error {
  public constructor() {
    super("Too many live searches are active. Wait for one to finish and try again.");
    this.name = "RateLimitExceededError";
  }
}

export class LiveSearchUnavailableError extends Error {
  public constructor() {
    super("Live provider calls are temporarily paused. Try again later.");
    this.name = "LiveSearchUnavailableError";
  }
}
