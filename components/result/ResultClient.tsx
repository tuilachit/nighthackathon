"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ModelViewerClient } from "@/components/ar/ModelViewerClient";
import { PhoneHandoff } from "@/components/result/PhoneHandoff";
import { PreflightPanel } from "@/components/result/PreflightPanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { CubeIcon, DotIcon, SparkleIcon } from "@/components/ui/Icon";
import { loadPrototypeFromLocalStorage } from "@/lib/local-prototype-store";
import type { PrototypeSpec } from "@/lib/prototype-types";

interface ResultClientProps {
  readonly prototype: PrototypeSpec;
}

export function ResultClient({ prototype }: ResultClientProps): React.JSX.Element {
  const [activePrototype, setActivePrototype] = useState<PrototypeSpec>(prototype);

  useEffect(() => {
    const localPrototype = loadPrototypeFromLocalStorage(prototype.id);
    if (localPrototype !== undefined) {
      setActivePrototype(localPrototype);
    }
  }, [prototype.id]);

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <div className="sticky top-0 z-20 border-b border-slate-200/70 bg-[#F8FAFC]/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
          <Link
            href="/"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold shadow-sm"
          >
            ‹
          </Link>
          <div className="min-w-0 flex-1">
            <p className="mono text-[10px] text-slate-500">/result/{activePrototype.id}</p>
            <p className="truncate text-sm font-semibold text-slate-900">{activePrototype.name}</p>
          </div>
          <StatusPill tone="success">
            <span className="mr-1.5">
              <DotIcon size={6} color="#10B981" />
            </span>
            READY
          </StatusPill>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#2563EB]">Generated prototype</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-normal">{activePrototype.name}</h1>
              </div>
              <StatusPill tone="success">Fallback AR ready</StatusPill>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-600">{activePrototype.prompt}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoBlock label="Category" value={activePrototype.category} />
              <InfoBlock label="Shape" value={activePrototype.shape} />
              <InfoBlock label="Materials" value={activePrototype.materials.join(", ")} />
              <InfoBlock label="Intended use" value={activePrototype.intendedUse} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <CubeIcon size={16} color="#2563EB" />
              <h2 className="text-lg font-semibold">3D preview</h2>
              <p className="mono ml-auto text-[10px] uppercase tracking-wide text-slate-500">
                fallback · {activePrototype.category}.glb
              </p>
            </div>
            <div className="mt-3">
              <ModelViewerClient prototype={activePrototype} mode="preview" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link
                href={`/ar/${activePrototype.id}`}
                className="rounded-lg bg-[#0F172A] px-4 py-3 text-center text-sm font-semibold text-white shadow-[0_6px_20px_rgba(15,23,42,0.25)]"
              >
                View in AR
              </Link>
              <Link
                href={`/build-pack/${activePrototype.id}`}
                className="rounded-lg border border-slate-300 px-4 py-3 text-center text-sm font-semibold text-slate-700"
              >
                Open Build Pack
              </Link>
            </div>
          </div>

          <PhoneHandoff prototype={activePrototype} />
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Key features</div>
            <div className="mt-3 flex flex-col gap-3">
              {activePrototype.features.map((feature) => (
                <div key={feature.label} className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{feature.label}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <SparkleIcon size={15} color="#2563EB" />
              <h2 className="text-lg font-semibold">Generation timeline</h2>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <TimelineRow tone="success" title="Product spec ready" body="Codex app-layer inputs are generated locally." />
              <TimelineRow tone="success" title="Fallback model selected" body={activePrototype.model.glbPath} />
              <TimelineRow tone="warning" title="Custom 3D optional" body={activePrototype.statuses.meshy.message} />
              <TimelineRow tone="primary" title="Build Pack ready" body="AR route, config, AGENTS.md, MVP spec, validation plan, and README content." />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mono mb-2 text-[10px] uppercase tracking-[0.1em] text-slate-500">Refined 3D prompt</div>
            <p className="mt-2 rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
              {activePrototype.refined3DPrompt}
            </p>
          </section>

          <PreflightPanel prototype={activePrototype} />
        </aside>
      </div>
    </main>
  );
}

function InfoBlock({ label, value }: { readonly label: string; readonly value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm leading-5 text-slate-800">{value}</p>
    </div>
  );
}

function TimelineRow({
  title,
  body,
  tone,
}: {
  readonly title: string;
  readonly body: string;
  readonly tone: "primary" | "success" | "warning";
}): React.JSX.Element {
  return (
    <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <span
        className={`mt-1 h-2.5 w-2.5 rounded-full ${
          tone === "success" ? "bg-[#10B981]" : tone === "warning" ? "bg-[#F59E0B]" : "bg-[#2563EB]"
        }`}
      />
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm leading-5 text-slate-600">{body}</p>
      </div>
    </div>
  );
}
