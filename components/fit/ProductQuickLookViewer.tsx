"use client";

import { useEffect, useRef, useState } from "react";
import { CubeIcon } from "@/components/ui/Icon";
import {
  computeScaleFromMeasuredSize,
  formatScaleAttribute,
  getPlacementScale,
  getPlacementSource,
  iosTrueScaleAvailable,
  needsRuntimeScaleMeasurement,
} from "@/lib/model-scaling";
import type { PlacementModel } from "@/lib/model-scaling";

export interface ProductQuickLookViewerProps {
  readonly name: string;
  readonly model: PlacementModel;
}

type ModelViewerElement = HTMLElement & {
  activateAR?: () => Promise<void> | void;
  getDimensions?: () => { readonly x: number; readonly y: number; readonly z: number };
};

/**
 * Handoff-style AR: Android Scene Viewer / iOS Quick Look take over the system camera.
 * Unlike XRPlacementClient this never keeps a live WebXR session — it just opens the
 * platform AR viewer with the model pre-scaled to the product's exact dimensions.
 */
export function ProductQuickLookViewer({ name, model }: ProductQuickLookViewerProps): React.JSX.Element {
  const modelViewerRef = useRef<ModelViewerElement>(null);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "test") {
      void import("@google/model-viewer");
    }
  }, []);

  const needsMeasurement = needsRuntimeScaleMeasurement(model);
  const scaleAttribute = needsMeasurement ? undefined : formatScaleAttribute(getPlacementScale(model));
  const trustsIosScale = iosTrueScaleAvailable(model);

  function handleArLaunch(): void {
    void modelViewerRef.current?.activateAR?.();
  }

  function handleLoad(): void {
    setModelLoaded(true);

    // Generated (Meshy) models have no trustworthy native scale: measure the loaded
    // model's own bounding box and stretch it to the declared real dimensions instead
    // of trusting whatever size the generator happened to produce.
    if (!needsMeasurement) return;

    const element = modelViewerRef.current;
    const dimensions = element?.getDimensions?.();
    if (dimensions === undefined || dimensions.x <= 0 || dimensions.y <= 0 || dimensions.z <= 0) return;

    const measuredMm = { widthMm: dimensions.x * 1000, depthMm: dimensions.z * 1000, heightMm: dimensions.y * 1000 };
    const scale = computeScaleFromMeasuredSize(model.dimensions, measuredMm);
    element?.setAttribute("scale", formatScaleAttribute(scale));
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
          onLoad={handleLoad}
        />
        {!modelLoaded ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-slate-500">
            Loading 3D preview
          </div>
        ) : null}
      </div>

      <div className="rounded-[24px] border border-black/10 bg-white p-3">
        <p className="text-sm leading-5 text-slate-600">
          {trustsIosScale ? "Placed at true real-world size." : "True size on Android; may be resizable on iPhone."}
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
