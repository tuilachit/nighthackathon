"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { loadLocalPrototype } from "@/lib/local-prototype-store";
import type { PrototypeSpec } from "@/lib/prototype-types";

export function ResultClient({ seeded }: { seeded: PrototypeSpec }) {
  const [spec, setSpec] = useState<PrototypeSpec>(() => {
    if (typeof window === "undefined") return seeded;
    return loadLocalPrototype(seeded.id) ?? seeded;
  });

  useEffect(() => {
    window.addEventListener("storage", syncLocalPrototype);
    return () => window.removeEventListener("storage", syncLocalPrototype);

    function syncLocalPrototype() {
      setSpec(loadLocalPrototype(seeded.id) ?? seeded);
    }
  }, [seeded]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-5 py-6">
      <header className="pt-6">
        <Link href="/" className="text-sm font-semibold text-slate-500">Back</Link>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">{spec.name}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="green">fallback ready</Badge>
          <Badge tone={spec.meshy.state === "succeeded" ? "green" : "amber"}>
            Meshy {spec.meshy.state}
          </Badge>
        </div>
      </header>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex h-72 items-center justify-center rounded-2xl bg-slate-100">
          <div className="text-center">
            <p className="text-sm font-bold text-slate-500">3D preview</p>
            <p className="mt-2 font-mono text-xs text-slate-500">{spec.model.glbPath}</p>
          </div>
        </div>
        <Link
          href={`/ar/${spec.id}`}
          className="mt-4 flex h-13 items-center justify-center rounded-2xl bg-slate-950 font-bold text-white"
        >
          View in AR
        </Link>
      </section>

      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Product spec</p>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="font-semibold text-slate-500">Shape</dt>
            <dd className="mt-1 text-slate-950">{spec.shape}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Features</dt>
            <dd className="mt-1 text-slate-950">{spec.features.join(" · ")}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5">
        <p className="font-semibold text-amber-900">Custom generation is optional</p>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          The fallback model is ready now. Meshy Image-to-3D/Text-to-3D can upgrade this prototype without blocking AR.
        </p>
      </section>

      <Link href={`/build-pack/${spec.id}`} className="mt-5 flex h-13 items-center justify-center rounded-2xl border border-slate-200 bg-white font-bold">
        View Codex Build Pack
      </Link>
    </main>
  );
}
