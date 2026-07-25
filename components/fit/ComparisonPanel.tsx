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
    <section aria-labelledby="compare-title" className="rounded-[28px] bg-[#e9dfca] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.15em] text-[#77633e]">
            Decision view
          </p>
          <h2 id="compare-title" className="mt-1 text-2xl font-black tracking-[-0.03em]">
            Compare clearance
          </h2>
        </div>
        <span className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold">
          {entries.length}/3
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {entries.map((entry) => (
          <article key={entry.product.id} className="rounded-2xl bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#81796c]">
              {entry.product.retailer}
            </p>
            <h3 className="mt-1 text-sm font-black leading-tight">{entry.product.name}</h3>
            <p className="mt-4 text-[34px] font-black leading-none tracking-[-0.06em]">
              {entry.fit.minimumClearanceMm}
              <span className="ml-1 text-xs tracking-normal text-[#81796c]">mm</span>
            </p>
            <p className="mt-1 text-xs font-semibold text-[#6d665b]">minimum clearance</p>
            <button
              type="button"
              onClick={() => onRemove(entry.product.id)}
              className="mt-4 text-xs font-bold text-[#795b28] underline underline-offset-4"
            >
              Remove
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
