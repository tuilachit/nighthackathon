export type MeasurementSource = "webxr" | "manual" | "demo";

export interface SpaceMeasurement {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number;
  readonly uncertaintyMm: number;
  readonly source: MeasurementSource;
}

export interface ProductDimensions {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number;
}

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FootprintTapSamples {
  readonly backLeft: readonly Point3[];
  readonly backRight: readonly Point3[];
  readonly frontRight: readonly Point3[];
}

export interface FootprintMeasurement {
  readonly widthMm: number;
  readonly depthMm: number;
  readonly cornerSkewDegrees: number;
  readonly uncertaintyMm: number;
}

export const WEBXR_BASE_UNCERTAINTY_MM = 25;
export const MANUAL_BASE_UNCERTAINTY_MM = 5;
export const DEMO_MEASUREMENT_UNCERTAINTY_MM = 20;

export function metersToMm(meters: number): number {
  return meters * 1000;
}

export function mmToMeters(mm: number): number {
  return mm / 1000;
}

export function mmToInches(mm: number): number {
  return mm / 25.4;
}

export function inchesToMm(inches: number): number {
  return inches * 25.4;
}

export function roundMm(value: number): number {
  return Math.round(value);
}

export function averagePoint(samples: readonly Point3[]): Point3 {
  if (samples.length === 0) {
    throw new RangeError("Cannot average zero pose samples.");
  }

  const total = samples.reduce(
    (sum, sample) => ({ x: sum.x + sample.x, y: sum.y + sample.y, z: sum.z + sample.z }),
    { x: 0, y: 0, z: 0 },
  );

  return {
    x: total.x / samples.length,
    y: total.y / samples.length,
    z: total.z / samples.length,
  };
}

/**
 * Horizontal (floor-plane) distance in millimetres between two points given in metres.
 * Ignores the vertical (y) axis so handheld tracking noise in height never leaks into
 * the width/depth numbers the fit engine depends on.
 */
export function planarDistanceMm(a: Point3, b: Point3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return metersToMm(Math.hypot(dx, dz));
}

/**
 * Deviation from a perfect 90-degree corner at `corner`, measured between the two
 * edges to `armA` and `armB`. Real rooms are rarely perfectly square; this feeds
 * extra measurement uncertainty rather than silently pretending the corner is exact.
 */
export function cornerSkewDegrees(corner: Point3, armA: Point3, armB: Point3): number {
  const vectorA = { x: armA.x - corner.x, z: armA.z - corner.z };
  const vectorB = { x: armB.x - corner.x, z: armB.z - corner.z };

  const magnitudeA = Math.hypot(vectorA.x, vectorA.z);
  const magnitudeB = Math.hypot(vectorB.x, vectorB.z);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  const dot = vectorA.x * vectorB.x + vectorA.z * vectorB.z;
  const cosAngle = Math.min(1, Math.max(-1, dot / (magnitudeA * magnitudeB)));
  const angleDegrees = (Math.acos(cosAngle) * 180) / Math.PI;

  return Math.abs(90 - angleDegrees);
}

/**
 * Turns a three-point WebXR floor-footprint capture (back-left, back-right,
 * front-right — each an array of raw poses sampled over the ~300-500ms tap
 * window) into a width/depth measurement with skew-aware uncertainty.
 */
export function measureFootprint(
  taps: FootprintTapSamples,
  baseUncertaintyMm: number = WEBXR_BASE_UNCERTAINTY_MM,
): FootprintMeasurement {
  const backLeft = averagePoint(taps.backLeft);
  const backRight = averagePoint(taps.backRight);
  const frontRight = averagePoint(taps.frontRight);

  const widthMm = planarDistanceMm(backLeft, backRight);
  const depthMm = planarDistanceMm(backRight, frontRight);
  const skewDegrees = cornerSkewDegrees(backRight, backLeft, frontRight);

  const skewRadians = (skewDegrees * Math.PI) / 180;
  const longestEdgeMm = Math.max(widthMm, depthMm);
  const skewUncertaintyMm = Math.tan(skewRadians) * longestEdgeMm;

  return {
    widthMm: roundMm(widthMm),
    depthMm: roundMm(depthMm),
    cornerSkewDegrees: skewDegrees,
    uncertaintyMm: roundMm(baseUncertaintyMm + skewUncertaintyMm),
  };
}

export function toSpaceMeasurement(
  footprint: FootprintMeasurement,
  heightMm: number,
  source: MeasurementSource = "webxr",
): SpaceMeasurement {
  return {
    widthMm: footprint.widthMm,
    depthMm: footprint.depthMm,
    heightMm: roundMm(heightMm),
    uncertaintyMm: footprint.uncertaintyMm,
    source,
  };
}

export function manualSpaceMeasurement(
  input: { readonly widthMm: number; readonly depthMm: number; readonly heightMm: number },
  uncertaintyMm: number = MANUAL_BASE_UNCERTAINTY_MM,
): SpaceMeasurement {
  return {
    widthMm: roundMm(input.widthMm),
    depthMm: roundMm(input.depthMm),
    heightMm: roundMm(input.heightMm),
    uncertaintyMm: roundMm(uncertaintyMm),
    source: "manual",
  };
}
