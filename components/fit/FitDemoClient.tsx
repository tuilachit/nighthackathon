"use client";

import { useState } from "react";
import type {
  CatalogProduct,
  ProductSelection,
  SpaceMeasurement,
} from "@/lib/catalog-types";
import type { CatalogSource } from "@/lib/catalog-source";
import { catalogProductToPlacementCandidate } from "@/lib/catalog-to-placement";
import type { PlacementCandidate } from "@/lib/model-scaling";
import { ManualMeasurementForm } from "./ManualMeasurementForm";
import { ProductQuickLookViewer } from "./ProductQuickLookViewer";
import { FitSearchExperience } from "./FitSearchExperience";

interface FitDemoClientProps {
  readonly demoMeasurement: SpaceMeasurement;
  readonly products: readonly CatalogProduct[];
  readonly catalogSource?: CatalogSource;
  readonly retailerCount?: number;
}

export function FitDemoClient({
  demoMeasurement,
  products,
  catalogSource,
  retailerCount = new Set(products.map((product) => product.retailer)).size,
}: FitDemoClientProps): React.JSX.Element {
  const [measurement, setMeasurement] = useState<
    SpaceMeasurement | undefined
  >(undefined);
  const [activeCandidate, setActiveCandidate] = useState<PlacementCandidate | undefined>(undefined);

  function handleSelectProduct(selection: ProductSelection): void {
    setActiveCandidate(
      catalogProductToPlacementCandidate(selection.product, selection.fit),
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f5f0] px-4 pb-20 pt-20 text-[#171714] sm:px-6">
      {measurement === undefined ? (
        <ManualMeasurementForm
          demoMeasurement={demoMeasurement}
          onConfirm={setMeasurement}
        />
      ) : (
        <FitSearchExperience
          measurement={measurement}
          products={products}
          catalogSource={catalogSource}
          retailerCount={retailerCount}
          onEditMeasurement={() => {
            setActiveCandidate(undefined);
            setMeasurement(undefined);
          }}
          onSelectProduct={handleSelectProduct}
        />
      )}

      {activeCandidate !== undefined ? (
        <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#f7f5f0] px-4 py-6 sm:px-6">
          <button
            type="button"
            onClick={() => setActiveCandidate(undefined)}
            className="mb-4 inline-flex w-fit items-center rounded-full border border-[#d9d3c7] bg-white px-4 py-2 text-sm font-bold"
          >
            ‹ Back to results
          </button>
          <div className="mx-auto w-full max-w-xl">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#81796c]">
              {activeCandidate.retailer} · {activeCandidate.fitLabel}
            </p>
            <h2 className="mb-4 text-2xl font-black tracking-[-0.03em]">{activeCandidate.name}</h2>
            <ProductQuickLookViewer name={activeCandidate.name} model={activeCandidate.model} />
            {activeCandidate.retailerUrl !== undefined ? (
              <a
                href={activeCandidate.retailerUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex min-h-11 items-center justify-center rounded-2xl border border-[#d8d1c5] bg-white text-sm font-bold"
              >
                View on {activeCandidate.retailer} ↗
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
