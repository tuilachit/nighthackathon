"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SpaceMeasurement } from "@/lib/catalog-types";
import type { PendingMeasurementReviewDraft } from "@/lib/pending-measurement-review";
import {
  createSavedSpace,
  loadSavedSpaces,
  persistSavedSpaces,
  renameSavedSpace,
  type SavedSpace,
} from "@/lib/saved-spaces";

const ACTIVE_SPACE_STORAGE_KEY = "fitment.active-space.v1";
const COMPARISON_STORAGE_PREFIX = "fitment.comparison.v1";

interface FitJourneyContextValue {
  readonly ready: boolean;
  readonly savedSpaces: readonly SavedSpace[];
  readonly activeSpace?: SavedSpace;
  readonly pendingMeasurementReview?: PendingMeasurementReviewDraft;
  selectSpace(spaceId: string): void;
  saveSpace(measurement: SpaceMeasurement, existingSpaceId?: string): SavedSpace;
  renameSpace(spaceId: string, name: string): void;
  deleteSpace(spaceId: string): void;
  readComparison(workflowId: string): readonly string[];
  saveComparison(workflowId: string, candidateIds: readonly string[]): void;
  clearComparison(workflowId: string): void;
  setPendingMeasurementReview(draft: PendingMeasurementReviewDraft): void;
  clearPendingMeasurementReview(): void;
}

const FitJourneyContext = createContext<FitJourneyContextValue | undefined>(
  undefined,
);

/** Owns device-local space and comparison choices without importing live providers. */
export function FitJourneyProvider({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [savedSpaces, setSavedSpaces] = useState<readonly SavedSpace[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string>();
  const [pendingMeasurementReview, setPendingMeasurementReviewState] =
    useState<PendingMeasurementReviewDraft>();

  useEffect(() => {
    const localStorage = browserLocalStorage();
    const spaces = localStorage === undefined ? [] : loadSavedSpaces(localStorage);
    const storedId = readSessionValue(ACTIVE_SPACE_STORAGE_KEY);
    const selected = spaces.some((space) => space.id === storedId)
      ? storedId
      : spaces[0]?.id;
    setSavedSpaces(spaces);
    setActiveSpaceId(selected);
    persistActiveSpace(selected);
    setReady(true);
  }, []);

  const activeSpace = useMemo(
    () => savedSpaces.find((space) => space.id === activeSpaceId),
    [activeSpaceId, savedSpaces],
  );

  const selectSpace = useCallback(
    (spaceId: string): void => {
      if (!savedSpaces.some((space) => space.id === spaceId)) {
        return;
      }
      setActiveSpaceId(spaceId);
      persistActiveSpace(spaceId);
    },
    [savedSpaces],
  );

  const saveSpace = useCallback(
    (measurement: SpaceMeasurement, existingSpaceId?: string): SavedSpace => {
      const existing = existingSpaceId === undefined
        ? undefined
        : savedSpaces.find((space) => space.id === existingSpaceId);
      const nextSpace = createSavedSpace(existing?.name ?? "My space", measurement, {
        ...(existing === undefined
          ? {}
          : { id: existing.id, createdAt: existing.createdAt }),
      });
      const nextSpaces = existing === undefined
        ? [nextSpace, ...savedSpaces]
        : [
            nextSpace,
            ...savedSpaces.filter((space) => space.id !== existing.id),
          ];
      setSavedSpaces(nextSpaces);
      setActiveSpaceId(nextSpace.id);
      persistSpaces(nextSpaces);
      persistActiveSpace(nextSpace.id);
      return nextSpace;
    },
    [savedSpaces],
  );

  const renameSpace = useCallback(
    (spaceId: string, name: string): void => {
      setSavedSpaces((current) => {
        const next = renameSavedSpace(current, spaceId, name);
        persistSpaces(next);
        return next;
      });
    },
    [],
  );

  const deleteSpace = useCallback(
    (spaceId: string): void => {
      setSavedSpaces((current) => {
        const next = current.filter((space) => space.id !== spaceId);
        persistSpaces(next);
        if (spaceId === activeSpaceId) {
          const replacementId = next[0]?.id;
          setActiveSpaceId(replacementId);
          persistActiveSpace(replacementId);
        }
        return next;
      });
    },
    [activeSpaceId],
  );

  const readComparison = useCallback((workflowId: string): readonly string[] => {
    const serialized = readSessionValue(comparisonKey(workflowId));
    if (serialized === undefined) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(serialized);
      return Array.isArray(parsed) && parsed.every(isUuid)
        ? parsed.slice(0, 2)
        : [];
    } catch {
      return [];
    }
  }, []);

  const saveComparison = useCallback(
    (workflowId: string, candidateIds: readonly string[]): void => {
      if (!isUuid(workflowId) || !candidateIds.every(isUuid)) {
        return;
      }
      writeSessionValue(
        comparisonKey(workflowId),
        JSON.stringify(candidateIds.slice(0, 2)),
      );
  }, []);

  const clearComparison = useCallback((workflowId: string): void => {
    removeSessionValue(comparisonKey(workflowId));
  }, []);

  const setPendingMeasurementReview = useCallback(
    (draft: PendingMeasurementReviewDraft): void => {
      setPendingMeasurementReviewState(draft);
    },
    [],
  );

  const clearPendingMeasurementReview = useCallback((): void => {
    setPendingMeasurementReviewState(undefined);
  }, []);

  const value = useMemo<FitJourneyContextValue>(
    () => ({
      ready,
      savedSpaces,
      ...(activeSpace === undefined ? {} : { activeSpace }),
      ...(pendingMeasurementReview === undefined
        ? {}
        : { pendingMeasurementReview }),
      selectSpace,
      saveSpace,
      renameSpace,
      deleteSpace,
      readComparison,
      saveComparison,
      clearComparison,
      setPendingMeasurementReview,
      clearPendingMeasurementReview,
    }),
    [
      activeSpace,
      pendingMeasurementReview,
      clearPendingMeasurementReview,
      clearComparison,
      deleteSpace,
      readComparison,
      ready,
      renameSpace,
      saveComparison,
      saveSpace,
      savedSpaces,
      selectSpace,
      setPendingMeasurementReview,
    ],
  );

  return (
    <FitJourneyContext.Provider value={value}>
      {children}
    </FitJourneyContext.Provider>
  );
}

function browserLocalStorage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function persistSpaces(spaces: readonly SavedSpace[]): void {
  const storage = browserLocalStorage();
  if (storage !== undefined) {
    persistSavedSpaces(storage, spaces);
  }
}

export function useFitJourney(): FitJourneyContextValue {
  const context = useContext(FitJourneyContext);
  if (context === undefined) {
    throw new Error("useFitJourney must be used inside FitJourneyProvider.");
  }
  return context;
}

function persistActiveSpace(spaceId: string | undefined): void {
  if (spaceId === undefined) {
    removeSessionValue(ACTIVE_SPACE_STORAGE_KEY);
    return;
  }
  writeSessionValue(ACTIVE_SPACE_STORAGE_KEY, spaceId);
}

function comparisonKey(workflowId: string): string {
  return `${COMPARISON_STORAGE_PREFIX}:${workflowId}`;
}

function readSessionValue(key: string): string | undefined {
  try {
    return window.sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeSessionValue(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // The journey remains usable in-memory when browser storage is unavailable.
  }
}

function removeSessionValue(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // There is no visible storage error state by design.
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
