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
      className="overflow-hidden rounded-md border border-[#17221f] bg-white text-[#17221f]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#17221f]/25 px-4 py-4 sm:px-5">
        <div>
          <p className="fit-data text-[9px] font-bold uppercase tracking-[0.12em] text-[#17221f]/65">
            Measured envelope · {formatSource(measurement.source)}
          </p>
          <h2 id="measurement-title" className="fit-display mt-1 text-xl font-bold tracking-[-0.025em]">
            Your space is the search filter.
          </h2>
        </div>
        <span className="fit-data whitespace-nowrap border border-[#17221f]/30 bg-[#f4f7f5] px-2.5 py-1.5 text-[10px] font-bold">
          ±{measurement.uncertaintyMm} mm
        </span>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-[#17221f]/20">
        {dimensions.map((dimension) => (
          <div key={dimension.label} className="px-3 py-4 sm:px-4">
            <dt className="fit-data text-[9px] font-bold uppercase tracking-[0.11em] text-[#17221f]/65">
              {dimension.label}
            </dt>
            <dd className="fit-data mt-1 text-[26px] font-bold leading-none sm:text-3xl">
              {dimension.value}
              <span className="ml-1 text-[9px] font-semibold tracking-normal text-[#17221f]/65">mm</span>
            </dd>
          </div>
        ))}
      </dl>

      {measurement.accessWidthMm !== undefined ? (
        <p className="flex items-center justify-between border-t border-[#17221f]/20 bg-[#f4f7f5] px-4 py-3 text-xs">
          <span className="font-semibold text-[#17221f]/70">Narrowest access opening</span>
          <strong className="fit-data text-sm">{measurement.accessWidthMm} mm</strong>
        </p>
      ) : null}
      {onEdit === undefined ? null : (
        <div className="border-t border-[#17221f]/20 px-4 py-3">
          <button
            type="button"
            onClick={onEdit}
            className="min-h-11 rounded-sm border border-[#17221f]/35 px-4 text-xs font-bold hover:border-[#17221f]"
          >
            Edit measurements
          </button>
        </div>
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
