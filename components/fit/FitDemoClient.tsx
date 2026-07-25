"use client";

import { useRouter } from "next/navigation";
import type {
  CatalogProduct,
  ProductSelection,
  SpaceMeasurement,
} from "@/lib/catalog-types";
import type { CatalogSource } from "@/lib/supabase/catalog-source";
import { catalogProductToPlacementCandidate } from "@/lib/catalog-to-placement";
import { toSpaceMeasurementSearchParams } from "@/lib/space-measurement-params";
import { FitSearchExperience } from "./FitSearchExperience";

export const SPACE_HANDOFF_STORAGE_KEY = "space-handoff-candidate";

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
  const router = useRouter();

  function handleSelectProduct(selection: ProductSelection): void {
    const candidate = catalogProductToPlacementCandidate(selection.product, selection.fit);

    try {
      window.sessionStorage.setItem(SPACE_HANDOFF_STORAGE_KEY, JSON.stringify(candidate));
    } catch {
      // Best effort — /space/place still has its own demo catalog if this is unavailable.
    }

    const params = toSpaceMeasurementSearchParams(measurement);
    router.push(`/space/place?${params.toString()}`);
  }

  return (
    <main className="min-h-screen bg-[#f7f5f0] px-4 pb-20 pt-20 text-[#171714] sm:px-6">
      <FitSearchExperience
        measurement={measurement}
        products={products}
        catalogSource={catalogSource}
        retailerCount={retailerCount}
        onSelectProduct={handleSelectProduct}
      />
    </main>
  );
}
