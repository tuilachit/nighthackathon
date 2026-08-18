import type { SpaceMeasurement } from "@/lib/catalog-types";
import { MEASUREMENT_UNITS } from "@/lib/measurement-parser";
import type { MeasurementUnit } from "@/lib/measurement-parser";

export const PENDING_MEASUREMENT_REVIEW_KEY =
  "fitment.pending-measurement-review.v1";
export const PENDING_MEASUREMENT_REVIEW_VERSION = 1 as const;

export interface PendingMeasurementReviewDraft {
  readonly version: typeof PENDING_MEASUREMENT_REVIEW_VERSION;
  readonly measurement: SpaceMeasurement;
  readonly selectedUnit: MeasurementUnit;
  readonly editingSpaceId?: string;
}

export interface MeasurementReviewStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

export function createPendingMeasurementReviewDraft(
  measurement: SpaceMeasurement,
  selectedUnit: MeasurementUnit,
  editingSpaceId?: string,
): PendingMeasurementReviewDraft {
  return {
    version: PENDING_MEASUREMENT_REVIEW_VERSION,
    measurement: { ...measurement },
    selectedUnit,
    ...(editingSpaceId === undefined ? {} : { editingSpaceId }),
  };
}

/** Stores only normalized millimetres needed by the next review screen. */
export function persistPendingMeasurementReviewDraft(
  storage: MeasurementReviewStorage | undefined,
  draft: PendingMeasurementReviewDraft,
): boolean {
  if (storage === undefined || !isPendingMeasurementReviewDraft(draft)) {
    return false;
  }
  try {
    storage.setItem(PENDING_MEASUREMENT_REVIEW_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** Reads and validates the versioned review handoff without trusting browser storage. */
export function readPendingMeasurementReviewDraft(
  storage: MeasurementReviewStorage | undefined,
): PendingMeasurementReviewDraft | undefined {
  if (storage === undefined) return undefined;
  try {
    const raw = storage.getItem(PENDING_MEASUREMENT_REVIEW_KEY);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isPendingMeasurementReviewDraft(parsed)) {
      storage.removeItem(PENDING_MEASUREMENT_REVIEW_KEY);
      return undefined;
    }
    return parsed;
  } catch {
    try {
      storage.removeItem(PENDING_MEASUREMENT_REVIEW_KEY);
    } catch {
      // Storage can be unavailable in private browsing; the in-memory flow still works.
    }
    return undefined;
  }
}

export function clearPendingMeasurementReviewDraft(
  storage: MeasurementReviewStorage | undefined,
): void {
  if (storage === undefined) return;
  try {
    storage.removeItem(PENDING_MEASUREMENT_REVIEW_KEY);
  } catch {
    // A completed in-memory review is still valid when session storage is unavailable.
  }
}

function isPendingMeasurementReviewDraft(
  input: unknown,
): input is PendingMeasurementReviewDraft {
  if (!isRecord(input)) return false;
  if (
    !Object.keys(input).every((key) =>
      ["version", "measurement", "selectedUnit", "editingSpaceId"].includes(key),
    )
  ) {
    return false;
  }
  if (input.version !== PENDING_MEASUREMENT_REVIEW_VERSION) return false;
  if (
    typeof input.selectedUnit !== "string" ||
    !MEASUREMENT_UNITS.includes(input.selectedUnit as MeasurementUnit)
  ) {
    return false;
  }
  if (
    input.editingSpaceId !== undefined &&
    (typeof input.editingSpaceId !== "string" ||
      input.editingSpaceId.trim().length === 0)
  ) {
    return false;
  }
  if (!isRecord(input.measurement)) return false;
  const measurement = input.measurement;
  if (
    !isIntegerInRange(measurement.widthMm, 100, 10_000) ||
    !isIntegerInRange(measurement.heightMm, 100, 10_000) ||
    !isIntegerInRange(measurement.depthMm, 100, 10_000) ||
    !isIntegerInRange(measurement.uncertaintyMm, 0, 10_000) ||
    (measurement.accessWidthMm !== undefined &&
      !isIntegerInRange(measurement.accessWidthMm, 300, 3000)) ||
    !["manual", "webxr", "demo"].includes(String(measurement.source))
  ) {
    return false;
  }
  return Object.keys(measurement).every((key) =>
    [
      "widthMm",
      "heightMm",
      "depthMm",
      "uncertaintyMm",
      "accessWidthMm",
      "source",
    ].includes(key),
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
