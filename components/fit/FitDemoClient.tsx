"use client";

import { useState } from "react";
import type {
  CatalogProduct,
  ProductSelection,
  SpaceMeasurement,
} from "@/lib/catalog-types";
import type { CatalogSource } from "@/lib/supabase/catalog-source";
import { getModelViewerAssetUrl } from "@/lib/assets";
import { buildMeshyPromptForProduct, catalogProductToPlacementCandidate } from "@/lib/catalog-to-placement";
import { generateModelViaMeshy } from "@/lib/meshy-generation-client";
import type { PlacementCandidate } from "@/lib/model-scaling";
import { ProductQuickLookViewer } from "./ProductQuickLookViewer";
import { FitSearchExperience } from "./FitSearchExperience";

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

export function FitDemoClient({
  measurement,
  products,
  catalogSource,
  retailerCount = new Set(products.map((product) => product.retailer)).size,
}: FitDemoClientProps): React.JSX.Element {
  const [generatingProductName, setGeneratingProductName] = useState<string | undefined>(undefined);
  const [activeCandidate, setActiveCandidate] = useState<PlacementCandidate | undefined>(undefined);

  async function handleSelectProduct(selection: ProductSelection): Promise<void> {
    const candidate = catalogProductToPlacementCandidate(selection.product, selection.fit);

    // A verified catalog model is the real thing — never worth regenerating.
    if (selection.product.model !== undefined) {
      setActiveCandidate(candidate);
      return;
    }

    const cache = readModelCache();
    const cached = cache[selection.product.id];
    if (cached !== undefined) {
      setActiveCandidate(withGeneratedModel(candidate, cached));
      return;
    }

    setGeneratingProductName(selection.product.name);
    const result = await generateModelViaMeshy({ prompt: buildMeshyPromptForProduct(selection.product) });
    setGeneratingProductName(undefined);

    if (result.status === "failed") {
      // Keep the demo moving with the verified-dimension placeholder box rather than getting stuck.
      setActiveCandidate(candidate);
      return;
    }

    const generated: CachedModel = { glbUrl: result.glbUrl, usdzUrl: result.usdzUrl };
    writeModelCache({ ...cache, [selection.product.id]: generated });
    setActiveCandidate(withGeneratedModel(candidate, generated));
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
