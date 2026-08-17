"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type {
  CatalogProduct,
  ProductSelection,
  SpaceMeasurement,
} from "@/lib/catalog-types";
import type { CatalogSource } from "@/lib/catalog-source";
import { catalogProductToPlacementCandidate } from "@/lib/catalog-to-placement";
import type { PlacementCandidate } from "@/lib/model-scaling";
import { parseFitShareParams } from "@/lib/fit-share-state";
import {
  createSavedSpace,
  loadSavedSpaces,
  persistSavedSpaces,
  renameSavedSpace,
} from "@/lib/saved-spaces";
import type { SavedSpace } from "@/lib/saved-spaces";
import { ManualMeasurementForm } from "./ManualMeasurementForm";
import { FitSearchExperience } from "./FitSearchExperience";

const LiveSearchExperience = dynamic(
  () =>
    import("@/components/agent/LiveSearchExperience").then(
      (module) => module.LiveSearchExperience,
    ),
  {
    loading: () => (
      <section
        aria-busy="true"
        className="mx-auto min-h-[560px] w-full max-w-[430px] border border-[#17221f]/30 bg-white p-5"
      >
        <p className="fit-data text-xs font-bold">Preparing search controls…</p>
      </section>
    ),
    ssr: false,
  },
);

const ProductQuickLookViewer = dynamic(
  () =>
    import("./ProductQuickLookViewer").then(
      (module) => module.ProductQuickLookViewer,
    ),
  { ssr: false },
);

