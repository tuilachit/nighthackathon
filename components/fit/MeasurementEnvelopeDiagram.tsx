import type { SpaceMeasurement } from "@/lib/catalog-types";

/** A compact, explicitly schematic technical view of the active measurement contract. */
export function MeasurementEnvelopeDiagram({
  measurement,
}: {
  readonly measurement: SpaceMeasurement;
}): React.JSX.Element {
  return (
    <figure
      className="m-0 border-t border-[#17221f]/20 bg-[#f4f7f5] px-3 py-2"
      aria-label="Technical measurement envelope diagram"
    >
      <svg
        viewBox="0 0 320 142"
        role="img"
        className="h-auto w-full text-[#17221f]"
      >
        <title>
          Schematic measured envelope: {measurement.widthMm} millimetres wide, {measurement.heightMm} millimetres high, {measurement.depthMm} millimetres deep
        </title>
        <g fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke">
          <rect x="70" y="18" width="145" height="78" />
          <path d="M215 18l42 24v78l-42-24M70 18l42 24h145M112 42v78l-42-24" opacity="0.38" />
          <path d="M70 116v12M215 116v12M70 122h145" />
          <path d="M48 18H36M48 96H36M42 18v78" />
          <path d="M221 106l-7 10M258 84l-7 10M217 111l38-22" />
        </g>
        <g
          fill="currentColor"
          fontFamily='"SFMono-Regular", Consolas, "Liberation Mono", monospace'
          fontWeight="700"
        >
          <text x="142.5" y="137" textAnchor="middle" fontSize="9">
            W {measurement.widthMm} mm
          </text>
          <text x="27" y="57" textAnchor="middle" fontSize="9" transform="rotate(-90 27 57)">
            H {measurement.heightMm} mm
          </text>
          <text x="248" y="112" textAnchor="middle" fontSize="9" transform="rotate(-30 248 112)">
            D {measurement.depthMm} mm
          </text>
          <text x="76" y="31" fontSize="7" opacity="0.58">MEASURED ENVELOPE</text>
          <text x="310" y="12" textAnchor="end" fontSize="7" opacity="0.68">
            {measurement.accessWidthMm === undefined
              ? "ACCESS NOT CHECKED"
              : `ACCESS ${measurement.accessWidthMm} mm`}
          </text>
        </g>
      </svg>
      <figcaption className="fit-data mt-1 flex justify-between gap-3 text-[8px] font-bold uppercase tracking-[0.08em] text-[#17221f]/55">
        <span>Envelope schematic · not to scale</span>
        <span>±{measurement.uncertaintyMm} mm</span>
      </figcaption>
    </figure>
  );
}
