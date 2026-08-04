"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  readonly canActivateAR?: boolean;
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
  const [canActivateAr, setCanActivateAr] = useState(false);
  const [canUseQuickLook, setCanUseQuickLook] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const needsMeasurement = needsRuntimeScaleMeasurement(model);
  const scaleAttribute = needsMeasurement ? undefined : formatScaleAttribute(getPlacementScale(model));
  const trustsIosScale = iosTrueScaleAvailable(model);

  const handleLoad = useCallback((): void => {
    setModelLoaded(true);
    setCanActivateAr(modelViewerRef.current?.canActivateAR === true);

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
  }, [model, needsMeasurement]);

  useEffect(() => {
    const probe = document.createElement("a");
    let supportsArLink = false;
    try {
      supportsArLink =
        typeof probe.relList.supports === "function" && probe.relList.supports("ar");
    } catch {
      // DOM shims and non-Safari browsers can expose supports() without an AR token list.
    }
    setCanUseQuickLook(model.iosUsdzUrl !== undefined && supportsArLink);

    if (process.env.NODE_ENV !== "test") {
      void import("@google/model-viewer").then(() => {
        window.requestAnimationFrame(() => {
          setCanActivateAr(modelViewerRef.current?.canActivateAR === true);
        });
      });
    }
  }, [model.iosUsdzUrl]);

  useEffect(() => {
    const element = modelViewerRef.current;
    element?.addEventListener("load", handleLoad);
    return () => element?.removeEventListener("load", handleLoad);
  }, [handleLoad]);

  async function handlePrimaryAction(): Promise<void> {
    const element = modelViewerRef.current;
    if (canActivateAr) {
      await element?.activateAR?.();
      return;
    }

    element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    element?.focus();
    try {
      await element?.requestFullscreen?.();
    } catch {
      // Fullscreen is an enhancement; the inline, focusable 3D viewer remains usable.
    }
    setActionStatus("Interactive 3D view ready.");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative min-h-[320px] overflow-hidden rounded-md border border-[#17221f]/30 bg-white sm:min-h-[380px]">
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
          shadow-intensity="0.8"
          exposure="0.9"
          loading="eager"
          tabIndex={0}
          class="relative z-10 h-[320px] w-full bg-transparent sm:h-[380px]"
        />
        {!modelLoaded ? (
          <div className="fit-data pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-medium uppercase tracking-[0.08em] text-[#17221f]/65">
            Loading 3D preview
          </div>
        ) : null}
      </div>

      <div className="rounded-md border border-[#17221f]/30 bg-white p-3">
        <p className="text-sm leading-5 text-[#17221f]/70">
          {trustsIosScale ? "Placed at true real-world size." : "True size on Android; may be resizable on iPhone."}
        </p>
        {canUseQuickLook && model.iosUsdzUrl !== undefined ? (
          <a
            href={model.iosUsdzUrl}
            rel="ar"
            aria-label="View in your room"
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-sm bg-[#17221f] px-4 py-3 text-sm font-bold text-white after:content-['View_in_your_room'] hover:bg-[#26332f]"
          >
            {/* Safari requires the tapped rel="ar" link to have a single direct image child. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/fitment-192.svg"
              alt=""
              width="14"
              height="14"
              className="h-3.5 w-3.5 brightness-0 invert"
            />
          </a>
        ) : (
          <button
            type="button"
            onClick={() => void handlePrimaryAction()}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-sm bg-[#17221f] px-4 py-3 text-sm font-bold text-white hover:bg-[#26332f]"
          >
            <CubeIcon size={14} color="#fff" />
            {modelLoaded && canActivateAr ? "View in your room" : "View in 3D"}
          </button>
        )}
        <p className="sr-only" aria-live="polite">
          {actionStatus}
        </p>
      </div>
    </div>
  );
}
