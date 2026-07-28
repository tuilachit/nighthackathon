import type { SpaceMeasurement } from "@/lib/catalog-types";

interface MeasurementSummaryProps {
  readonly measurement: SpaceMeasurement;
  readonly onEdit?: () => void;
}

export function MeasurementSummary({
  measurement,
  onEdit,
}: MeasurementSummaryProps): React.JSX.Element {
  const dimensions = [
    { label: "Width", value: measurement.widthMm },
    { label: "Height", value: measurement.heightMm },
    { label: "Depth", value: measurement.depthMm },
  ];

  return (
    <section
      aria-labelledby="measurement-title"
      className="overflow-hidden rounded-[28px] bg-[#1c1b18] p-5 text-white shadow-[0_24px_70px_rgba(29,27,22,0.18)] sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
            Confirmed envelope · {formatSource(measurement.source)}
          </p>
          <h2 id="measurement-title" className="mt-2 text-2xl font-black tracking-[-0.03em]">
            Your space is the search filter.
          </h2>
        </div>
        <span className="whitespace-nowrap rounded-full bg-[#d8b574] px-3 py-1.5 text-[11px] font-bold text-[#211b12]">
          ±{measurement.uncertaintyMm} mm
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-2">
        {dimensions.map((dimension) => (
          <div key={dimension.label} className="rounded-2xl bg-white/8 p-3">
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
              {dimension.label}
            </dt>
            <dd className="mt-1 text-[25px] font-black tracking-[-0.05em] sm:text-3xl">
              {dimension.value}
              <span className="ml-1 text-[10px] font-semibold tracking-normal text-white/50">mm</span>
            </dd>
          </div>
        ))}
      </dl>

      {measurement.accessWidthMm !== undefined ? (
        <p className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
          <span className="text-white/60">Narrowest access opening</span>
          <strong>{measurement.accessWidthMm} mm</strong>
        </p>
      ) : null}
      {onEdit === undefined ? null : (
        <button
          type="button"
          onClick={onEdit}
          className="mt-4 min-h-11 rounded-xl border border-white/20 px-4 text-sm font-bold text-white"
        >
          Edit measurements
        </button>
      )}
    </section>
  );
}

function formatSource(source: SpaceMeasurement["source"]): string {
  if (source === "manual") {
    return "manual tape measurement";
  }
  if (source === "webxr") {
    return "WebXR capture";
  }
  return "labeled demo fixture";
}
