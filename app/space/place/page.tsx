"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AddProductFromPhoto } from "@/components/fit/AddProductFromPhoto";
import { SPACE_HANDOFF_STORAGE_KEY } from "@/components/fit/FitDemoClient";
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

const CUSTOM_CANDIDATES_STORAGE_KEY = "space-custom-candidates";

interface CatalogSeed {
  readonly id: string;
  readonly name: string;
  readonly retailer: string;
  readonly priceLabel: string;
  readonly retailerUrl?: string;
  readonly model: PlacementModel;
}

// Stand-in hero models (CC0, kenney.nl — see public/models/furniture/SOURCE.md)
// used until a real verified retailer GLB exists for these demo products.
const CATALOG_SEED: readonly CatalogSeed[] = [
  {
    id: "bookcase-open",
    name: "Oakridge Open Bookcase",
    retailer: "Wallside & Co.",
    priceLabel: "$189",
    model: {
      dimensions: { widthMm: 400, depthMm: 250, heightMm: 880 },
      glbUrl: "/models/furniture/bookcase-open.glb",
      iosUsdzUrl: "/models/furniture/bookcase-open.usdz",
      placeholderBoxGlbUrl: "/models/unit-box.glb",
    },
  },
  {
    id: "bookcase-closed-wide",
    name: "Oakridge Wide Cabinet",
    retailer: "Wallside & Co.",
    priceLabel: "$249",
    model: {
      dimensions: { widthMm: 800, depthMm: 250, heightMm: 790 },
      glbUrl: "/models/furniture/bookcase-closed-wide.glb",
      iosUsdzUrl: "/models/furniture/bookcase-closed-wide.usdz",
      placeholderBoxGlbUrl: "/models/unit-box.glb",
    },
  },
  {
    id: "drawer-unit",
    name: "Kessler Drawer Unit",
    retailer: "Homeplane",
    priceLabel: "$329",
    model: {
      dimensions: { widthMm: 430, depthMm: 450, heightMm: 450 },
      glbUrl: "/models/furniture/drawer-unit.glb",
      iosUsdzUrl: "/models/furniture/drawer-unit.usdz",
      placeholderBoxGlbUrl: "/models/unit-box.glb",
    },
  },
  {
    id: "sideboard",
    name: "Homeplane Sideboard",
    retailer: "Homeplane",
    priceLabel: "$279",
    model: {
      dimensions: { widthMm: 534, depthMm: 222, heightMm: 384 },
      glbUrl: "/models/furniture/sideboard.glb",
      iosUsdzUrl: "/models/furniture/sideboard.usdz",
      placeholderBoxGlbUrl: "/models/unit-box.glb",
    },
  },
];

function seedToCandidate(seed: CatalogSeed, space: SpaceMeasurement): PlacementCandidate {
  return {
    id: seed.id,
    name: seed.name,
    retailer: seed.retailer,
    priceLabel: seed.priceLabel,
    retailerUrl: seed.retailerUrl,
    model: seed.model,
    fitLabel: formatFitLabel(evaluateFit(space, seed.model.dimensions)),
  };
}

function withFitLabel(candidate: PlacementCandidate, space: SpaceMeasurement): PlacementCandidate {
  return { ...candidate, fitLabel: formatFitLabel(evaluateFit(space, candidate.model.dimensions)) };
}

function loadStoredCandidates(): readonly PlacementCandidate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(CUSTOM_CANDIDATES_STORAGE_KEY);
    return raw === null ? [] : (JSON.parse(raw) as readonly PlacementCandidate[]);
  } catch {
    return [];
  }
}

/** One-time handoff from the /fit search results' "View in room" button. */
function takeHandoffCandidate(): PlacementCandidate | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(SPACE_HANDOFF_STORAGE_KEY);
    if (raw === null) return undefined;
    window.sessionStorage.removeItem(SPACE_HANDOFF_STORAGE_KEY);
    return JSON.parse(raw) as PlacementCandidate;
  } catch {
    return undefined;
  }
}

