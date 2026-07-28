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
      className="mx-auto w-full max-w-xl rounded-md border border-[#17221f]/35 bg-white p-5 sm:p-7"
    >
      <p className="fit-data text-[10px] font-bold uppercase tracking-[0.14em] text-[#17221f]/65">
        Measurement input
      </p>
      <h1
        id="manual-measurement-title"
        className="fit-display mt-2 text-[34px] font-bold leading-[1.02] tracking-[-0.04em]"
      >
        Enter measured dimensions.
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#17221f]/75">
        Enter dimensions you measured with a tape measure. Live WebXR capture
        is not enabled in this portfolio build.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
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

        <p className="fit-data mt-3 min-h-5 text-[11px] leading-5 text-[#17221f]/65">
          {inchSummary ??
            `Manual measurements use a conservative ±${MANUAL_BASE_UNCERTAINTY_MM} mm uncertainty.`}
        </p>
        {error === undefined ? null : (
          <p role="alert" className="mt-2 text-sm font-bold text-[#8a4e48]">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="mt-5 min-h-12 w-full rounded-sm bg-[#17221f] px-5 text-sm font-bold text-white hover:bg-[#26332f]"
        >
          Use these measurements
        </button>
      </form>

      <div className="mt-5 border-t border-[#17221f]/20 pt-5">
        <p className="text-xs leading-5 text-[#17221f]/68">
          Need a no-camera walkthrough? Load the explicitly labeled portfolio
          fixture:{" "}
          <span className="fit-data font-bold text-[#17221f]">
            {demoMeasurement.widthMm} × {demoMeasurement.heightMm} ×{" "}
            {demoMeasurement.depthMm} mm
            {demoMeasurement.accessWidthMm === undefined
              ? ""
              : ` · ${demoMeasurement.accessWidthMm} mm access`}
          </span>
          .
        </p>
        <button
          type="button"
          onClick={() => onConfirm(demoMeasurement)}
          className="mt-3 min-h-11 rounded-sm border border-[#17221f]/35 bg-[#f4f7f5] px-4 text-sm font-bold hover:border-[#17221f]"
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
    <label htmlFor={id} className="text-xs font-bold text-[#17221f]">
      <span className="flex items-center justify-between gap-2">
        {label}
        {optional ? (
          <span className="fit-data text-[9px] uppercase tracking-[0.08em] text-[#17221f]/65">
            Optional
          </span>
        ) : null}
      </span>
      <span className="mt-2 flex items-center rounded-sm border border-[#17221f]/35 bg-[#f4f7f5] px-3 focus-within:border-[#17221f] focus-within:ring-1 focus-within:ring-[#17221f]">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="1"
          max={MAX_MEASUREMENT_MM}
          step="1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="fit-data min-h-12 min-w-0 flex-1 bg-transparent text-lg font-bold outline-none"
        />
        <span className="fit-data text-[10px] text-[#17221f]/65">mm</span>
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
