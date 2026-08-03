import type { MeasurementSource, SpaceMeasurement } from "./catalog-types";

const SHARE_KEYS = ["w", "h", "d", "a", "u", "source", "q", "compare"] as const;
const PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/i;

export interface FitShareState {
  readonly measurement: SpaceMeasurement;
  readonly query: string;
  readonly comparedProductIds: readonly string[];
}

export type FitShareParseResult =
  | { readonly status: "absent" }
  | { readonly status: "invalid" }
  | { readonly status: "valid"; readonly state: FitShareState };

/** Serializes an exact fit/comparison state into a backend-free `/fit` URL. */
export function buildFitShareUrl(origin: string, state: FitShareState): string {
  const url = new URL("/fit", origin);
  url.searchParams.set("w", String(state.measurement.widthMm));
  url.searchParams.set("h", String(state.measurement.heightMm));
  url.searchParams.set("d", String(state.measurement.depthMm));
  if (state.measurement.accessWidthMm !== undefined) {
    url.searchParams.set("a", String(state.measurement.accessWidthMm));
  }
  url.searchParams.set("u", String(state.measurement.uncertaintyMm));
  url.searchParams.set("source", state.measurement.source);
  url.searchParams.set("q", state.query.trim());
  url.searchParams.set("compare", state.comparedProductIds.join(","));
  return url.toString();
}

/** Parses untrusted URL state without allowing malformed values into fit evaluation. */
export function parseFitShareParams(
  searchParams: URLSearchParams,
): FitShareParseResult {
  if (!SHARE_KEYS.some((key) => searchParams.has(key))) {
    return { status: "absent" };
  }

  const widthMm = parseInteger(searchParams.get("w"));
  const heightMm = parseInteger(searchParams.get("h"));
  const depthMm = parseInteger(searchParams.get("d"));
  const accessValue = searchParams.get("a");
  const accessWidthMm = accessValue === null ? undefined : parseInteger(accessValue);
  const uncertaintyMm = parseInteger(searchParams.get("u"));
  const source = parseSource(searchParams.get("source"));
  const query = searchParams.get("q")?.trim();
  const comparedProductIds = parseProductIds(searchParams.get("compare"));

  if (
    !isDimension(widthMm) ||
    !isDimension(heightMm) ||
    !isDimension(depthMm) ||
    (accessValue !== null && !isDimension(accessWidthMm)) ||
    uncertaintyMm === undefined ||
    uncertaintyMm < 0 ||
    uncertaintyMm > 1_000 ||
    source === undefined ||
    query === undefined ||
    query.length === 0 ||
    query.length > 500 ||
    comparedProductIds === undefined
  ) {
    return { status: "invalid" };
  }

  return {
    status: "valid",
    state: {
      measurement: {
        widthMm,
        heightMm,
        depthMm,
        uncertaintyMm,
        ...(accessWidthMm === undefined ? {} : { accessWidthMm }),
        source,
      },
      query,
      comparedProductIds,
    },
  };
}

function parseInteger(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseSource(value: string | null): MeasurementSource | undefined {
  return value === "manual" || value === "demo" || value === "webxr"
    ? value
    : undefined;
}

function parseProductIds(value: string | null): readonly string[] | undefined {
  if (value === null || value.length === 0) {
    return undefined;
  }
  const ids = value.split(",");
  if (
    ids.length < 1 ||
    ids.length > 3 ||
    ids.some((id) => !PRODUCT_ID_PATTERN.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    return undefined;
  }
  return ids;
}

function isDimension(value: number | undefined): value is number {
  return value !== undefined && value >= 100 && value <= 10_000;
}
