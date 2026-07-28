import type { EvaluatedProduct } from "@/lib/catalog-types";

interface ComparisonTrayProps {
  readonly entries: readonly EvaluatedProduct[];
  readonly onOpen: () => void;
}

export function ComparisonTray({
  entries,
  onOpen,
}: ComparisonTrayProps): React.JSX.Element {
  const selectionLabel =
    entries.length === 0
      ? "Top IKEA + Target"
      : entries.map((entry) => entry.product.retailer).join(" / ");

  return (
    <aside
      aria-label="Comparison tray"
      className="fit-comparison-tray sticky bottom-3 z-20 border border-[#17221f] bg-[#17221f] text-white"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left"
      >
        <span>
          <span className="fit-data block text-[8px] font-bold uppercase tracking-[0.12em] text-white/65">
            Comparison register · {entries.length}/3
          </span>
          <span className="mt-0.5 block text-xs font-bold">
            {selectionLabel}
          </span>
        </span>
        <span className="fit-data whitespace-nowrap border border-white/40 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.05em]">
          {entries.length === 0 ? "Compare" : "Open"}
        </span>
      </button>
    </aside>
  );
}
