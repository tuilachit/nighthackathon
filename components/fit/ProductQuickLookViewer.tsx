"use client";

import { useEffect, useRef, useState } from "react";
import { CubeIcon } from "@/components/ui/Icon";
import {
  formatScaleAttribute,
  getPlacementScale,
  getPlacementSource,
  iosTrueScaleAvailable,
  isHeroModel,
} from "@/lib/model-scaling";
import type { PlacementModel } from "@/lib/model-scaling";

export interface ProductQuickLookViewerProps {
  readonly name: string;
  readonly model: PlacementModel;
}

/**
 * Handoff-style AR: Android Scene Viewer / iOS Quick Look take over the system camera.
 * Unlike XRPlacementClient this never keeps a live WebXR session — it just opens the
 * platform AR viewer with the model pre-scaled to the product's exact dimensions.
 */
export function ProductQuickLookViewer({ name, model }: ProductQuickLookViewerProps): React.JSX.Element {
  const modelViewerRef = useRef<HTMLElement & { activateAR?: () => Promise<void> | void }>(null);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "test") {
      void import("@google/model-viewer");
    }
  }, []);

  const scaleAttribute = formatScaleAttribute(getPlacementScale(model));
  const trustsIosScale = iosTrueScaleAvailable(model);

  function handleArLaunch(): void {
    void modelViewerRef.current?.activateAR?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative min-h-[320px] overflow-hidden rounded-[24px] border border-black/10 bg-slate-50 sm:min-h-[380px]">
        <model-viewer
          ref={modelViewerRef}
          src={getPlacementSource(model)}
          ios-src={model.iosUsdzUrl}
          alt={name}
          ar
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="fixed"
          scale={scaleAttribute}
          camera-controls
          auto-rotate
          shadow-intensity="0.8"
          exposure="0.9"
          loading="eager"
          class="relative z-10 h-[320px] w-full bg-transparent sm:h-[380px]"
          onLoad={() => setModelLoaded(true)}
        />
        <div className="mono pointer-events-none absolute left-3 top-3 rounded-full bg-white/70 px-2 py-1 text-[9px] uppercase tracking-wide text-slate-500 backdrop-blur">
          {isHeroModel(model) ? "hero model" : "exact-dimension box"}
        </div>
        {!modelLoaded ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-slate-500">
            Loading 3D preview
          </div>
        ) : null}
      </div>

      <div className="rounded-[24px] border border-black/10 bg-white p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">True-scale AR</p>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          {trustsIosScale
            ? "Placed at exact real-world size on Android and iPhone."
            : "Exact size on Android. iPhone Quick Look may let you resize until a verified USDZ is added."}
        </p>
        <button
          type="button"
          onClick={handleArLaunch}
          className="concept-primary-button mt-3 flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-bold"
        >
          <CubeIcon size={14} color="#fff" />
          View in AR
        </button>
      </div>
    </div>
  );
}
