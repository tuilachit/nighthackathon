"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CatalogProduct,
  ProductSelection,
  SpaceMeasurement,
} from "@/lib/catalog-types";
import type { CatalogSource } from "@/lib/supabase/catalog-source";
import { getModelViewerAssetUrl } from "@/lib/assets";
import { buildMeshyPromptForProduct, catalogProductToPlacementCandidate } from "@/lib/catalog-to-placement";
import { generateModelViaMeshy } from "@/lib/meshy-generation-client";
import { toSpaceMeasurementSearchParams } from "@/lib/space-measurement-params";
import type { PlacementCandidate } from "@/components/xr/XRPlacementClient";
import { FitSearchExperience } from "./FitSearchExperience";

export const SPACE_HANDOFF_STORAGE_KEY = "space-handoff-candidate";
const GENERATED_MODEL_CACHE_KEY = "space-generated-model-cache";

interface FitDemoClientProps {
  readonly measurement: SpaceMeasurement;
  readonly products: readonly CatalogProduct[];
  readonly catalogSource?: CatalogSource;
  readonly retailerCount?: number;
}

interface CachedModel {
  readonly glbUrl: string;
  readonly usdzUrl?: string;
}

function readModelCache(): Record<string, CachedModel> {
  try {
    const raw = window.sessionStorage.getItem(GENERATED_MODEL_CACHE_KEY);
    return raw === null ? {} : (JSON.parse(raw) as Record<string, CachedModel>);
  } catch {
    return {};
  }
}

function writeModelCache(cache: Record<string, CachedModel>): void {
  try {
    window.sessionStorage.setItem(GENERATED_MODEL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Caching is a nicety; regenerating on the next select still works.
  }
}

export function FitDemoClient({
  measurement,
  products,
  catalogSource,
  retailerCount = new Set(products.map((product) => product.retailer)).size,
}: FitDemoClientProps): React.JSX.Element {
  const router = useRouter();
  const [generatingProductName, setGeneratingProductName] = useState<string | undefined>(undefined);

  function goToPlacement(candidate: PlacementCandidate): void {
    try {
      window.sessionStorage.setItem(SPACE_HANDOFF_STORAGE_KEY, JSON.stringify(candidate));
    } catch {
      // Best effort — /space/place still has its own demo catalog if this is unavailable.
    }

    const params = toSpaceMeasurementSearchParams(measurement);
    router.push(`/space/place?${params.toString()}`);
  }

  async function handleSelectProduct(selection: ProductSelection): Promise<void> {
    const candidate = catalogProductToPlacementCandidate(selection.product, selection.fit);

    // A verified catalog model is the real thing — never worth regenerating.
    if (selection.product.model !== undefined) {
      goToPlacement(candidate);
      return;
    }

    const cache = readModelCache();
    const cached = cache[selection.product.id];
    if (cached !== undefined) {
      goToPlacement(withGeneratedModel(candidate, cached));
      return;
    }

    setGeneratingProductName(selection.product.name);
    const result = await generateModelViaMeshy({ prompt: buildMeshyPromptForProduct(selection.product) });
    setGeneratingProductName(undefined);

    if (result.status === "failed") {
      // Keep the demo moving with the verified-dimension placeholder box rather than getting stuck.
      goToPlacement(candidate);
      return;
    }

    const generated: CachedModel = { glbUrl: result.glbUrl, usdzUrl: result.usdzUrl };
    writeModelCache({ ...cache, [selection.product.id]: generated });
    goToPlacement(withGeneratedModel(candidate, generated));
  }

  return (
    <main className="min-h-screen bg-[#f7f5f0] px-4 pb-20 pt-20 text-[#171714] sm:px-6">
      <FitSearchExperience
        measurement={measurement}
        products={products}
        catalogSource={catalogSource}
        retailerCount={retailerCount}
        onSelectProduct={(selection) => void handleSelectProduct(selection)}
      />

      {generatingProductName !== undefined ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white/95 px-8 text-center backdrop-blur">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#e4ddce] border-t-[#171714]" />
          <p className="text-sm font-bold text-[#171714]">Generating a 3D preview of {generatingProductName}…</p>
          <p className="text-xs text-[#726a5e]">The verified dimensions stay exact — only the shape is generated.</p>
        </div>
      ) : null}
    </main>
  );
}

function withGeneratedModel(candidate: PlacementCandidate, generated: CachedModel): PlacementCandidate {
  return {
    ...candidate,
    model: {
      ...candidate.model,
      glbUrl: getModelViewerAssetUrl(generated.glbUrl),
      iosUsdzUrl: getModelViewerAssetUrl(generated.usdzUrl),
      scaleSource: "generated",
    },
  };
}
