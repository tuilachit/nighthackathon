import type { CandidateFitStatus } from "@/lib/live-search/types";
import type { SpaceMeasurement } from "@/lib/catalog-types";
import {
  CACHED_FURNITURE_QUERIES,
  DEMO_SPACE_MEASUREMENT,
} from "@/lib/fit-config";
import { parseFitShareParams } from "@/lib/fit-share-state";

type SearchParamValue = string | readonly string[] | undefined;

export interface DemoRouteSearchParams {
  readonly tier?: SearchParamValue;
  readonly page?: SearchParamValue;
  readonly q?: SearchParamValue;
  readonly compare?: SearchParamValue;
  readonly w?: SearchParamValue;
  readonly h?: SearchParamValue;
  readonly d?: SearchParamValue;
  readonly a?: SearchParamValue;
  readonly u?: SearchParamValue;
  readonly source?: SearchParamValue;
}

export interface DemoResultsRouteState {
  readonly selectedTier: CandidateFitStatus;
  readonly pageIndex: number;
  readonly queryText: string;
  readonly comparedProductIds: readonly string[];
  readonly measurement: SpaceMeasurement;
}

const DEMO_PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/i;
const DEMO_TIERS = new Set<CandidateFitStatus>([
  "fits",
  "access_issue",
  "near_miss",
]);

/** Validates untrusted demo route state without reading browser or provider state. */
export function parseDemoResultsRouteState(
  searchParams: DemoRouteSearchParams,
): DemoResultsRouteState {
  const tierValue = firstValue(searchParams.tier);
  const pageValue = firstValue(searchParams.page);
  const queryValue = firstValue(searchParams.q)?.trim();
  const sharedState = parseFitShareParams(toUrlSearchParams(searchParams));
  return {
    selectedTier: isDemoTier(tierValue) ? tierValue : "fits",
    pageIndex: parsePageIndex(pageValue),
    queryText: sharedState.status === "valid"
      ? sharedState.state.query
      : queryValue !== undefined && queryValue.length > 0 && queryValue.length <= 500
        ? queryValue
        : CACHED_FURNITURE_QUERIES[0],
    comparedProductIds: sharedState.status === "valid"
      ? sharedState.state.comparedProductIds.slice(0, 2)
      : parseComparedProductIds(firstValue(searchParams.compare)),
    measurement: sharedState.status === "valid"
      ? sharedState.state.measurement
      : DEMO_SPACE_MEASUREMENT,
  };
}

/** Produces the canonical, backend-free demo result URL. */
export function buildDemoResultsHref(state: DemoResultsRouteState): string {
  const searchParams = new URLSearchParams();
  searchParams.set("tier", state.selectedTier);
  writeSharedMeasurement(searchParams, state.measurement);
  searchParams.set("q", state.queryText);
  if (state.pageIndex > 0) {
    searchParams.set("page", String(state.pageIndex + 1));
  }
  if (state.comparedProductIds.length > 0) {
    searchParams.set("compare", state.comparedProductIds.join(","));
  }
  return `/fit/demo/results?${searchParams.toString()}`;
}

/** Produces a dedicated comparison URL for exactly two catalog candidates. */
export function buildDemoComparisonHref(
  state: DemoResultsRouteState,
  candidateIds: readonly [string, string],
): string {
  if (
    candidateIds[0] === candidateIds[1] ||
    !candidateIds.every((candidateId) => DEMO_PRODUCT_ID_PATTERN.test(candidateId))
  ) {
    throw new TypeError("Two distinct demo product IDs are required.");
  }
  const searchParams = new URLSearchParams();
  searchParams.set("tier", state.selectedTier);
  writeSharedMeasurement(searchParams, state.measurement);
  searchParams.set("q", state.queryText);
  if (state.pageIndex > 0) {
    searchParams.set("page", String(state.pageIndex + 1));
  }
  searchParams.set("compare", candidateIds.join(","));
  return `/fit/demo/compare?${searchParams.toString()}`;
}

function firstValue(value: SearchParamValue): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

function toUrlSearchParams(values: DemoRouteSearchParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const key of ["w", "h", "d", "a", "u", "source", "q", "compare"] as const) {
    const value = firstValue(values[key]);
    if (value !== undefined) {
      searchParams.set(key, value);
    }
  }
  return searchParams;
}

function writeSharedMeasurement(
  searchParams: URLSearchParams,
  measurement: SpaceMeasurement,
): void {
  if (isDefaultDemoMeasurement(measurement)) {
    return;
  }
  searchParams.set("w", String(measurement.widthMm));
  searchParams.set("h", String(measurement.heightMm));
  searchParams.set("d", String(measurement.depthMm));
  if (measurement.accessWidthMm !== undefined) {
    searchParams.set("a", String(measurement.accessWidthMm));
  }
  searchParams.set("u", String(measurement.uncertaintyMm));
  searchParams.set("source", measurement.source);
}

function isDefaultDemoMeasurement(measurement: SpaceMeasurement): boolean {
  return measurement.widthMm === DEMO_SPACE_MEASUREMENT.widthMm &&
    measurement.heightMm === DEMO_SPACE_MEASUREMENT.heightMm &&
    measurement.depthMm === DEMO_SPACE_MEASUREMENT.depthMm &&
    measurement.uncertaintyMm === DEMO_SPACE_MEASUREMENT.uncertaintyMm &&
    measurement.accessWidthMm === DEMO_SPACE_MEASUREMENT.accessWidthMm &&
    measurement.source === DEMO_SPACE_MEASUREMENT.source;
}

function isDemoTier(value: string | undefined): value is CandidateFitStatus {
  return value !== undefined && DEMO_TIERS.has(value as CandidateFitStatus);
}

function parsePageIndex(value: string | undefined): number {
  if (value === undefined || !/^[1-9]\d{0,2}$/.test(value)) {
    return 0;
  }
  return Number(value) - 1;
}

function parseComparedProductIds(value: string | undefined): readonly string[] {
  if (value === undefined || value.length === 0) {
    return [];
  }
  const productIds = value.split(",");
  if (
    productIds.length > 2 ||
    productIds.some((productId) => !DEMO_PRODUCT_ID_PATTERN.test(productId)) ||
    new Set(productIds).size !== productIds.length
  ) {
    return [];
  }
  return productIds;
}
