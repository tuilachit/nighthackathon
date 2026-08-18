"use client";

import { useState } from "react";
import type { SpaceMeasurement } from "@/lib/catalog-types";
import {
  MEASUREMENT_UNITS,
  parseMeasurementInput,
} from "@/lib/measurement-parser";
import type {
  MeasurementField,
  MeasurementUnit,
} from "@/lib/measurement-parser";
import {
  createPendingMeasurementReviewDraft,
  persistPendingMeasurementReviewDraft,
} from "@/lib/pending-measurement-review";
import type { MeasurementReviewStorage } from "@/lib/pending-measurement-review";

export interface SpaceMeasurementInputProps {
  readonly initialMeasurement?: SpaceMeasurement;
  readonly editingSpaceId?: string;
  readonly onParsed: (
    measurement: SpaceMeasurement,
    editingSpaceId?: string,
  ) => void;
}

/** Collects a compact measurement sentence and hands normalized millimetres to its parent. */
export function SpaceMeasurementInput({
  initialMeasurement,
  editingSpaceId,
  onParsed,
}: SpaceMeasurementInputProps): React.JSX.Element {
  const [selectedUnit, setSelectedUnit] = useState<MeasurementUnit>("cm");
  const [input, setInput] = useState(() =>
    initialMeasurement === undefined
      ? ""
      : formatInitialMeasurement(initialMeasurement),
  );
  const [message, setMessage] = useState<string | undefined>(undefined);

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = parseMeasurementInput(input, selectedUnit);
    if (result.status === "invalid") {
      setMessage(result.message);
      return;
    }
    if (result.status === "incomplete") {
      setMessage(missingMessage(result.missing));
      return;
    }

    const draft = createPendingMeasurementReviewDraft(
      result.measurement,
      result.detectedUnit,
      editingSpaceId,
    );
    persistPendingMeasurementReviewDraft(browserSessionStorage(), draft);
    setMessage(undefined);
    onParsed(result.measurement, editingSpaceId);
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col bg-[#f4f7f5] px-4 pb-8 pt-8 text-[#17221f] sm:px-6">
      <header className="border-b border-[#17221f]/25 pb-5">
        <p className="fit-data text-[10px] font-bold uppercase tracking-[0.16em] text-[#17221f]/60">
          Space measurement
        </p>
        <h1 className="fit-display mt-2 text-[36px] font-bold leading-none tracking-[-0.04em]">
          Enter your space
        </h1>
        <p className="mt-3 text-base leading-6 text-[#17221f]/75">
          Paste the measurements in one line.
        </p>
      </header>

      <form className="mt-6 flex flex-1 flex-col" onSubmit={submit} noValidate>
        <label
          htmlFor="space-measurement-input"
          className="text-sm font-bold"
        >
          Space and doorway measurements
        </label>
        <textarea
          id="space-measurement-input"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setMessage(undefined);
          }}
          placeholder="90 cm wide, 180 high, 35 deep, doorway 82"
          rows={3}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="space-measurement-hint space-measurement-error"
          className="fit-data mt-2 min-h-[112px] w-full resize-y rounded-sm border border-[#17221f]/45 bg-white px-3 py-3 text-base leading-6 shadow-none outline-none placeholder:text-[#17221f]/40 focus-visible:border-[#17221f] focus-visible:ring-2 focus-visible:ring-[#2f6b59] focus-visible:ring-offset-2"
        />
        <p
          id="space-measurement-hint"
          className="mt-2 text-xs leading-5 text-[#17221f]/65"
        >
          Width, height and depth are required. Doorway access is optional and
          must be labelled.
        </p>

        <label
          htmlFor="space-measurement-unit"
          className="mt-5 text-sm font-bold"
        >
          Default unit
        </label>
        <select
          id="space-measurement-unit"
          value={selectedUnit}
          onChange={(event) => {
            setSelectedUnit(event.target.value as MeasurementUnit);
            setMessage(undefined);
          }}
          className="fit-data mt-2 min-h-11 w-full rounded-sm border border-[#17221f]/45 bg-white px-3 text-base font-bold outline-none focus-visible:border-[#17221f] focus-visible:ring-2 focus-visible:ring-[#2f6b59] focus-visible:ring-offset-2"
        >
          {MEASUREMENT_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>

        {message === undefined ? null : (
          <p
            id="space-measurement-error"
            role="alert"
            className="mt-4 border-l-2 border-[#a34a3a] pl-3 text-sm leading-5 text-[#6f2f26]"
          >
            {message}
          </p>
        )}

        <div className="mt-auto pt-8">
          <button
            type="submit"
            className="min-h-12 w-full rounded-sm bg-[#17221f] px-5 py-3 text-base font-bold text-white outline-none hover:bg-[#263832] focus-visible:ring-2 focus-visible:ring-[#2f6b59] focus-visible:ring-offset-2"
          >
            Check measurements
          </button>
        </div>
      </form>
    </main>
  );
}

function missingMessage(missing: readonly MeasurementField[]): string {
  const labels = missing.map((field) => field);
  if (labels.length === 1) return `Add ${labels[0]} before continuing.`;
  if (labels.length === 2) {
    return `Add ${labels[0]} and ${labels[1]} before continuing.`;
  }
  return "Add width, height and depth before continuing.";
}

function formatInitialMeasurement(measurement: SpaceMeasurement): string {
  const parts = [
    `width ${formatCentimetres(measurement.widthMm)}`,
    `height ${formatCentimetres(measurement.heightMm)}`,
    `depth ${formatCentimetres(measurement.depthMm)}`,
  ];
  if (measurement.accessWidthMm !== undefined) {
    parts.push(`doorway ${formatCentimetres(measurement.accessWidthMm)}`);
  }
  return `${parts.join(", ")} cm`;
}

function formatCentimetres(valueMm: number): string {
  return Number((valueMm / 10).toFixed(1)).toString();
}

function browserSessionStorage(): MeasurementReviewStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
