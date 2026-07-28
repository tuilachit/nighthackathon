"use client";

import { useMemo, useState } from "react";
import type { SpaceMeasurement } from "@/lib/catalog-types";
import {
  MANUAL_BASE_UNCERTAINTY_MM,
  manualSpaceMeasurement,
  mmToInches,
} from "@/lib/measurement-geometry";

interface ManualMeasurementFormProps {
  readonly demoMeasurement: SpaceMeasurement;
  readonly onConfirm: (measurement: SpaceMeasurement) => void;
}

interface MeasurementFields {
  readonly widthMm: string;
  readonly heightMm: string;
  readonly depthMm: string;
  readonly accessWidthMm: string;
}

const EMPTY_FIELDS: MeasurementFields = {
  widthMm: "",
  heightMm: "",
  depthMm: "",
  accessWidthMm: "",
};
const MAX_MEASUREMENT_MM = 20_000;

/**
 * Collects tape-measure dimensions as the portfolio-safe measurement entry.
 * No camera or scanning behavior is implied by this form.
 */
export function ManualMeasurementForm({
  demoMeasurement,
  onConfirm,
}: ManualMeasurementFormProps): React.JSX.Element {
  const [fields, setFields] = useState<MeasurementFields>(EMPTY_FIELDS);
  const [error, setError] = useState<string | undefined>(undefined);
  const inchSummary = useMemo(() => formatInchSummary(fields), [fields]);

  function updateField(
    field: keyof MeasurementFields,
    value: string,
  ): void {
    setFields((current) => ({ ...current, [field]: value }));
    setError(undefined);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const widthMm = parseMeasurement(fields.widthMm);
    const heightMm = parseMeasurement(fields.heightMm);
    const depthMm = parseMeasurement(fields.depthMm);
    const accessWidthMm =
      fields.accessWidthMm.trim().length === 0
        ? undefined
        : parseMeasurement(fields.accessWidthMm);

    if (
      widthMm === undefined ||
      heightMm === undefined ||
      depthMm === undefined ||
      (fields.accessWidthMm.trim().length > 0 &&
        accessWidthMm === undefined)
    ) {
      setError(
        `Enter positive measurements up to ${MAX_MEASUREMENT_MM.toLocaleString()} mm.`,
      );
      return;
    }

    const measurement = manualSpaceMeasurement(
      { widthMm, heightMm, depthMm },
      MANUAL_BASE_UNCERTAINTY_MM,
    );
    onConfirm({
      ...measurement,
      ...(accessWidthMm === undefined ? {} : { accessWidthMm }),
    });
  }

  return (
    <section
      aria-labelledby="manual-measurement-title"
      className="mx-auto w-full max-w-xl rounded-[28px] border border-[#ded8cd] bg-white p-5 shadow-sm sm:p-7"
    >
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#8c7c61]">
        Step 1 · Manual measurement
      </p>
      <h1
        id="manual-measurement-title"
        className="mt-2 text-4xl font-black tracking-[-0.05em]"
      >
        Measure the space first.
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#625b50]">
        Enter dimensions you measured with a tape measure. Live WebXR capture
        is not enabled in this portfolio build.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <MeasurementField
            id="space-width"
            label="Width"
            value={fields.widthMm}
            onChange={(value) => updateField("widthMm", value)}
          />
          <MeasurementField
            id="space-height"
            label="Height"
            value={fields.heightMm}
            onChange={(value) => updateField("heightMm", value)}
          />
          <MeasurementField
            id="space-depth"
            label="Depth"
            value={fields.depthMm}
            onChange={(value) => updateField("depthMm", value)}
          />
          <MeasurementField
            id="access-width"
            label="Narrowest access opening"
            value={fields.accessWidthMm}
            optional
            onChange={(value) => updateField("accessWidthMm", value)}
          />
        </div>

        <p className="mt-3 min-h-5 text-xs font-semibold text-[#766e61]">
          {inchSummary ??
            `Manual measurements use a conservative ±${MANUAL_BASE_UNCERTAINTY_MM} mm uncertainty.`}
        </p>
        {error === undefined ? null : (
          <p role="alert" className="mt-2 text-sm font-bold text-[#9b3d2f]">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="mt-5 min-h-12 w-full rounded-xl bg-[#1c1b18] px-5 text-sm font-bold text-white"
        >
          Use these measurements
        </button>
      </form>

      <div className="mt-5 border-t border-[#eee9e0] pt-5">
        <p className="text-xs leading-5 text-[#766e61]">
          Need a no-camera walkthrough? Load the explicitly labeled portfolio
          fixture: {demoMeasurement.widthMm} × {demoMeasurement.heightMm} ×{" "}
          {demoMeasurement.depthMm} mm
          {demoMeasurement.accessWidthMm === undefined
            ? ""
            : `, ${demoMeasurement.accessWidthMm} mm access`}.
        </p>
        <button
          type="button"
          onClick={() => onConfirm(demoMeasurement)}
          className="mt-3 min-h-11 rounded-xl border border-[#cfc7ba] bg-[#fbfaf7] px-4 text-sm font-bold"
        >
          Use labeled demo measurement
        </button>
      </div>
    </section>
  );
}

function MeasurementField({
  id,
  label,
  value,
  optional = false,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly optional?: boolean;
  readonly onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label htmlFor={id} className="text-sm font-bold text-[#4f493f]">
      <span className="flex items-center justify-between gap-2">
        {label}
        {optional ? (
          <span className="text-[10px] uppercase tracking-wide text-[#8b8377]">
            Optional
          </span>
        ) : null}
      </span>
      <span className="mt-2 flex items-center rounded-xl border border-[#cfc7ba] bg-[#fbfaf7] px-3 focus-within:border-[#a47b38]">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="1"
          max={MAX_MEASUREMENT_MM}
          step="1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-12 min-w-0 flex-1 bg-transparent text-base font-semibold outline-none"
        />
        <span className="text-xs text-[#81796c]">mm</span>
      </span>
    </label>
  );
}

function parseMeasurement(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) &&
    parsed > 0 &&
    parsed <= MAX_MEASUREMENT_MM
    ? Math.round(parsed)
    : undefined;
}

function formatInchSummary(fields: MeasurementFields): string | undefined {
  const dimensions = [
    parseMeasurement(fields.widthMm),
    parseMeasurement(fields.heightMm),
    parseMeasurement(fields.depthMm),
  ];
  if (dimensions.some((value) => value === undefined)) {
    return undefined;
  }
  return `Approximately ${dimensions
    .map((value) => mmToInches(value ?? 0).toFixed(1))
    .join(" × ")} inches (W × H × D).`;
}
