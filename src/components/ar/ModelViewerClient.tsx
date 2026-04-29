"use client";

import { useEffect, useState } from "react";
import type { PrototypeSpec } from "@/lib/prototype-types";

export function ModelViewerClient({ spec }: { spec: PrototypeSpec }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    import("@google/model-viewer").then(() => setLoaded(true));
  }, []);

  return (
    <main className="relative min-h-dvh bg-slate-950 text-white">
      <div className="absolute left-4 right-4 top-6 z-10 rounded-3xl bg-white/90 p-4 text-slate-950 backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {loaded ? "AR viewer ready" : "Loading AR component"}
        </p>
        <h1 className="mt-1 text-lg font-bold">{spec.name}</h1>
      </div>

      <model-viewer
        src={spec.model.remoteModelUrl ?? spec.model.glbPath}
        ios-src={spec.model.iosPath}
        alt={spec.name}
        ar
        ar-modes="webxr scene-viewer quick-look"
        camera-controls
        auto-rotate
        shadow-intensity="1"
        exposure="1"
        style={{ width: "100%", height: "100dvh", backgroundColor: "#020617" }}
      />

      <section className="absolute bottom-4 left-4 right-4 rounded-3xl bg-white/95 p-4 text-slate-950 shadow-xl">
        <p className="font-bold">Place this prototype on the table</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{spec.features.slice(0, 3).join(" · ")}</p>
        <p className="mt-3 rounded-2xl bg-blue-50 p-3 text-xs font-semibold text-blue-700">
          If AR is unavailable, this page still works as an interactive 3D preview.
        </p>
      </section>
    </main>
  );
}
