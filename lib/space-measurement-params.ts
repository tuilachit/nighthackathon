import type { MeasurementSource, SpaceMeasurement } from "./measurement-geometry";

const VALID_SOURCES: readonly MeasurementSource[] = ["webxr", "manual", "demo"];

function isMeasurementSource(value: string | null): value is MeasurementSource {
  return value !== null && (VALID_SOURCES as readonly string[]).includes(value);
}

export function toSpaceMeasurementSearchParams(space: SpaceMeasurement): URLSearchParams {
  return new URLSearchParams({
    widthMm: String(space.widthMm),
    depthMm: String(space.depthMm),
    heightMm: String(space.heightMm),
    uncertaintyMm: String(space.uncertaintyMm),
    source: space.source,
  });
}

/**
 * Parses a SpaceMeasurement carried across routes as query params. Query strings are
 * untrusted input (edited by hand, stale bookmarks, partial copies), so every field is
 * validated rather than trusted.
 */
export function parseSpaceMeasurementSearchParams(params: URLSearchParams): SpaceMeasurement | undefined {
  const widthMm = Number(params.get("widthMm"));
  const depthMm = Number(params.get("depthMm"));
  const heightMm = Number(params.get("heightMm"));
  const uncertaintyMm = Number(params.get("uncertaintyMm"));
  const source = params.get("source");

  const dimensionsValid = [widthMm, depthMm, heightMm].every((value) => Number.isFinite(value) && value > 0);
  const uncertaintyValid = Number.isFinite(uncertaintyMm) && uncertaintyMm >= 0;

  if (!dimensionsValid || !uncertaintyValid || !isMeasurementSource(source)) {
    return undefined;
  }

  return { widthMm, depthMm, heightMm, uncertaintyMm, source };
}
