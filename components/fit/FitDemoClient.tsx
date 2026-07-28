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
  >(demoMeasurement);
  const [activeCandidate, setActiveCandidate] = useState<PlacementCandidate | undefined>(undefined);

  function handleSelectProduct(selection: ProductSelection): void {
    setActiveCandidate(
      catalogProductToPlacementCandidate(selection.product, selection.fit),
    );
  }

  return (
    <main id="fit-main" className="min-h-screen bg-[#f4f7f5] px-4 pb-20 pt-20 text-[#17221f] sm:px-6">
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
        <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#f4f7f5] px-4 py-6 sm:px-6">
          <button
            type="button"
            onClick={() => setActiveCandidate(undefined)}
            className="mb-4 inline-flex min-h-11 w-fit items-center rounded-sm border border-[#17221f]/35 bg-white px-4 py-2 text-sm font-bold hover:border-[#17221f]"
          >
            ‹ Back to results
          </button>
          <div className="mx-auto w-full max-w-[430px]">
            <p className="fit-data mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#17221f]/65">
              {activeCandidate.retailer} · {activeCandidate.fitLabel}
            </p>
            <h2 className="fit-display mb-4 text-2xl font-bold tracking-[-0.03em]">{activeCandidate.name}</h2>
            <ProductQuickLookViewer name={activeCandidate.name} model={activeCandidate.model} />
            {activeCandidate.retailerUrl !== undefined ? (
              <a
                href={activeCandidate.retailerUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex min-h-11 items-center justify-center rounded-sm border border-[#17221f]/35 bg-white text-sm font-bold hover:border-[#17221f]"
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