type ExperienceMode = "measurement" | "live" | "legacy";

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
  const [mode, setMode] = useState<ExperienceMode>("measurement");
  const [restoreWorkflowId, setRestoreWorkflowId] = useState<string>();
  const [editingSpaceId, setEditingSpaceId] = useState<string>();
  const [savedSpaces, setSavedSpaces] = useState<readonly SavedSpace[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | undefined>();
  const [hasLoadedSpaces, setHasLoadedSpaces] = useState(false);
  const [sharedQuery, setSharedQuery] = useState<string | undefined>();
  const [sharedComparedProductIds, setSharedComparedProductIds] = useState<
    readonly string[]
  >([]);
  const [activeCandidate, setActiveCandidate] = useState<PlacementCandidate | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlWorkflowId = params.get("job");
    if (isWorkflowId(urlWorkflowId)) {
      setRestoreWorkflowId(urlWorkflowId);
      setMode("live");
      setHasLoadedSpaces(true);
      return;
    }
    const shared = parseFitShareParams(params);
    if (shared.status === "valid") {
      setMeasurement(shared.state.measurement);
      setSharedQuery(shared.state.query);
      setSharedComparedProductIds(shared.state.comparedProductIds);
      setMode("legacy");
      setHasLoadedSpaces(true);
      return;
    }
    if (shared.status === "invalid") {
      setMeasurement(undefined);
      setMode("measurement");
      setHasLoadedSpaces(true);
      return;
    }
    const storedSpaces = loadSavedSpaces(window.localStorage);
    setSavedSpaces(storedSpaces);
    if (params.get("new") === "1") {
      setMeasurement(undefined);
      setMode("measurement");
      setHasLoadedSpaces(true);
      return;
    }
    if (params.get("demo") === "1" || params.get("legacy") === "1") {
      setMeasurement(demoMeasurement);
      setMode("legacy");
      setHasLoadedSpaces(true);
      return;
    }
    let storedWorkflowId: string | null = null;
    try {
      storedWorkflowId = window.sessionStorage.getItem("fitment.live-workflow-id");
    } catch {
      // The URL and measurement entry remain available without session storage.
    }
    if (isWorkflowId(storedWorkflowId)) {
      setRestoreWorkflowId(storedWorkflowId);
      setMode("live");
      setHasLoadedSpaces(true);
      return;
    }
    const latestSpace = storedSpaces[0];
    setMeasurement(latestSpace?.measurement);
    setActiveSpaceId(latestSpace?.id);
    setMode(latestSpace === undefined ? "measurement" : "live");
    setHasLoadedSpaces(true);
  }, [demoMeasurement]);

  function handleSelectProduct(selection: ProductSelection): void {
    setActiveCandidate(
      catalogProductToPlacementCandidate(selection.product, selection.fit),
    );
  }

  function handleConfirmMeasurement(
    nextMeasurement: SpaceMeasurement,
    name?: string,
  ): void {
    clearSharedUrl();
    clearLiveWorkflowHandle();
    setSharedQuery(undefined);
    setRestoreWorkflowId(undefined);
    setSharedComparedProductIds([]);
    setMeasurement(nextMeasurement);
    setMode(nextMeasurement.source === "demo" ? "legacy" : "live");
    setActiveCandidate(undefined);
    if (nextMeasurement.source !== "manual") {
      setEditingSpaceId(undefined);
      setActiveSpaceId(undefined);
      return;
    }

    if (editingSpaceId !== undefined) {
      const existing = savedSpaces.find((space) => space.id === editingSpaceId);
      if (existing !== undefined) {
        const updated = createSavedSpace(name ?? existing.name, nextMeasurement, {
          id: existing.id,
          createdAt: existing.createdAt,
        });
        const nextSpaces = savedSpaces.map((space) =>
          space.id === editingSpaceId ? updated : space,
        );
        setSavedSpaces(nextSpaces);
        setActiveSpaceId(updated.id);
        setEditingSpaceId(undefined);
        persistSavedSpaces(window.localStorage, nextSpaces);
        return;
      }
    }

    const savedSpace = createSavedSpace(name ?? "My space", nextMeasurement);
    const nextSpaces = [savedSpace, ...savedSpaces];
    setSavedSpaces(nextSpaces);
    setActiveSpaceId(savedSpace.id);
    setEditingSpaceId(undefined);
    persistSavedSpaces(window.localStorage, nextSpaces);
  }

  function handleSelectSpace(spaceId: string): void {
    const selected = savedSpaces.find((space) => space.id === spaceId);
    if (selected === undefined) {
      return;
    }
    clearSharedUrl();
    clearLiveWorkflowHandle();
    setSharedQuery(undefined);
    setRestoreWorkflowId(undefined);
    setSharedComparedProductIds([]);
    setEditingSpaceId(undefined);
    setMeasurement(selected.measurement);
    setMode("live");
    setActiveSpaceId(selected.id);
    setActiveCandidate(undefined);
  }

  function handleRenameSpace(spaceId: string, name: string): void {
    const nextSpaces = renameSavedSpace(savedSpaces, spaceId, name);
    setSavedSpaces(nextSpaces);
    persistSavedSpaces(window.localStorage, nextSpaces);
  }

  function handleDeleteSpace(spaceId: string): void {
    const nextSpaces = savedSpaces.filter((space) => space.id !== spaceId);
    setSavedSpaces(nextSpaces);
    persistSavedSpaces(window.localStorage, nextSpaces);
    if (spaceId !== activeSpaceId) {
      return;
    }
    const nextActiveSpace = nextSpaces[0];
    clearLiveWorkflowHandle();
    setRestoreWorkflowId(undefined);
    setMeasurement(nextActiveSpace?.measurement);
    setMode(nextActiveSpace === undefined ? "measurement" : "live");
    setActiveSpaceId(nextActiveSpace?.id);
    setActiveCandidate(undefined);
    setEditingSpaceId(undefined);
  }

  function handleNewSpace(): void {
    clearSharedUrl();
    clearLiveWorkflowHandle();
    setSharedQuery(undefined);
    setRestoreWorkflowId(undefined);
    setSharedComparedProductIds([]);
    setMeasurement(undefined);
    setMode("measurement");
    setActiveSpaceId(undefined);
    setEditingSpaceId(undefined);
    setActiveCandidate(undefined);
  }

  function handleEditMeasurement(): void {
    const activeSpace = savedSpaces.find((space) => space.id === activeSpaceId);
    if (activeSpace === undefined) {
      handleNewSpace();
      return;
    }
    clearSharedUrl();
    clearLiveWorkflowHandle();
    setRestoreWorkflowId(undefined);
    setEditingSpaceId(activeSpace.id);
    setMeasurement(undefined);
    setMode("measurement");
    setActiveCandidate(undefined);
  }

  if (!hasLoadedSpaces) {
    return (
      <main
        id="fit-main"
        aria-busy="true"
        className="min-h-screen bg-[#f4f7f5]"
      >
        <span className="sr-only">Loading saved spaces</span>
      </main>
    );
  }

  const editingSpace = savedSpaces.find((space) => space.id === editingSpaceId);

  return (
    <main id="fit-main" className="min-h-screen bg-[#f4f7f5] px-4 pb-20 pt-20 text-[#17221f] sm:px-6">
      {mode === "measurement" ? (
        <ManualMeasurementForm
          demoMeasurement={demoMeasurement}
          initialMeasurement={editingSpace?.measurement}
          initialName={editingSpace?.name}
          onConfirm={handleConfirmMeasurement}
        />
      ) : mode === "legacy" && measurement !== undefined ? (
        <FitSearchExperience
          measurement={measurement}
          initialQuery={sharedQuery}
          initialComparedProductIds={sharedComparedProductIds}
          products={products}
          catalogSource={catalogSource}
          retailerCount={retailerCount}
          savedSpaces={savedSpaces}
          activeSpaceId={activeSpaceId}
          onSelectSpace={handleSelectSpace}
          onRenameSpace={handleRenameSpace}
          onDeleteSpace={handleDeleteSpace}
          onNewSpace={handleNewSpace}
          onEditMeasurement={() => {
            handleNewSpace();
          }}
          onSelectProduct={handleSelectProduct}
        />
      ) : (
        <LiveSearchExperience
          key={measurementKey(measurement, activeSpaceId)}
          initialMeasurement={measurement}
          initialWorkflowId={restoreWorkflowId}
          embedded
          savedSpaces={savedSpaces}
          activeSpaceId={activeSpaceId}
          onSelectSpace={handleSelectSpace}
          onRenameSpace={handleRenameSpace}
          onDeleteSpace={handleDeleteSpace}
          onNewSpace={handleNewSpace}
          onEditMeasurement={handleEditMeasurement}
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

function isWorkflowId(value: string | null): value is string {
  return value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function clearLiveWorkflowHandle(): void {
  try {
    window.sessionStorage.removeItem("fitment.live-workflow-id");
  } catch {
    // The current screen state still resets if session storage is unavailable.
  }
}

function measurementKey(
  measurement: SpaceMeasurement | undefined,
  activeSpaceId: string | undefined,
): string {
  if (measurement === undefined) {
    return "workflow-restore";
  }
  return [
    activeSpaceId ?? measurement.source,
    measurement.widthMm,
    measurement.heightMm,
    measurement.depthMm,
    measurement.accessWidthMm ?? "unknown-access",
  ].join(":");
}

function clearSharedUrl(): void {
  if (window.location.search.length > 0) {
    window.history.replaceState(null, "", "/fit");
  }
}
