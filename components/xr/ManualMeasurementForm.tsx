"use client";

import { useState } from "react";
import { inchesToMm, manualSpaceMeasurement, mmToInches } from "@/lib/measurement-geometry";
import type { SpaceMeasurement } from "@/lib/measurement-geometry";

type Unit = "mm" | "in";

export interface ManualMeasurementFormProps {
  readonly onMeasured: (space: SpaceMeasurement) => void;
  readonly onCancel: () => void;
}

const DEFAULT_WIDTH_MM = 800;
const DEFAULT_DEPTH_MM = 400;
const DEFAULT_HEIGHT_MM = 900;

export function ManualMeasurementForm({ onMeasured, onCancel }: ManualMeasurementFormProps): React.JSX.Element {
  const [unit, setUnit] = useState<Unit>("mm");
  const [widthMm, setWidthMm] = useState<number>(DEFAULT_WIDTH_MM);
  const [depthMm, setDepthMm] = useState<number>(DEFAULT_DEPTH_MM);
  const [heightMm, setHeightMm] = useState<number>(DEFAULT_HEIGHT_MM);

  const canContinue = widthMm > 0 && depthMm > 0 && heightMm > 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canContinue) return;
    onMeasured(manualSpaceMeasurement({ widthMm, depthMm, heightMm }));
  }

  return (
    <main className="flex min-h-screen flex-col bg-white text-[#0B0B0C] safe-bottom">
      <div className="flex items-center gap-3 px-5 pt-6">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 5L8 12L15 19" stroke="#0B0B0C" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col px-5 pt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Step 1 · Space</p>
        <div className="mt-2 flex items-start gap-3">
          <h1 className="flex-1 text-[28px] font-black leading-tight">Enter the space</h1>
          <UnitToggle unit={unit} onChange={setUnit} />
        </div>
        <p className="mt-1 max-w-[300px] text-[13.5px] leading-5 text-slate-500">
          Measure the awkward gap with a tape measure. You can correct these any time.
        </p>

        <FieldDiagram />

        <NumberField label="Width" unit={unit} valueMm={widthMm} onChangeMm={setWidthMm} autoFocus />
        <NumberField label="Depth" unit={unit} valueMm={depthMm} onChangeMm={setDepthMm} />
        <NumberField label="Height" unit={unit} valueMm={heightMm} onChangeMm={setHeightMm} />

        <div className="mt-auto pb-8 pt-6">
          <div className="mb-4 rounded-2xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-500">
            We apply a small safety clearance on top of these numbers — nothing shown as &ldquo;Fits&rdquo; cuts it
            exactly close.
          </div>
          <button
            type="submit"
            disabled={!canContinue}
            className="w-full rounded-2xl bg-black py-4 text-[15px] font-extrabold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Continue
          </button>
        </div>
      </form>
    </main>
  );
}

function UnitToggle({ unit, onChange }: { readonly unit: Unit; readonly onChange: (unit: Unit) => void }): React.JSX.Element {
  const options: readonly Unit[] = ["mm", "in"];

  return (
    <div className="mt-1 flex flex-shrink-0 gap-0.5 rounded-full bg-slate-100 p-0.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={unit === option}
          className={`rounded-full px-3 py-1.5 text-[11.5px] font-extrabold ${
            unit === option ? "bg-white text-black shadow-sm" : "text-slate-500"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function FieldDiagram(): React.JSX.Element {
  return (
    <div className="my-4 flex items-center justify-center rounded-[22px] bg-slate-50 p-5" aria-hidden="true">
      <svg width="200" height="128" viewBox="0 0 220 140" fill="none">
        <rect x="20" y="20" width="150" height="90" rx="6" stroke="#0B0B0C" strokeWidth={2} strokeDasharray="5 5" />
        <path d="M20 122h150" stroke="#9CA3AF" strokeWidth={1.4} />
        <path d="M20 118v8M170 118v8" stroke="#9CA3AF" strokeWidth={1.4} />
        <text x="95" y="136" fontSize="11" fill="#6B7280" textAnchor="middle">
          width
        </text>
        <path d="M182 20v90" stroke="#9CA3AF" strokeWidth={1.4} />
        <path d="M178 20h8M178 110h8" stroke="#9CA3AF" strokeWidth={1.4} />
        <text x="205" y="68" fontSize="11" fill="#9CA3AF" textAnchor="middle" transform="rotate(90 205 68)">
          depth
        </text>
        <text x="80" y="12" fontSize="11" fill="#9CA3AF">
          height ↑
        </text>
      </svg>
    </div>
  );
}

function NumberField({
  label,
  unit,
  valueMm,
  onChangeMm,
  autoFocus,
}: {
  readonly label: string;
  readonly unit: Unit;
  readonly valueMm: number;
  readonly onChangeMm: (mm: number) => void;
  readonly autoFocus?: boolean;
}): React.JSX.Element {
  const displayValue = unit === "mm" ? valueMm : Number(mmToInches(valueMm).toFixed(1));

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const raw = Number(event.target.value);
    if (Number.isNaN(raw)) return;
    onChangeMm(unit === "mm" ? raw : inchesToMm(raw));
  }

  return (
    <label className="mb-3.5 block rounded-2xl border border-black/10 p-4">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <div className="mt-1 flex items-baseline gap-2">
        <input
          type="number"
          inputMode="decimal"
          step={unit === "mm" ? 1 : 0.1}
          value={displayValue}
          onChange={handleChange}
          autoFocus={autoFocus}
          aria-label={`${label} in ${unit === "mm" ? "millimetres" : "inches"}`}
          className="w-28 border-none bg-transparent text-[28px] font-black text-slate-950 outline-none"
        />
        <span className="text-sm font-bold text-slate-400">{unit}</span>
      </div>
    </label>
  );
}