export default function SpacePlacePage(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <SpacePlaceContent />
    </Suspense>
  );
}

type Mode = "browse" | "generate" | "auto" | "quicklook";

function SpacePlaceContent(): React.JSX.Element {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("browse");
  const [customCandidates, setCustomCandidates] = useState<readonly PlacementCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const space = useMemo<SpaceMeasurement>(
    () => parseSpaceMeasurementSearchParams(searchParams) ?? DEMO_SPACE_MEASUREMENT,
    [searchParams],
  );

  useEffect(() => {
    const stored = loadStoredCandidates();
    const handoffCandidate = takeHandoffCandidate();

    if (handoffCandidate === undefined) {
      setCustomCandidates(stored);
      return;
    }

    const merged = [handoffCandidate, ...stored.filter((candidate) => candidate.id !== handoffCandidate.id)];
    setCustomCandidates(merged);
    try {
      window.sessionStorage.setItem(CUSTOM_CANDIDATES_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Session persistence is a nicety; the handoff candidate still works for this render.
    }
    setSelectedId(handoffCandidate.id);
    setMode("auto");
  }, []);

  const candidates = useMemo<readonly PlacementCandidate[]>(
    () => [...customCandidates.map((c) => withFitLabel(c, space)), ...CATALOG_SEED.map((seed) => seedToCandidate(seed, space))],
    [customCandidates, space],
  );

  function handleGenerated(candidate: PlacementCandidate): void {
    const next = [candidate, ...customCandidates];
    setCustomCandidates(next);
    try {
      window.sessionStorage.setItem(CUSTOM_CANDIDATES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Session persistence is a nicety; the candidate still works for this render.
    }
    setSelectedId(candidate.id);
    setMode("auto");
  }

  function handleSelect(candidateId: string): void {
    setSelectedId(candidateId);
    setMode("auto");
  }

  if (mode === "generate") {
    return (
      <main className="min-h-screen bg-white px-4 py-6 safe-bottom">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Add a product</p>
        <h1 className="mb-4 text-xl font-black text-slate-950">Generate a 3D model from a photo</h1>
        <AddProductFromPhoto onGenerated={handleGenerated} onCancel={() => setMode("browse")} />
      </main>
    );
  }

  if (mode === "browse") {
    return (
      <main className="min-h-screen bg-white px-4 py-6 safe-bottom">
        <Link href="/space/scan" className="mb-4 inline-block text-sm font-bold text-slate-500">
          ‹ Re-measure
        </Link>
        <p className="mono mb-1 text-xs text-slate-400">
          Space: {space.widthMm} × {space.depthMm} × {space.heightMm} mm (± {space.uncertaintyMm} mm, {space.source})
        </p>
        <h1 className="mb-4 text-xl font-black text-slate-950">Pick a product to place</h1>

        <button
          type="button"
          onClick={() => setMode("generate")}
          className="mb-4 w-full rounded-2xl border border-dashed border-black/20 p-4 text-left text-sm font-bold text-slate-700"
        >
          + Add a product from a photo (Meshy)
        </button>

        <div className="flex flex-col gap-2.5">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => handleSelect(candidate.id)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 p-4 text-left"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950">{candidate.name}</p>
                <p className="text-xs text-slate-500">
                  {candidate.retailer} · {candidate.fitLabel}
                </p>
              </div>
              <p className="flex-shrink-0 text-sm font-black text-slate-950">{candidate.priceLabel}</p>
            </button>
          ))}
        </div>
      </main>
    );
  }

  const activeCandidate = candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0];

  if (mode === "quicklook") {
    return (
      <main className="min-h-screen bg-white px-4 py-6 safe-bottom">
        <button type="button" onClick={() => setMode("browse")} className="mb-4 inline-block text-sm font-bold text-slate-500">
          ‹ Back to products
        </button>
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
