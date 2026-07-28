import type { EvaluatedProduct } from "@/lib/catalog-types";

interface ComparisonPanelProps {
  readonly entries: readonly EvaluatedProduct[];
  readonly onRemove: (productId: string) => void;
}

export function ComparisonPanel({
  entries,
  onRemove,
}: ComparisonPanelProps): React.JSX.Element | null {
  if (entries.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="compare-title" className="rounded-md border border-[#17221f] bg-white">
      <div className="flex items-center justify-between gap-3">
        <div className="px-4 py-4">
          <p className="fit-data text-[9px] font-bold uppercase tracking-[0.12em] text-[#17221f]/65">
            Comparison register
          </p>
          <h2 id="compare-title" className="fit-display mt-1 text-xl font-bold tracking-[-0.025em]">
            Compare clearance
          </h2>
        </div>
        <span className="fit-data mr-4 border border-[#17221f]/30 bg-[#f4f7f5] px-2.5 py-1.5 text-xs font-bold">
          {entries.length}/3
        </span>
      </div>

      <div className="grid border-t border-[#17221f]/25 sm:grid-cols-3 sm:divide-x sm:divide-[#17221f]/20">
        {entries.map((entry) => (
          <article key={entry.product.id} className="border-b border-[#17221f]/20 p-4 last:border-b-0 sm:border-b-0">
            <p className="fit-data text-[9px] font-bold uppercase tracking-[0.1em] text-[#17221f]/65">
              {entry.product.retailer}
            </p>
            <h3 className="mt-1 text-sm font-bold leading-tight">{entry.product.name}</h3>
            <p className="fit-data mt-4 text-[32px] font-bold leading-none">
              {entry.fit.minimumClearanceMm}
              <span className="ml-1 text-[10px] tracking-normal text-[#17221f]/65">mm</span>
            </p>
            <p className="mt-1 text-[11px] font-semibold text-[#17221f]/65">minimum clearance</p>
            <button
              type="button"
              onClick={() => onRemove(entry.product.id)}
              className="mt-4 min-h-11 text-xs font-bold text-[#17221f] underline decoration-[#17221f]/40 underline-offset-4"
            >
              Remove
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
