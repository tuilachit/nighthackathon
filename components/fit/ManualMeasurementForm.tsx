"use client";

import { useState } from "react";
import type { SpaceMeasurement } from "@/lib/catalog-types";
import {
  MANUAL_BASE_UNCERTAINTY_MM,
  manualSpaceMeasurement,
} from "@/lib/measurement-geometry";

interface ManualMeasurementFormProps {
  readonly demoMeasurement: SpaceMeasurement;
  readonly onConfirm: (measurement: SpaceMeasurement) => void;
}

type MeasurementUnit = "mm" | "cm";
type MeasurementField =
  | "widthMm"
  | "heightMm"
  | "depthMm"
  | "accessWidthMm";

interface MeasurementStep {
  readonly field: MeasurementField;
  readonly label: string;
  readonly prompt: string;
  readonly help: string;
}

const MEASUREMENT_STEPS: readonly MeasurementStep[] = [
  {
    field: "widthMm",
    label: "Width",
    prompt: "How wide is the available space?",
    help: "Measure from the left edge to the right edge at the narrowest point.",
  },
  {
    field: "heightMm",
    label: "Height",
    prompt: "How high is the available space?",
    help: "Measure from the floor to the lowest obstruction above it.",
  },
  {
    field: "depthMm",
    label: "Depth",
    prompt: "How deep is the available space?",
    help: "Measure from the back surface to the furthest usable front edge.",
  },
  {
    field: "accessWidthMm",
    label: "Narrowest access opening",
    prompt: "What is the narrowest opening on the delivery path?",
    help: "Check doorways, stair turns and lifts between the entrance and this space.",
  },
] as const;

const MIN_MEASUREMENT_MM = 100;
const MAX_MEASUREMENT_MM = 10_000;

/**
 * Guides a user through tape-measuring their available space and delivery access.
 * Values are normalized to millimetres before creating the shared measurement contract.
 */
