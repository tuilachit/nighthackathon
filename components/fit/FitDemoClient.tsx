"use client";

import { useState } from "react";
import type {
  CatalogProduct,
  ProductSelection,
  SpaceMeasurement,
} from "@/lib/catalog-types";
import type { CatalogSource } from "@/lib/supabase/catalog-source";
import { FitSearchExperience } from "./FitSearchExperience";

interface FitDemoClientProps {
  readonly measurement: SpaceMeasurement;
  readonly products: readonly CatalogProduct[];
  readonly catalogSource?: CatalogSource;
  readonly retailerCount?: number;
}

export function FitDemoClient({
  measurement,
  products,
  catalogSource,
  retailerCount = new Set(products.map((product) => product.retailer)).size,
}: FitDemoClientProps): React.JSX.Element {
  const [selection, setSelection] = useState<ProductSelection | undefined>();

  return (
    <main className="min-h-screen bg-[#f7f5f0] px-4 pb-20 pt-20 text-[#171714] sm:px-6">
      <FitSearchExperience
        measurement={measurement}
        products={products}
        catalogSource={catalogSource}
        retailerCount={retailerCount}
        onSelectProduct={setSelection}
      />

      {selection !== undefined ? (
        <aside
          aria-live="polite"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-[#d9d3c7] bg-white/95 p-4 shadow-[0_24px_70px_rgba(29,27,22,0.2)] backdrop-blur"
          data-testid="selection-handoff"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#81796c]">
                Ready for placement
              </p>
              <p className="mt-1 text-base font-bold">{selection.product.name}</p>
              <p className="mt-1 text-sm text-[#645e54]">
                {selection.fit.orientation === "rotated-90" ? "Rotated 90°" : "Default orientation"}
                {" · "}
                {selection.product.model?.glbPath ?? "Exact-dimension placeholder"}
              </p>
            </div>
            <button
              type="button"
              className="rounded-full border border-[#d9d3c7] px-3 py-1.5 text-sm font-semibold"
              onClick={() => setSelection(undefined)}
            >
              Close
            </button>
          </div>
        </aside>
      ) : null}
    </main>
  );
}
