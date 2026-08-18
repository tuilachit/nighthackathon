"use client";

import { useEffect, useRef, useState } from "react";
import { MeasurementEnvelopeDiagram } from "@/components/fit/MeasurementEnvelopeDiagram";
import type { SpaceMeasurement } from "@/lib/catalog-types";
import { parseMeasurementInput } from "@/lib/measurement-parser";
import {
  clearPendingMeasurementReviewDraft,
  createPendingMeasurementReviewDraft,
  persistPendingMeasurementReviewDraft,
} from "@/lib/pending-measurement-review";
import type { MeasurementReviewStorage } from "@/lib/pending-measurement-review";

export interface SpaceMeasurementReviewProps {
  readonly measurement: SpaceMeasurement;
  readonly editingSpaceId?: string;
  readonly onConfirm: (
    measurement: SpaceMeasurement,
    editingSpaceId?: string,
  ) => void;
  readonly onBack: () => void;
}

type DraftField = "width" | "height" | "depth" | "access";

/** Confirms or corrects canonical millimetre measurements before a saved space is used. */
export function SpaceMeasurementReview({
  measurement,
  editingSpaceId,
  onConfirm,
  onBack,
}: SpaceMeasurementReviewProps): React.JSX.Element {
  const [values, setValues] = useState<Record<DraftField, string>>(() => ({
    width: String(measurement.widthMm),
    height: String(measurement.heightMm),
    depth: String(measurement.depthMm),
    access:
      measurement.accessWidthMm === undefined
        ? ""
        : String(measurement.accessWidthMm),
  }));
  const [showAccess, setShowAccess] = useState(
    measurement.accessWidthMm !== undefined,
  );
  const [message, setMessage] = useState<string | undefined>(undefined);
  const accessInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusAccessRef = useRef(false);
  const diagramResult = parseReviewValues(values, showAccess);
  const diagramMeasurement = diagramResult.status === "complete"
    ? diagramResult.measurement
    : measurement;

  useEffect(() => {
    if (!showAccess || !shouldFocusAccessRef.current) return;
    shouldFocusAccessRef.current = false;
    accessInputRef.current?.focus();
  }, [showAccess]);

  function updateValue(field: DraftField, value: string): void {
    const nextValues = { ...values, [field]: value };
    setValues(nextValues);
    setMessage(undefined);
  }

  function persistCurrentDraft(): void {
    const result = parseReviewValues(values, showAccess);
    if (result.status !== "complete") return;
    persistPendingMeasurementReviewDraft(
      browserSessionStorage(),
      createPendingMeasurementReviewDraft(
        result.measurement,
        "mm",
        editingSpaceId,
      ),
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = parseReviewValues(values, showAccess);
    if (result.status === "invalid") {
      setMessage(result.message);
      return;
    }
    if (result.status === "incomplete") {
      setMessage("Complete width, height and depth before continuing.");
      return;
    }

    clearPendingMeasurementReviewDraft(browserSessionStorage());
    setMessage(undefined);
    onConfirm(result.measurement, editingSpaceId);
  }

  function addAccess(): void {
    shouldFocusAccessRef.current = true;
    setShowAccess(true);
    setMessage(undefined);
  }

  function removeAccess(): void {
    setShowAccess(false);
    setValues((current) => ({ ...current, access: "" }));
    setMessage(undefined);
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col bg-[#f4f7f5] px-4 pb-8 pt-8 text-[#17221f] sm:px-6">
      <header className="border-b border-[#17221f]/25 pb-5">
        <p className="fit-data text-[10px] font-bold uppercase tracking-[0.16em] text-[#17221f]/65">
          Measurement review
        </p>
        <h1 className="fit-display mt-2 text-[36px] font-bold leading-none tracking-[-0.04em]">
          Check measurements
        </h1>
        <p className="mt-3 text-base leading-6 text-[#17221f]/75">
          Correct anything before saving this space.
        </p>
      </header>

      <form className="mt-6 flex flex-1 flex-col" onSubmit={submit} noValidate>
        <div className="mb-6 border border-[#17221f]/25">
          <MeasurementEnvelopeDiagram measurement={diagramMeasurement} />
        </div>
        <fieldset>
          <legend className="fit-data text-[10px] font-bold uppercase tracking-[0.14em] text-[#17221f]/65">
            Measured envelope · millimetres
          </legend>
          <div className="mt-3 grid grid-cols-1 gap-3 min-[390px]:grid-cols-3">
            <MeasurementEdit
              id="review-width"
              label="Width"
              value={values.width}
              onChange={(value) => updateValue("width", value)}
              onBlur={persistCurrentDraft}
            />
            <MeasurementEdit
              id="review-height"
              label="Height"
              value={values.height}
              onChange={(value) => updateValue("height", value)}
              onBlur={persistCurrentDraft}
            />
            <MeasurementEdit
              id="review-depth"
              label="Depth"
              value={values.depth}
              onChange={(value) => updateValue("depth", value)}
              onBlur={persistCurrentDraft}
            />
          </div>
        </fieldset>

        <section
          aria-labelledby="doorway-review-label"
          className="mt-6 border-y border-[#17221f]/25 py-4"
        >
          <div className="flex min-h-11 items-center justify-between gap-4">
            <div>
              <h2 id="doorway-review-label" className="text-sm font-bold">
                Narrowest doorway
              </h2>
              <p className="mt-1 text-xs leading-5 text-[#17221f]/65">
                Optional delivery-path check
              </p>
            </div>
            {showAccess ? (
              <button
                type="button"
                onClick={removeAccess}
                className="min-h-11 rounded-sm px-3 text-sm font-bold underline decoration-[#17221f]/35 underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[#2f6b59] focus-visible:ring-offset-2"
              >
                Remove
              </button>
            ) : null}
          </div>

          {showAccess ? (
            <div className="mt-3 max-w-[180px]">
              <MeasurementEdit
                id="review-access"
                label="Doorway"
                value={values.access}
                inputRef={accessInputRef}
                minimum={300}
                maximum={3000}
                onChange={(value) => updateValue("access", value)}
                onBlur={persistCurrentDraft}
              />
            </div>
          ) : (
            <div className="mt-3 flex min-h-11 items-center justify-between gap-4">
              <p className="fit-data text-sm font-bold text-[#8a4b30]">
                Doorway not checked
              </p>
              <button
                type="button"
                onClick={addAccess}
                className="min-h-11 rounded-sm border border-[#17221f]/40 bg-white px-4 text-sm font-bold outline-none hover:border-[#17221f] focus-visible:ring-2 focus-visible:ring-[#2f6b59] focus-visible:ring-offset-2"
              >
                Add doorway
              </button>
            </div>
          )}
        </section>

        <p className="fit-data mt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[#17221f]/65">
          Manual measurement · ±25 mm allowance
        </p>

        {message === undefined ? null : (
          <p
            role="alert"
            className="mt-4 border-l-2 border-[#a34a3a] pl-3 text-sm leading-5 text-[#6f2f26]"
          >
            {message}
          </p>
        )}

        <div className="mt-auto grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 pt-8">
          <button
            type="button"
            onClick={onBack}
            className="min-h-12 rounded-sm border border-[#17221f]/45 bg-transparent px-4 py-3 text-base font-bold outline-none hover:border-[#17221f] focus-visible:ring-2 focus-visible:ring-[#2f6b59] focus-visible:ring-offset-2"
          >
            Back
          </button>
          <button
            type="submit"
            className="min-h-12 rounded-sm bg-[#17221f] px-5 py-3 text-base font-bold text-white outline-none hover:bg-[#263832] focus-visible:ring-2 focus-visible:ring-[#2f6b59] focus-visible:ring-offset-2"
          >
            Use this space
          </button>
        </div>
      </form>
    </main>
  );
}

interface MeasurementEditProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly inputRef?: React.Ref<HTMLInputElement>;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
}

function MeasurementEdit({
  id,
  label,
  value,
  minimum = 100,
  maximum = 10_000,
  inputRef,
  onChange,
  onBlur,
}: MeasurementEditProps): React.JSX.Element {
  return (
    <label htmlFor={id} className="block text-xs font-bold">
      {label}
      <span className="relative mt-1 block">
        <input
          ref={inputRef}
          id={id}
          aria-label={label}
          type="number"
          inputMode="numeric"
          min={minimum}
          max={maximum}
          step="1"
          required={label !== "Doorway"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          className="fit-data min-h-12 w-full rounded-sm border border-[#17221f]/45 bg-white py-3 pl-3 pr-10 text-base font-bold tabular-nums outline-none focus-visible:border-[#17221f] focus-visible:ring-2 focus-visible:ring-[#2f6b59] focus-visible:ring-offset-2"
        />
        <span className="fit-data pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-bold uppercase text-[#17221f]/65">
          mm
        </span>
      </span>
    </label>
  );
}

function parseReviewValues(
  values: Readonly<Record<DraftField, string>>,
  includeAccess: boolean,
) {
  const access = includeAccess ? `, access ${values.access}mm` : "";
  return parseMeasurementInput(
    `width ${values.width}mm, height ${values.height}mm, depth ${values.depth}mm${access}`,
    "mm",
  );
}

function browserSessionStorage(): MeasurementReviewStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
