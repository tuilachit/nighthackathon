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

  return (
    <article
      className="overflow-hidden rounded-[24px] border border-[#ded8cd] bg-white"
      data-testid={`product-${product.id}`}
    >
      <div className="grid grid-cols-[112px_1fr] gap-4 p-3 sm:grid-cols-[144px_1fr]">
        <Image
          src={product.imagePath}
          alt={`${product.name} product illustration`}
          width={320}
          height={240}
          className="h-full min-h-[124px] w-full rounded-[18px] object-cover"
        />

        <div className="min-w-0 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#f0ece4] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.11em] text-[#665e50]">
              {product.retailer}
            </span>
            <span className="rounded-full bg-[#e8f3e9] px-2.5 py-1 text-[10px] font-black text-[#24572d]">
              Dimensions verified
            </span>
          </div>
          <h3 className="mt-2 text-base font-black leading-tight tracking-[-0.02em]">{product.name}</h3>
          <p className="mt-1 text-xl font-black">${product.priceUsd.toFixed(2)}</p>
          <p className="mt-2 text-xs font-semibold text-[#6f685d]">
            {formatDimensions(product.dimensions)}
          </p>
          <p
            className={`mt-2 text-sm font-bold leading-5 ${
              status === "fit" ? "text-[#28713a]" : status === "access" ? "text-[#98611a]" : "text-[#9b3d2f]"
            }`}
          >
            {statusCopy}
          </p>
        </div>
      </div>

      {status === "fit" ? (
        <div className="grid grid-cols-3 border-y border-[#eee9e0] bg-[#fbfaf7]">
          <Clearance label="Width" value={fit.widthClearanceMm} />
          <Clearance label="Height" value={fit.heightClearanceMm} />
          <Clearance label="Depth" value={fit.depthClearanceMm} />
        </div>
      ) : null}

      <div className="flex items-center gap-2 p-3">
        {status === "fit" && onToggleCompare !== undefined ? (
          <button
            type="button"
            onClick={onToggleCompare}
            disabled={compareDisabled && !isCompared}
            aria-pressed={isCompared}
            className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
              isCompared
                ? "border-[#1c1b18] bg-[#1c1b18] text-white"
                : "border-[#d8d1c5] bg-white"
            }`}
          >
            {isCompared ? "Comparing" : "Compare"}
          </button>
        ) : null}
        {status === "fit" && onSelect !== undefined ? (
          <button
            type="button"
            onClick={onSelect}
            className="min-h-11 flex-1 rounded-xl bg-[#b58a43] px-3 text-sm font-black text-[#21190d]"
          >
            View in room
          </button>
        ) : null}
        <a
          href={product.productUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center justify-center rounded-xl border border-[#d8d1c5] px-3 text-sm font-bold"
        >
          Retailer ↗
        </a>
      </div>
    </article>
  );
}

function Clearance({ label, value }: { readonly label: string; readonly value: number }): React.JSX.Element {
  return (
    <div className="border-r border-[#eee9e0] px-3 py-2.5 text-center last:border-r-0">
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#8b8377]">{label}</p>
      <p className="mt-0.5 text-sm font-black">{value} mm</p>
    </div>
  );
}

function formatDimensions(dimensions: EvaluatedProduct["product"]["dimensions"]): string {
  return `${dimensions.widthMm} W × ${dimensions.heightMm} H × ${dimensions.depthMm} D mm`;
}
