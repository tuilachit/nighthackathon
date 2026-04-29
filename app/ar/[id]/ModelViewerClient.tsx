"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  getIosModelSource,
  getModelViewerAssetUrl,
  getPrimaryModelSource,
  isSupportedModelAssetSource,
} from "@/lib/assets";
import { LOCAL_PROTOTYPE_UPDATED_EVENT, loadPrototypeFromLocalStorage } from "@/lib/local-prototype-store";
import { DotIcon } from "@/components/ui/Icon";
import type { ArCompatibilityStatus, PrototypeSpec } from "@/lib/prototype-types";

interface ModelViewerClientProps {
  readonly prototype: PrototypeSpec;
}

type ModelViewerElement = HTMLElement & {
  activateAR?: () => Promise<void> | void;
};

function getCompatibilityStatus(): ArCompatibilityStatus {
  if (typeof window === "undefined") {
    return { kind: "unknown", message: "Checking browser AR support." };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(userAgent)) {
    return { kind: "quick-look", message: "iOS needs a USDZ asset for native Quick Look AR." };
  }

  if (/android/.test(userAgent)) {
    return { kind: "scene-viewer", message: "Android Chrome can launch Scene Viewer when ARCore is available." };
  }

  if ("xr" in window.navigator) {
    return { kind: "webxr", message: "WebXR support detected. Use a compatible mobile browser for AR." };
  }

  return { kind: "preview-only", message: "3D preview is available. Open on a phone for AR placement." };
}

export function ModelViewerClient({ prototype }: ModelViewerClientProps): React.JSX.Element {
  const modelViewerRef = useRef<ModelViewerElement>(null);
  const [activePrototype, setActivePrototype] = useState<PrototypeSpec>(prototype);
  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  const [modelFailed, setModelFailed] = useState<boolean>(false);
  const [arLaunchError, setArLaunchError] = useState<string | undefined>();
  const [compatibility, setCompatibility] = useState<ArCompatibilityStatus>(prototype.statuses.arCompatibility);

  const rawModelSource = useMemo<string>(() => getPrimaryModelSource(activePrototype.model), [activePrototype.model]);
  const modelSource = useMemo<string>(
    () => getModelViewerAssetUrl(rawModelSource) ?? activePrototype.model.glbPath,
    [activePrototype.model.glbPath, rawModelSource],
  );
  const iosSource = useMemo<string | undefined>(
    () => getModelViewerAssetUrl(getIosModelSource(activePrototype.model)),
    [activePrototype.model],
  );
  const hasSupportedModel = isSupportedModelAssetSource(rawModelSource, "glb");

  useEffect(() => {
    let isMounted = true;

    import("@google/model-viewer")
      .then(() => {
        if (isMounted) {
          setIsRegistered(true);
          setCompatibility(getCompatibilityStatus());
        }
      })
      .catch(() => {
        if (isMounted) {
          setModelFailed(true);
        }
      });

    return () => {
      isMounted = false;
    };
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

  function handleLaunchAR(): void {
    const modelViewer = modelViewerRef.current;

    if (!modelViewer?.activateAR) {
      setArLaunchError("AR launch is not available in this browser. Try Android Chrome, or add a USDZ file for iPhone Quick Look.");
      return;
    }

    const result = modelViewer.activateAR();

    if (result instanceof Promise) {
      result.catch(() => {
        setArLaunchError("AR launch failed on this device. Try Android Chrome, or add a USDZ file for iPhone Quick Look.");
      });
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-slate-950">
      {!isRegistered ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950 text-white">
          <div className="rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm shadow-2xl backdrop-blur">
            Loading AR viewer...
          </div>
        </div>
      ) : null}

      <model-viewer
        ref={modelViewerRef}
        src={modelSource}
        ios-src={iosSource}
        alt={activePrototype.name}
        ar
        ar-modes="webxr scene-viewer quick-look"
        camera-controls
        auto-rotate
        shadow-intensity="1"
        exposure="1"
        interaction-prompt="auto"
        touch-action="pan-y"
        className="h-[100dvh] w-full"
        onError={() => {
          setModelFailed(true);
        }}
      />

      <button
        className="fixed bottom-56 left-1/2 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-2xl ring-1 ring-slate-950/10"
        data-testid="view-in-ar-button"
        onClick={handleLaunchAR}
        type="button"
      >
        View in AR
      </button>

      {modelFailed || !hasSupportedModel ? (
        <div className="absolute left-4 right-4 top-4 z-40 rounded-lg border border-red-300/30 bg-red-100/95 p-3 text-xs font-medium leading-5 text-red-950 shadow-xl">
          The GLB model could not be loaded. Check that the Meshy URL is HTTPS, points to a .glb file, and has not expired.
        </div>
      ) : null}

      {arLaunchError ? (
        <div className="absolute left-4 right-4 top-20 z-40 rounded-lg border border-amber-300/30 bg-amber-100/95 p-3 text-xs font-medium leading-5 text-amber-950 shadow-xl">
          {arLaunchError}
        </div>
      ) : null}

      <div className="pointer-events-none fixed left-4 top-4 z-30 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70 backdrop-blur">
        {compatibility.kind}
      </div>

      <section className="fixed bottom-4 left-4 right-4 z-30 rounded-lg border border-white/20 bg-white/90 p-4 text-slate-950 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500">webxr · scene-viewer · quick-look</p>
            <h1 className="mt-1 text-base font-semibold leading-tight">{activePrototype.name}</h1>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            <DotIcon size={6} color="#10B981" />
            AR ready
          </div>
        </div>

        <p className="mt-3 text-sm leading-5 text-slate-600">
          {activePrototype.features
            .slice(0, 3)
            .map((feature) => feature.label)
            .join(" · ")}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="mono min-w-0 truncate text-[10px] leading-4 text-slate-500">
            src={activePrototype.model.remoteModelUrl ? "spec.model.remoteModelUrl" : "spec.model.glbPath"}
          </p>
          <Link href={`/result/${activePrototype.id}`} className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold">
            Result
          </Link>
        </div>
      </section>
    </div>
  );
}
