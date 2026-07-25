"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ProductQuickLookViewer } from "@/components/fit/ProductQuickLookViewer";
import { XRPlacementClient } from "@/components/xr/XRPlacementClient";
import type { PlacementCandidate } from "@/components/xr/XRPlacementClient";
import { evaluateFit, formatFitLabel } from "@/lib/fit-engine";
import type { PlacementModel } from "@/lib/model-scaling";
import { manualSpaceMeasurement } from "@/lib/measurement-geometry";
import type { SpaceMeasurement } from "@/lib/measurement-geometry";
import { parseSpaceMeasurementSearchParams } from "@/lib/space-measurement-params";

const DEMO_SPACE_MEASUREMENT: SpaceMeasurement = manualSpaceMeasurement(
  { widthMm: 812, depthMm: 405, heightMm: 900 },
  20,
);

interface CatalogSeed {
  readonly id: string;
  readonly name: string;
  readonly retailer: string;
  readonly priceLabel: string;
  readonly retailerUrl?: string;
  readonly model: PlacementModel;
}

// Stand-in hero models (CC0, kenney.nl — see public/models/furniture/SOURCE.md)
// used until a Meshy-generated or verified retailer GLB exists for these products.
const CATALOG_SEED: readonly CatalogSeed[] = [
  {
    id: "bookcase-open",
    name: "Oakridge Open Bookcase",
    retailer: "Wallside & Co.",
    priceLabel: "$189",
    retailerUrl: "https://example.com/demo-bookcase-open",
    model: {
      dimensions: { widthMm: 400, depthMm: 250, heightMm: 880 },
      glbUrl: "/models/furniture/bookcase-open.glb",
      placeholderBoxGlbUrl: "/models/unit-box.glb",
    },
  },
  {
    id: "bookcase-closed-wide",
    name: "Oakridge Wide Cabinet",
    retailer: "Wallside & Co.",
    priceLabel: "$249",
    retailerUrl: "https://example.com/demo-bookcase-wide",
    model: {
      dimensions: { widthMm: 800, depthMm: 250, heightMm: 790 },
      glbUrl: "/models/furniture/bookcase-closed-wide.glb",
      placeholderBoxGlbUrl: "/models/unit-box.glb",
    },
  },
  {
    id: "drawer-unit",
    name: "Kessler Drawer Unit",
    retailer: "Homeplane",
    priceLabel: "$329",
    retailerUrl: "https://example.com/demo-drawer-unit",
    model: {
      dimensions: { widthMm: 430, depthMm: 450, heightMm: 450 },
      glbUrl: "/models/furniture/drawer-unit.glb",
      placeholderBoxGlbUrl: "/models/unit-box.glb",
    },
  },
  {
    id: "sideboard",
    name: "Homeplane Sideboard",
    retailer: "Homeplane",
    priceLabel: "$279",
    retailerUrl: "https://example.com/demo-sideboard",
    model: {
      dimensions: { widthMm: 534, depthMm: 222, heightMm: 384 },
      glbUrl: "/models/furniture/sideboard.glb",
      placeholderBoxGlbUrl: "/models/unit-box.glb",
    },
  },
];

function buildCandidates(space: SpaceMeasurement): readonly PlacementCandidate[] {
  return CATALOG_SEED.map((seed) => ({
    id: seed.id,
    name: seed.name,
    retailer: seed.retailer,
    priceLabel: seed.priceLabel,
    retailerUrl: seed.retailerUrl,
    model: seed.model,
    fitLabel: formatFitLabel(evaluateFit(space, seed.model.dimensions)),
  }));
}

export default function SpacePlacePage(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <SpacePlaceContent />
    </Suspense>
  );
}

function SpacePlaceContent(): React.JSX.Element {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"auto" | "quicklook">("auto");

  const space = useMemo<SpaceMeasurement>(
    () => parseSpaceMeasurementSearchParams(searchParams) ?? DEMO_SPACE_MEASUREMENT,
    [searchParams],
  );
  const candidates = useMemo<readonly PlacementCandidate[]>(() => buildCandidates(space), [space]);
  const activeCandidate = candidates[0];

  if (mode === "quicklook") {
    return (
      <main className="min-h-screen bg-white px-4 py-6 safe-bottom">
        <Link href="/" className="mb-4 inline-block text-sm font-bold text-slate-500">
          ‹ Back
        </Link>
        <p className="mono mb-4 text-xs text-slate-400">
          Space: {space.widthMm} × {space.depthMm} × {space.heightMm} mm (± {space.uncertaintyMm} mm, {space.source})
        </p>
        <ProductQuickLookViewer name={activeCandidate.name} model={activeCandidate.model} />
      </main>
    );
  }

  return (
    <XRPlacementClient candidates={candidates} initialCandidateId={activeCandidate.id} onExit={() => setMode("quicklook")} />
  );
}
