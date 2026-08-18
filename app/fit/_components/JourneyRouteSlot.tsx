"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SpaceMeasurementInput,
  type SpaceMeasurementInputProps,
} from "@/components/fit/journey/SpaceMeasurementInput";
import {
  SpaceMeasurementReview,
  type SpaceMeasurementReviewProps,
} from "@/components/fit/journey/SpaceMeasurementReview";
import { useFitJourney } from "@/components/fit/journey/FitJourneyProvider";
import { JourneyLoading } from "@/components/fit/journey/JourneyShell";
import {
  createPendingMeasurementReviewDraft,
  readPendingMeasurementReviewDraft,
  type MeasurementReviewStorage,
  type PendingMeasurementReviewDraft,
} from "@/lib/pending-measurement-review";

interface JourneyRouteSlotProps {
  readonly kind: "space" | "space-review";
  readonly editingSpaceId?: string;
  readonly nextMode?: "link";
}

/** Adapts route state to the route-neutral measurement and review components. */
export function JourneyRouteSlot({
  kind,
  editingSpaceId,
  nextMode,
}: JourneyRouteSlotProps): React.JSX.Element {
  return kind === "space"
    ? <SpaceInputRoute editingSpaceId={editingSpaceId} nextMode={nextMode} />
    : <SpaceReviewRoute nextMode={nextMode} />;
}

function SpaceInputRoute({
  editingSpaceId,
  nextMode,
}: {
  readonly editingSpaceId?: string;
  readonly nextMode?: "link";
}): React.JSX.Element {
  const router = useRouter();
  const {
    ready,
    savedSpaces,
    pendingMeasurementReview,
    setPendingMeasurementReview,
  } = useFitJourney();
  const memoryDraft = useRef(pendingMeasurementReview);
  const [restoredDraft, setRestoredDraft] = useState<
    PendingMeasurementReviewDraft | null | undefined
  >(undefined);
  const editingSpace = editingSpaceId === undefined
    ? undefined
    : savedSpaces.find((space) => space.id === editingSpaceId);

  useEffect(() => {
    setRestoredDraft(
      readPendingMeasurementReviewDraft(browserSessionStorage()) ??
        memoryDraft.current ??
        null,
    );
  }, []);

  useEffect(() => {
    if (ready && editingSpaceId !== undefined && editingSpace === undefined) {
      router.replace("/fit/space");
    }
  }, [editingSpace, editingSpaceId, ready, router]);

  if (
    !ready ||
    restoredDraft === undefined ||
    (editingSpaceId !== undefined && editingSpace === undefined)
  ) {
    return <JourneyLoading label="Loading your saved space" />;
  }

  const matchingDraft = restoredDraft !== null &&
    restoredDraft.editingSpaceId === editingSpaceId
    ? restoredDraft
    : undefined;
  const initialMeasurement = matchingDraft?.measurement ?? editingSpace?.measurement;

  const inputProps: SpaceMeasurementInputProps = {
    backHref: nextMode === "link" ? "/fit?mode=link" : "/fit",
    onParsed: (measurement, parsedEditingSpaceId) => {
      setPendingMeasurementReview(
        createPendingMeasurementReviewDraft(
          measurement,
          "mm",
          parsedEditingSpaceId,
        ),
      );
      router.push(
        nextMode === "link" ? "/fit/space/review?mode=link" : "/fit/space/review",
      );
    },
    ...(initialMeasurement === undefined
      ? {}
      : {
          initialMeasurement,
          ...(editingSpaceId === undefined ? {} : { editingSpaceId }),
        }),
  };

  return <SpaceMeasurementInput {...inputProps} />;
}

function SpaceReviewRoute({
  nextMode,
}: {
  readonly nextMode?: "link";
}): React.JSX.Element {
  const router = useRouter();
  const {
    ready,
    saveSpace,
    pendingMeasurementReview,
    clearPendingMeasurementReview,
  } = useFitJourney();
  const memoryDraft = useRef(pendingMeasurementReview);
  const [draft, setDraft] = useState<
    PendingMeasurementReviewDraft | null | undefined
  >(undefined);

  useEffect(() => {
    setDraft(
      readPendingMeasurementReviewDraft(browserSessionStorage()) ??
        memoryDraft.current ??
        null,
    );
  }, []);

  useEffect(() => {
    if (draft === null) {
      router.replace(nextMode === "link" ? "/fit/space?mode=link" : "/fit/space");
    }
  }, [draft, nextMode, router]);

  if (!ready || draft === undefined) {
    return <JourneyLoading label="Loading your measurements" />;
  }

  if (draft === null) {
    return <JourneyLoading label="Returning to measurement entry" />;
  }

  const reviewProps: SpaceMeasurementReviewProps = {
    measurement: draft.measurement,
    onBack: () => {
      const suffix = draft.editingSpaceId === undefined
        ? nextMode === "link" ? "?mode=link" : ""
        : `?edit=${encodeURIComponent(draft.editingSpaceId)}${nextMode === "link" ? "&mode=link" : ""}`;
      router.replace(`/fit/space${suffix}`);
    },
    onConfirm: (measurement, editingSpaceId) => {
      saveSpace(measurement, editingSpaceId);
      clearPendingMeasurementReview();
      router.replace(nextMode === "link" ? "/fit/search?mode=link" : "/fit/search");
    },
    ...(draft.editingSpaceId === undefined
      ? {}
      : { editingSpaceId: draft.editingSpaceId }),
  };

  return <SpaceMeasurementReview {...reviewProps} />;
}

function browserSessionStorage(): MeasurementReviewStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
