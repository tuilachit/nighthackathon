import Image from "next/image";
import type { EvaluatedProduct } from "@/lib/catalog-types";

interface ProductCardProps {
  readonly entry: EvaluatedProduct;
  readonly status: "fit" | "access" | "near-miss";
  readonly isCompared?: boolean;
  readonly compareDisabled?: boolean;
  readonly onToggleCompare?: () => void;
  readonly onSelect?: () => void;
}

export function ProductCard({
  entry,
  status,
  isCompared = false,
  compareDisabled = false,
  onToggleCompare,
  onSelect,
}: ProductCardProps): React.JSX.Element {
  const { product, fit, access } = entry;
  const statusCopy =
    status === "fit"
      ? `${fit.minimumClearanceMm} mm minimum clearance`
      : status === "access" && access.status === "failed"
        ? access.reason
        : fit.reasons[0] ?? "Measurement needs review.";
  const statusClasses =
    status === "fit"
      ? "border-l-[#3f6b57]"
      : status === "access"
        ? "border-l-[#8a632d]"
        : "border-l-[#8a4e48]";
  const statusTextClasses =
    status === "fit"
      ? "text-[#3f6b57]"
      : status === "access"
        ? "text-[#8a632d]"
        : "text-[#8a4e48]";

  return (
    <article
      className={`overflow-hidden rounded-md border border-l-[3px] border-[#17221f]/25 bg-white ${statusClasses}`}
      data-testid={`product-${product.id}`}
    >
      <div className="grid grid-cols-[104px_1fr] gap-3 p-3 sm:grid-cols-[144px_1fr] sm:gap-4">
        <Image
          src={product.imagePath}
          alt={`${product.name} ${product.imageSourceUrl === undefined ? "product illustration" : "retailer product photo"}`}
          width={320}
          height={240}
          className="h-[136px] w-full rounded-sm border border-[#17221f]/15 bg-[#f4f7f5] object-contain"
        />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="fit-data border border-[#17221f]/20 bg-[#f4f7f5] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#17221f]/75">
              {product.retailer}
            </span>
            <span className="border border-[#3f6b57]/25 bg-[#3f6b57]/10 px-2 py-1 text-[9px] font-bold text-[#315544]">
              Source checked
            </span>
          </div>
          <h3 className="mt-2 text-[15px] font-bold leading-[1.18] tracking-[-0.015em]">{product.name}</h3>
          <p className="fit-data mt-1 text-xl font-bold">${product.priceUsd.toFixed(2)}</p>
          <p className="fit-data mt-2 text-[10px] font-semibold leading-4 text-[#17221f]/65">
            {formatDimensions(product.dimensions)}
          </p>
          {product.imageSourceUrl !== undefined && product.imageAttribution !== undefined ? (
            <a
              className="mt-1 inline-block text-[10px] font-semibold text-[#17221f]/65 underline decoration-[#17221f]/25 underline-offset-2 hover:text-[#17221f]"
              href={product.imageSourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Photo source: {product.imageAttribution} ↗
            </a>
          ) : null}
          <p
            className={`fit-data mt-2 text-[11px] font-bold leading-4 ${statusTextClasses}`}
          >
            {statusCopy}
          </p>
          {access.status === "skipped" ? (
            <p className="fit-data mt-1 text-[9px] font-bold uppercase tracking-[0.06em] text-[#755426]">
              Access not checked
            </p>
          ) : null}
        </div>
      </div>

      {status === "fit" ? (
        <div className="grid grid-cols-3 divide-x divide-[#17221f]/15 border-y border-[#17221f]/20 bg-white">
          <Clearance label="Width" value={fit.widthClearanceMm} />
          <Clearance label="Height" value={fit.heightClearanceMm} />
          <Clearance label="Depth" value={fit.depthClearanceMm} />
        </div>
      ) : null}

      <div className="flex items-center gap-2 bg-[#f4f7f5]/60 p-3">
        {onToggleCompare !== undefined ? (
          <button
            type="button"
            onClick={onToggleCompare}
            disabled={compareDisabled && !isCompared}
            aria-pressed={isCompared}
            className={`min-h-11 flex-1 rounded-sm border px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
              isCompared
                ? "border-[#17221f] bg-[#17221f] text-white"
                : "border-[#17221f]/30 bg-white hover:border-[#17221f]"
            }`}
          >
            {isCompared ? "Comparing" : "Compare"}
          </button>
        ) : null}
        {status === "fit" && onSelect !== undefined ? (
          <button
            type="button"
            onClick={onSelect}
            className="min-h-11 flex-1 rounded-sm bg-[#17221f] px-3 text-xs font-bold text-white hover:bg-[#26332f]"
          >
            View in room
          </button>
        ) : null}
        <a
          href={product.productUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center justify-center rounded-sm border border-[#17221f]/30 bg-white px-3 text-xs font-bold hover:border-[#17221f]"
        >
          Retailer ↗
        </a>
      </div>
    </article>
  );
}

function Clearance({ label, value }: { readonly label: string; readonly value: number }): React.JSX.Element {
  return (
    <div className="px-2 py-2.5 text-center">
      <p className="fit-data text-[8px] font-bold uppercase tracking-[0.11em] text-[#17221f]/65">{label}</p>
      <div className="fit-dimension-annotation" aria-label={`${value} millimetres ${label.toLowerCase()} clearance`}>
        <span className="fit-data fit-dimension-annotation__value text-[11px] font-bold">
          {value} mm
        </span>
      </div>
    </div>
  );
}

function formatDimensions(dimensions: EvaluatedProduct["product"]["dimensions"]): string {
  return `${dimensions.widthMm} W × ${dimensions.heightMm} H × ${dimensions.depthMm} D mm`;
}
