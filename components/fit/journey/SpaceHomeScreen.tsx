"use client";

import Link from "next/link";
import { MeasurementEnvelopeDiagram } from "@/components/fit/MeasurementEnvelopeDiagram";
import { useFitJourney } from "./FitJourneyProvider";
import { JourneyLoading, JourneyShell } from "./JourneyShell";

/** Presents either the latest saved space or the single first-visit entry action. */
export function SpaceHomeScreen({
  initialMode = "describe",
}: {
  readonly initialMode?: "describe" | "link";
}): React.JSX.Element {
  const { ready, activeSpace, savedSpaces, selectSpace } = useFitJourney();
  const measurementHref = initialMode === "link"
    ? "/fit/space?mode=link"
    : "/fit/space";
  const searchHref = initialMode === "link"
    ? "/fit/search?mode=link"
    : "/fit/search";

  if (!ready) {
    return <JourneyLoading />;
  }

  if (activeSpace === undefined) {
    return (
      <JourneyShell
        title="Start with your space"
        support="Add the clear space where the furniture needs to fit."
        status="Space"
      >
        <div className="mt-auto grid gap-3 pt-8">
          <Link
            href={measurementHref}
            className="flex min-h-12 items-center justify-center rounded-sm bg-[#17221f] px-5 text-sm font-bold text-white transition-colors hover:bg-[#2a3b36]"
          >
            Add your space
          </Link>
          <Link
            href="/fit/demo/results?tier=fits"
            className="inline-flex min-h-11 items-center justify-center text-sm font-bold underline decoration-[#17221f]/30 underline-offset-4 hover:decoration-[#17221f]"
          >
            Try the demo space
          </Link>
        </div>
      </JourneyShell>
    );
  }

  return (
    <JourneyShell
      title="Use this space?"
      support="Your latest saved measurements are ready."
      status="Space"
    >
      <section className="border border-[#17221f]/25 bg-[#f4f7f5]" aria-label="Current saved space">
        <div className="flex items-start justify-between gap-4 border-b border-[#17221f]/20 px-4 py-3">
          <div>
            <p className="text-sm font-bold">{activeSpace.name}</p>
            <p className="fit-data mt-1 text-[11px] font-bold text-[#17221f]/68">
              {formatMeasurement(activeSpace.measurement)}
            </p>
          </div>
          <Link
            href={`/fit/space?edit=${encodeURIComponent(activeSpace.id)}${initialMode === "link" ? "&mode=link" : ""}`}
            className="inline-flex min-h-11 items-center text-xs font-bold underline decoration-[#17221f]/30 underline-offset-4"
          >
            Edit
          </Link>
        </div>
        <MeasurementEnvelopeDiagram measurement={activeSpace.measurement} />
      </section>

      {savedSpaces.length > 1 ? (
        <details className="mt-4 border-y border-[#17221f]/20 py-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold">
            Choose another saved space
          </summary>
          <div className="grid gap-2 pb-2">
            {savedSpaces
              .filter((space) => space.id !== activeSpace.id)
              .map((space) => (
                <button
                  key={space.id}
                  type="button"
                  className="min-h-11 border border-[#17221f]/25 bg-white px-3 text-left text-sm font-bold hover:border-[#17221f]"
                  onClick={() => selectSpace(space.id)}
                >
                  {space.name}
                  <span className="fit-data mt-1 block text-[10px] text-[#17221f]/65">
                    {formatMeasurement(space.measurement)}
                  </span>
                </button>
              ))}
          </div>
        </details>
      ) : null}

      <div className="mt-auto grid gap-2 pt-8">
        <Link
          href={searchHref}
          className="flex min-h-12 items-center justify-center rounded-sm bg-[#17221f] px-5 text-sm font-bold text-white transition-colors hover:bg-[#2a3b36]"
        >
          Use this space
        </Link>
        <Link
          href={measurementHref}
          className="inline-flex min-h-11 items-center justify-center text-sm font-bold underline decoration-[#17221f]/30 underline-offset-4 hover:decoration-[#17221f]"
        >
          Add another space
        </Link>
        <Link
          href="/fit/demo/results?tier=fits"
          className="inline-flex min-h-11 items-center justify-center text-xs font-bold text-[#17221f]/68 underline decoration-[#17221f]/25 underline-offset-4"
        >
          Try the demo instead
        </Link>
      </div>
    </JourneyShell>
  );
}

export function CompactSpaceReadout({
  editHref = "/fit/space",
}: {
  readonly editHref?: string;
}): React.JSX.Element | null {
  const { ready, activeSpace } = useFitJourney();
  if (!ready || activeSpace === undefined) {
    return null;
  }
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-y border-[#17221f]/20 bg-[#f4f7f5] px-3 py-2">
      <div>
        <p className="text-xs font-bold">{activeSpace.name}</p>
        <p className="fit-data mt-0.5 text-[10px] font-bold text-[#17221f]/65">
          {formatMeasurement(activeSpace.measurement)}
        </p>
      </div>
      <Link
        href={`${editHref}${editHref.includes("?") ? "&" : "?"}edit=${encodeURIComponent(activeSpace.id)}`}
        className="inline-flex min-h-11 items-center text-xs font-bold underline decoration-[#17221f]/30 underline-offset-4"
      >
        Edit
      </Link>
    </div>
  );
}

function formatMeasurement(
  measurement: NonNullable<ReturnType<typeof useFitJourney>["activeSpace"]>["measurement"],
): string {
  const dimensions = `${measurement.widthMm} W × ${measurement.heightMm} H × ${measurement.depthMm} D mm`;
  return measurement.accessWidthMm === undefined
    ? `${dimensions} · doorway not checked`
    : `${dimensions} · door ${measurement.accessWidthMm} mm`;
}
