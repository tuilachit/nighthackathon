import { parseFitShareParams } from "./fit-share-state";

export const FIT_WORKFLOW_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FitWorkflowSurface =
  | "workflow"
  | "results"
  | "compare"
  | "candidate-review"
  | "model";

export interface FitCompatibilitySearchParams {
  readonly job?: string | readonly string[];
  readonly new?: string | readonly string[];
  readonly demo?: string | readonly string[];
  readonly legacy?: string | readonly string[];
  readonly mode?: string | readonly string[];
  readonly w?: string | readonly string[];
  readonly h?: string | readonly string[];
  readonly d?: string | readonly string[];
  readonly a?: string | readonly string[];
  readonly u?: string | readonly string[];
  readonly source?: string | readonly string[];
  readonly q?: string | readonly string[];
  readonly compare?: string | readonly string[];
}

export type FitEntryDecision =
  | { readonly kind: "render" }
  | { readonly kind: "redirect"; readonly href: string };

/** Accepts only durable UUID handles issued by the workflow API. */
export function isFitWorkflowId(value: unknown): value is string {
  return typeof value === "string" && FIT_WORKFLOW_ID_PATTERN.test(value);
}

/** Returns the canonical App Router path for one owner-scoped workflow view. */
export function fitWorkflowPath(
  workflowId: string,
  surface: FitWorkflowSurface = "workflow",
  candidateId?: string,
): string {
  if (!isFitWorkflowId(workflowId)) {
    throw new TypeError("A valid workflow ID is required.");
  }

  const base = `/fit/jobs/${workflowId}`;
  if (surface === "workflow") return base;
  if (surface === "results") return `${base}/results`;
  if (surface === "compare") return `${base}/compare`;
  if (surface === "model") return `${base}/model`;
  if (!isFitWorkflowId(candidateId)) {
    throw new TypeError("A valid candidate ID is required for candidate review.");
  }
  return `${base}/candidates/${candidateId}/review`;
}

/** Resolves legacy query-string entry points to their canonical route surfaces. */
export function resolveFitEntry(
  searchParams: FitCompatibilitySearchParams,
): FitEntryDecision {
  const workflowId = firstSearchParam(searchParams.job);
  if (isFitWorkflowId(workflowId)) {
    return { kind: "redirect", href: fitWorkflowPath(workflowId) };
  }
  if (firstSearchParam(searchParams.new) === "1") {
    return { kind: "redirect", href: "/fit/space" };
  }
  if (
    firstSearchParam(searchParams.demo) === "1" ||
    firstSearchParam(searchParams.legacy) === "1"
  ) {
    return { kind: "redirect", href: "/fit/demo/results?tier=fits" };
  }
  const sharedResultsHref = legacyShareResultsHref(searchParams);
  if (sharedResultsHref !== undefined) {
    return { kind: "redirect", href: sharedResultsHref };
  }
  return { kind: "render" };
}

/** Resolves the retired `/agent` entry point to its canonical Fitment route. */
export function resolveAgentEntry(
  searchParams: Pick<FitCompatibilitySearchParams, "job">,
): string {
  const workflowId = firstSearchParam(searchParams.job);
  return isFitWorkflowId(workflowId) ? fitWorkflowPath(workflowId) : "/fit";
}

function firstSearchParam(
  value: string | readonly string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

function legacyShareResultsHref(
  searchParams: FitCompatibilitySearchParams,
): string | undefined {
  const legacyParams = new URLSearchParams();
  for (const key of ["w", "h", "d", "a", "u", "source", "q", "compare"] as const) {
    const value = firstSearchParam(searchParams[key]);
    if (value !== undefined) {
      legacyParams.set(key, value);
    }
  }
  const parsed = parseFitShareParams(legacyParams);
  if (parsed.status !== "valid") {
    return undefined;
  }

  const canonicalParams = new URLSearchParams();
  canonicalParams.set("tier", "fits");
  canonicalParams.set("w", String(parsed.state.measurement.widthMm));
  canonicalParams.set("h", String(parsed.state.measurement.heightMm));
  canonicalParams.set("d", String(parsed.state.measurement.depthMm));
  if (parsed.state.measurement.accessWidthMm !== undefined) {
    canonicalParams.set("a", String(parsed.state.measurement.accessWidthMm));
  }
  canonicalParams.set("u", String(parsed.state.measurement.uncertaintyMm));
  canonicalParams.set("source", parsed.state.measurement.source);
  canonicalParams.set("q", parsed.state.query);
  canonicalParams.set("compare", parsed.state.comparedProductIds.join(","));
  return `/fit/demo/results?${canonicalParams.toString()}`;
}