export function ManualMeasurementForm({
  demoMeasurement,
  onConfirm,
}: ManualMeasurementFormProps): React.JSX.Element {
  const [unit, setUnit] = useState<MeasurementUnit>("mm");
  const [stepIndex, setStepIndex] = useState(0);
  const [completedValues, setCompletedValues] = useState<
    Partial<Record<MeasurementField, number>>
  >({});
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const step = MEASUREMENT_STEPS[stepIndex];

  function changeUnit(nextUnit: MeasurementUnit): void {
    if (nextUnit === unit) {
      return;
    }

    const parsed = Number(draft);
    if (draft.trim().length > 0 && Number.isFinite(parsed)) {
      const millimetres = unit === "cm" ? parsed * 10 : parsed;
      setDraft(formatForUnit(millimetres, nextUnit));
    }
    setUnit(nextUnit);
    setError(undefined);
  }

  function moveToStep(nextStepIndex: number, values = completedValues): void {
    setStepIndex(nextStepIndex);
    const nextField = MEASUREMENT_STEPS[nextStepIndex].field;
    const existingValue = values[nextField];
    setDraft(
      existingValue === undefined ? "" : formatForUnit(existingValue, unit),
    );
    setError(undefined);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const measurementMm = parseMeasurement(draft, unit);
    const validationError = validateMeasurement(measurementMm, step.label);

    if (validationError !== undefined) {
      setError(validationError);
      return;
    }

    const nextValues = {
      ...completedValues,
      [step.field]: measurementMm,
    };
    setCompletedValues(nextValues);

    if (stepIndex < MEASUREMENT_STEPS.length - 1) {
      moveToStep(stepIndex + 1, nextValues);
      return;
    }

    const widthMm = nextValues.widthMm;
    const heightMm = nextValues.heightMm;
    const depthMm = nextValues.depthMm;
    const accessWidthMm = nextValues.accessWidthMm;
    if (
      widthMm === undefined ||
      heightMm === undefined ||
      depthMm === undefined ||
      accessWidthMm === undefined
    ) {
      return;
    }

    const measurement = manualSpaceMeasurement(
      { widthMm, heightMm, depthMm },
      MANUAL_BASE_UNCERTAINTY_MM,
    );
    onConfirm({ ...measurement, accessWidthMm });
  }

  return (
    <section
      aria-labelledby="manual-measurement-title"
      className="mx-auto w-full max-w-xl rounded-md border border-[#17221f]/35 bg-white p-5 sm:p-7"
    >
      <h1
        id="manual-measurement-title"
        className="fit-display text-[34px] font-bold leading-[1.02] tracking-[-0.04em]"
      >
        Measure the space furniture has to fit.
      </h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-[#17221f]/75">
        Four tape measurements turn the catalog into furniture sized for your
        room and its delivery path.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 border-[#17221f]/25 pl-3">
        <button
          type="button"
          onClick={() => onConfirm(demoMeasurement)}
          className="min-h-11 rounded-sm border border-[#17221f]/35 bg-[#f4f7f5] px-4 text-sm font-bold hover:border-[#17221f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f]"
        >
          Try a demo space
        </button>
        <p className="fit-data text-[9px] leading-4 text-[#17221f]/65">
          Labeled demo · {demoMeasurement.widthMm} × {demoMeasurement.heightMm} × {" "}
          {demoMeasurement.depthMm} mm
          {demoMeasurement.accessWidthMm === undefined
            ? ""
            : ` · ${demoMeasurement.accessWidthMm} mm access`}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between border-y border-[#17221f]/20 py-3">
        <p
          aria-live="polite"
          className="fit-data text-[10px] font-bold uppercase tracking-[0.12em] text-[#17221f]/65"
        >
          Step {stepIndex + 1} of {MEASUREMENT_STEPS.length} · {step.label}
        </p>
        <div
          role="group"
          aria-label="Measurement unit"
          className="flex rounded-sm border border-[#17221f]/35 p-0.5"
        >
          {(["mm", "cm"] as const).map((candidateUnit) => (
            <button
              key={candidateUnit}
              type="button"
              aria-pressed={unit === candidateUnit}
              onClick={() => changeUnit(candidateUnit)}
              className={`fit-data min-h-9 min-w-11 rounded-[1px] px-2 text-[11px] font-bold uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f] ${
                unit === candidateUnit
                  ? "bg-[#17221f] text-white"
                  : "bg-white text-[#17221f]"
              }`}
            >
              {candidateUnit}
            </button>
          ))}
        </div>
      </div>

      <ol aria-label="Measurement progress" className="mt-4 grid grid-cols-4 gap-2">
        {MEASUREMENT_STEPS.map((candidateStep, index) => (
          <li key={candidateStep.field}>
            <span
              aria-hidden="true"
              className={`block h-1 ${
                index <= stepIndex ? "bg-[#17221f]" : "bg-[#17221f]/18"
              }`}
            />
            <span className="sr-only">
              {candidateStep.label}: {index < stepIndex ? "complete" : index === stepIndex ? "current" : "not started"}
            </span>
          </li>
        ))}
      </ol>

      <form onSubmit={handleSubmit} className="mt-6">
        <label htmlFor="measurement-value" className="block">
          <span className="fit-display block text-xl font-bold tracking-[-0.02em]">
            {step.prompt}
          </span>
          <span className="mt-2 block text-xs leading-5 text-[#17221f]/68">
            {step.help}
          </span>
          <span className="mt-4 flex items-baseline rounded-sm border border-[#17221f]/35 bg-[#f4f7f5] px-4 focus-within:border-[#17221f] focus-within:ring-1 focus-within:ring-[#17221f]">
            <input
              id="measurement-value"
              aria-describedby="measurement-range"
              aria-invalid={error !== undefined}
              autoFocus
              type="number"
              inputMode="decimal"
              step={unit === "cm" ? "0.1" : "1"}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(undefined);
              }}
              className="fit-measurement-input fit-data min-h-16 min-w-0 flex-1 bg-transparent text-[32px] font-bold leading-none outline-none"
            />
            <span className="fit-data ml-2 text-xs font-bold uppercase text-[#17221f]/65">
              {unit}
            </span>
          </span>
        </label>
        <p
          id="measurement-range"
          className="fit-data mt-2 text-[10px] leading-5 text-[#17221f]/65"
        >
          Accepted range: {formatForUnit(MIN_MEASUREMENT_MM, unit)}–
          {formatForUnit(MAX_MEASUREMENT_MM, unit)} {unit}
        </p>
        {error === undefined ? null : (
          <p role="alert" className="mt-2 text-sm font-bold text-[#8a4e48]">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          {stepIndex === 0 ? null : (
            <button
              type="button"
              onClick={() => moveToStep(stepIndex - 1)}
              className="min-h-12 rounded-sm border border-[#17221f]/35 bg-white px-5 text-sm font-bold hover:border-[#17221f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f]"
            >
              Back
            </button>
          )}
          <button
            type="submit"
            className="min-h-12 flex-1 rounded-sm bg-[#17221f] px-5 text-sm font-bold text-white hover:bg-[#26332f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f]"
          >
            {stepIndex === MEASUREMENT_STEPS.length - 1
              ? "Find furniture that fits"
              : "Continue"}
          </button>
        </div>
      </form>

      <dl className="mt-6 grid grid-cols-3 gap-2 border-t border-[#17221f]/20 pt-4">
        {MEASUREMENT_STEPS.slice(0, 3).map((candidateStep) => {
          const value = completedValues[candidateStep.field];
          return (
            <div key={candidateStep.field}>
              <dt className="fit-data text-[8px] font-bold uppercase tracking-[0.1em] text-[#17221f]/55">
                {candidateStep.label}
              </dt>
              <dd className="fit-data mt-1 min-h-5 text-sm font-bold">
                {value === undefined ? "—" : `${formatForUnit(value, unit)} ${unit}`}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="fit-data mt-3 text-[10px] leading-5 text-[#17221f]/65">
        Manual measurements use a conservative ±{MANUAL_BASE_UNCERTAINTY_MM} mm uncertainty.
      </p>

    </section>
  );
}

function parseMeasurement(value: string, unit: MeasurementUnit): number | undefined {
  const parsed = Number(value);
  if (value.trim().length === 0 || !Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.round(unit === "cm" ? parsed * 10 : parsed);
}

function validateMeasurement(
  measurementMm: number | undefined,
  label: string,
): string | undefined {
  const normalizedLabel = label.toLowerCase();
  if (measurementMm === undefined) {
    return `Enter the ${normalizedLabel} before continuing.`;
  }
  if (measurementMm < MIN_MEASUREMENT_MM) {
    return `${label} must be at least 100 mm (10 cm).`;
  }
  if (measurementMm > MAX_MEASUREMENT_MM) {
    return `${label} must be no more than 10,000 mm (1,000 cm).`;
  }
  return undefined;
}

function formatForUnit(
  millimetres: number,
  unit: MeasurementUnit,
): string {
  if (unit === "mm") {
    return String(Math.round(millimetres));
  }
  return String(Number((millimetres / 10).toFixed(1)));
}
