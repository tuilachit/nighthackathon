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

const CATALOG_SEED: readonly CatalogSeed[] = [
  {
    id: "hero-bottle",
    name: "Demo Hero Model",
    retailer: "Sample Co.",
    priceLabel: "$249",
    retailerUrl: "https://example.com/demo-hero",
    model: {
      dimensions: { widthMm: 90, depthMm: 90, heightMm: 240 },
      glbUrl: "/models/bottle.glb",
      placeholderBoxGlbUrl: "/models/unit-box.glb",
    },
  },
  {
    id: "placeholder-shelf",
    name: "Oakridge 3-Shelf",
    retailer: "Wallside & Co.",
    priceLabel: "$249",
    retailerUrl: "https://example.com/demo-placeholder",
    model: {
      dimensions: { widthMm: 778, depthMm: 280, heightMm: 840 },
      placeholderBoxGlbUrl: "/models/unit-box.glb",
    },
  },
  {
    id: "near-miss-console",
    name: "Kessler Record Console",
    retailer: "Homeplane",
    priceLabel: "$329",
    retailerUrl: "https://example.com/demo-near-miss",
    model: {
      dimensions: { widthMm: 830, depthMm: 300, heightMm: 780 },
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
