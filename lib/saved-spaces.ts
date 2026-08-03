import type { SpaceMeasurement } from "./catalog-types";

export const SAVED_SPACES_STORAGE_KEY = "fitment.saved-spaces.v1";

export interface SavedSpace {
  readonly id: string;
  readonly name: string;
  readonly measurement: SpaceMeasurement;
  readonly createdAt: string;
}

interface SavedSpaceFactoryOptions {
  readonly id?: string;
  readonly createdAt?: string;
}

/** Creates one validated, device-local saved-space record. */
export function createSavedSpace(
  name: string,
  measurement: SpaceMeasurement,
  options: SavedSpaceFactoryOptions = {},
): SavedSpace {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const id = options.id ?? createSpaceId(createdAt);
  return {
    id,
    name: normalizeSpaceName(name),
    measurement,
    createdAt,
  };
}

/** Reads saved spaces defensively; malformed or inaccessible storage behaves as empty. */
export function loadSavedSpaces(
  storage: Pick<Storage, "getItem">,
): readonly SavedSpace[] {
  try {
    const serialized = storage.getItem(SAVED_SPACES_STORAGE_KEY);
    if (serialized === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isSavedSpace)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch {
    return [];
  }
}

/** Persists the complete device-local list and reports whether storage accepted it. */
export function persistSavedSpaces(
  storage: Pick<Storage, "setItem">,
  spaces: readonly SavedSpace[],
): boolean {
  try {
    storage.setItem(SAVED_SPACES_STORAGE_KEY, JSON.stringify(spaces));
    return true;
  } catch {
    return false;
  }
}

export function renameSavedSpace(
  spaces: readonly SavedSpace[],
  spaceId: string,
  name: string,
): readonly SavedSpace[] {
  return spaces.map((space) =>
    space.id === spaceId ? { ...space, name: normalizeSpaceName(name) } : space,
  );
}

function normalizeSpaceName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length === 0 ? "My space" : trimmed.slice(0, 80);
}

function createSpaceId(createdAt: string): string {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `space-${createdAt}-${randomPart}`;
}

function isSavedSpace(value: unknown): value is SavedSpace {
  if (!isRecord(value) || !isRecord(value.measurement)) {
    return false;
  }
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isIsoDate(value.createdAt) &&
    isMeasurement(value.measurement)
  );
}

function isMeasurement(value: Record<string, unknown>): value is Record<string, unknown> & SpaceMeasurement {
  return (
    isDimension(value.widthMm) &&
    isDimension(value.heightMm) &&
    isDimension(value.depthMm) &&
    isUncertainty(value.uncertaintyMm) &&
    (value.accessWidthMm === undefined || isDimension(value.accessWidthMm)) &&
    (value.source === "manual" ||
      value.source === "demo" ||
      value.source === "webxr")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isDimension(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 100 &&
    value <= 10_000
  );
}

function isUncertainty(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1_000
  );
}
