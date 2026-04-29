"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CubeIcon } from "@/components/ui/Icon";
import { getIosModelSource, getModelViewerAssetUrl, getPrimaryModelSource } from "@/lib/assets";
import { LOCAL_PROTOTYPE_UPDATED_EVENT, loadPrototypeFromLocalStorage } from "@/lib/local-prototype-store";
import type { ArCompatibilityStatus, PrototypeSpec } from "@/lib/prototype-types";

interface ModelViewerClientProps {
  readonly prototype: PrototypeSpec;
  readonly mode: "preview" | "ar";
}

function getCompatibilityStatus(): ArCompatibilityStatus {
  if (typeof window === "undefined") {
    return { kind: "unknown", message: "Checking browser AR support." };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(userAgent)) {
    return { kind: "quick-look", message: "iOS Quick Look is available when a USDZ asset is configured." };
  }

  if (/android/.test(userAgent)) {
    return { kind: "scene-viewer", message: "Android can launch Scene Viewer when supported by the browser." };
  }

  if ("xr" in window.navigator) {
    return { kind: "webxr", message: "WebXR support detected. Use a compatible mobile browser for AR." };
  }

  return { kind: "preview-only", message: "3D preview is available. Open on a phone for AR placement." };
}

export function ModelViewerClient({ prototype, mode }: ModelViewerClientProps): React.JSX.Element {
  const modelViewerRef = useRef<HTMLElement & { activateAR?: () => Promise<void> }>(null);
  const [activePrototype, setActivePrototype] = useState<PrototypeSpec>(prototype);
  const [compatibility, setCompatibility] = useState<ArCompatibilityStatus>(prototype.statuses.arCompatibility);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [modelFailed, setModelFailed] = useState<boolean>(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "test") {
      void import("@google/model-viewer");
    }
    setCompatibility(getCompatibilityStatus());
  }, []);

  useEffect(() => {
    window.addEventListener(LOCAL_PROTOTYPE_UPDATED_EVENT, syncLocalPrototype);
    window.addEventListener("storage", syncLocalPrototype);
    syncLocalPrototype();
    return () => {
      window.removeEventListener(LOCAL_PROTOTYPE_UPDATED_EVENT, syncLocalPrototype);
      window.removeEventListener("storage", syncLocalPrototype);
    };

    function syncLocalPrototype(): void {
      const localPrototype = loadPrototypeFromLocalStorage(prototype.id);
      if (localPrototype !== undefined) {
        setActivePrototype(localPrototype);
      }
    }
  }, [prototype.id]);

  const modelSource = useMemo<string>(
    () => getModelViewerAssetUrl(getPrimaryModelSource(activePrototype.model)) ?? activePrototype.model.glbPath,
    [activePrototype.model],
  );
  const iosSource = useMemo<string | undefined>(
    () => getModelViewerAssetUrl(getIosModelSource(activePrototype.model)),
    [activePrototype.model],
  );

  function handleArLaunch(): void {
    void modelViewerRef.current?.activateAR?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          mode === "ar"
            ? "concept-abstract concept-abstract-warm relative min-h-[340px] border border-white/20 sm:min-h-[420px]"
            : "concept-abstract relative min-h-[320px] border border-black/10 shadow-[0_20px_42px_rgba(15,23,42,0.16)] sm:min-h-[380px]"
        }
      >
        <model-viewer
          ref={modelViewerRef}
          src={modelSource}
          ios-src={iosSource}
          ar
          ar-modes="webxr scene-viewer quick-look"
          camera-controls
          auto-rotate
          shadow-intensity="0.8"
          exposure="0.9"
          loading="eager"
          class="relative z-10 h-[320px] w-full bg-transparent sm:h-[380px]"
          onLoad={() => {
            setModelLoaded(true);
            setModelFailed(false);
          }}
          onError={() => {
            setModelLoaded(false);
            setModelFailed(true);
          }}
        />
        <div
          className={`mono pointer-events-none absolute left-3 top-3 rounded-full px-2 py-1 text-[9px] uppercase tracking-wide ${
            mode === "ar" ? "bg-white/10 text-white/55 backdrop-blur" : "bg-white/70 text-slate-500 backdrop-blur"
          }`}
        >
          {activePrototype.model.source} · {getPrimaryModelSource(activePrototype.model).split("?")[0]?.split("/").pop()}
        </div>
        <div
          className={`pointer-events-none absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-full border px-3 py-2 text-[10px] font-semibold ${
            mode === "ar" ? "border-white/20 bg-white/20 text-white backdrop-blur" : "border-white/20 bg-white/80 text-slate-900 backdrop-blur"
          }`}
        >
          <CubeIcon size={10} color={mode === "ar" ? "#D1D5DB" : "#334155"} />
          <span className="mono">.glb</span>
        </div>
        {!modelLoaded && !modelFailed ? (
          <div
            className={`pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium ${
              mode === "ar" ? "text-white/55" : "text-slate-500"
            }`}
          >
            Loading 3D preview
          </div>
        ) : null}
        {modelFailed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100 px-6 text-center">
            <p className="text-sm font-semibold text-slate-900">Model preview needs a validated GLB.</p>
            <p className="text-xs leading-5 text-slate-600">
              Check that the generated Meshy URL is HTTPS, points to a .glb file, and has not expired.
            </p>
          </div>
        ) : null}
      </div>

      <div
        className={
          mode === "ar"
            ? "concept-panel p-4"
            : "rounded-[24px] border border-black/10 bg-white p-3"
        }
      >
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
          AR compatibility
        </p>
        <p className="mt-1 text-sm leading-5 text-slate-600">{compatibility.message}</p>
        {mode === "ar" ? (
          <button
            type="button"
            onClick={handleArLaunch}
            className="concept-primary-button mt-3 w-full px-4 py-3 text-sm font-bold"
            data-testid="view-in-ar-button"
          >
            View in AR
          </button>
        ) : null}
      </div>
    </div>
  );
}
