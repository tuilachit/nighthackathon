import type { SpaceMeasurement } from "@/lib/catalog-types";
import type { SavedSpace } from "@/lib/saved-spaces";
import { SavedSpaceSwitcher } from "./SavedSpaceSwitcher";

interface MeasurementSummaryProps {
  readonly measurement: SpaceMeasurement;
  readonly onEdit?: () => void;
  readonly savedSpaces?: readonly SavedSpace[];
  readonly activeSpaceId?: string;
  readonly onSelectSpace?: (spaceId: string) => void;
  readonly onRenameSpace?: (spaceId: string, name: string) => void;
  readonly onDeleteSpace?: (spaceId: string) => void;
  readonly onNewSpace?: () => void;
}

export function MeasurementSummary({
  measurement,
  onEdit,
  savedSpaces = [],
  activeSpaceId,
  onSelectSpace,
  onRenameSpace,
  onDeleteSpace,
  onNewSpace,
}: MeasurementSummaryProps): React.JSX.Element {
  const dimensions = [
    { label: "Width", value: measurement.widthMm },
    { label: "Height", value: measurement.heightMm },
    { label: "Depth", value: measurement.depthMm },
  ];

  return (
    <section
      aria-labelledby="measurement-title"
      className="overflow-hidden rounded-sm border border-[#17221f] bg-white text-[#17221f]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#17221f]/25 px-3 py-2.5">
        <div>
          <p className="fit-data text-[9px] font-bold uppercase tracking-[0.12em] text-[#17221f]/65">
            Measured envelope · {formatSource(measurement.source)}
          </p>
          <h2 id="measurement-title" className="sr-only">
            Your space is the search filter.
          </h2>
        </div>
        {onEdit === undefined ? null : (
          <button
            type="button"
            onClick={onEdit}
            className="min-h-11 px-2 text-xs font-bold underline decoration-[#17221f]/35 underline-offset-4"
          >
            Edit
          </button>
        )}
      </div>

      <dl className="grid grid-cols-3 divide-x divide-[#17221f]/20">
        {dimensions.map((dimension) => (
          <div key={dimension.label} className="px-3 py-3">
            <dt className="fit-data text-[8px] font-bold uppercase tracking-[0.11em] text-[#17221f]/65">
              {dimension.label}
            </dt>
            <dd className="fit-data mt-1 text-xl font-bold leading-none sm:text-2xl">
              {dimension.value}
              <span className="ml-1 text-[9px] font-semibold tracking-normal text-[#17221f]/65">mm</span>
            </dd>
          </div>
        ))}
      </dl>

      {measurement.accessWidthMm !== undefined ? (
        <p className="flex items-center justify-between border-t border-[#17221f]/20 bg-[#f4f7f5] px-3 py-2 text-[10px]">
          <span className="font-semibold text-[#17221f]/70">
            Access opening · ±{measurement.uncertaintyMm} mm
          </span>
          <strong className="fit-data text-xs">{measurement.accessWidthMm} mm</strong>
        </p>
      ) : null}
      {onSelectSpace !== undefined &&
      onRenameSpace !== undefined &&
      onDeleteSpace !== undefined &&
      onNewSpace !== undefined ? (
        <SavedSpaceSwitcher
          spaces={savedSpaces}
          activeSpaceId={activeSpaceId}
          onSelect={onSelectSpace}
          onRename={onRenameSpace}
          onDelete={onDeleteSpace}
          onNew={onNewSpace}
        />
      ) : null}
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
