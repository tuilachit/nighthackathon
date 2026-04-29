"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ModelViewerClient } from "@/components/ar/ModelViewerClient";
import { PhoneHandoff } from "@/components/result/PhoneHandoff";
import { PreflightPanel } from "@/components/result/PreflightPanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { CubeIcon, DotIcon, SparkleIcon } from "@/components/ui/Icon";
import { LOCAL_PROTOTYPE_UPDATED_EVENT, loadPrototypeForRouteFromLocalStorage } from "@/lib/local-prototype-store";
import type { PrototypeSpec } from "@/lib/prototype-types";

interface ResultClientProps {
  readonly prototype: PrototypeSpec;
}

export function ResultClient({ prototype }: ResultClientProps): React.JSX.Element {
  const [activePrototype, setActivePrototype] = useState<PrototypeSpec>(prototype);
  const generationState = getGenerationState(activePrototype);
  const modelReadinessLabel = getModelReadinessLabel(activePrototype);

  useEffect(() => {
    window.addEventListener(LOCAL_PROTOTYPE_UPDATED_EVENT, syncLocalPrototype);
    window.addEventListener("storage", syncLocalPrototype);
    syncLocalPrototype();
    return () => {
      window.removeEventListener(LOCAL_PROTOTYPE_UPDATED_EVENT, syncLocalPrototype);
      window.removeEventListener("storage", syncLocalPrototype);
    };

    function syncLocalPrototype(): void {
      const localPrototype = loadPrototypeForRouteFromLocalStorage(prototype.id);
      if (localPrototype !== undefined) {
        setActivePrototype(localPrototype);
      }
    }
  }, [prototype.id]);

  return (
    <main className="concept-page text-[#050505] safe-bottom">
      <div className="sticky top-0 z-20 border-b border-black/5 bg-white/72 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
          <Link
            href="/"
            className="concept-circle-button flex h-10 w-10 items-center justify-center text-lg font-semibold"
            aria-label="Back to create"
          >
            ‹
          </Link>
          <div className="min-w-0 flex-1">
            <p className="mono text-[10px] text-slate-500">/result/{activePrototype.id}</p>
            <p className="truncate text-sm font-semibold text-slate-900">{activePrototype.name}</p>
          </div>
          <StatusPill tone={generationState.tone}>
            <span className="mr-1.5">
              <DotIcon size={6} color={generationState.dotColor} />
            </span>
            {generationState.label}
          </StatusPill>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col gap-4">
          <div className="concept-shell border-[8px] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-500">Generated prototype</p>
                <h1 className="mt-1 text-[34px] font-black leading-[0.98] tracking-normal sm:text-[40px]">{activePrototype.name}</h1>
              </div>
              <StatusPill tone={activePrototype.statuses.meshy.kind === "succeeded" ? "success" : "warning"}>
                {modelReadinessLabel}
              </StatusPill>
            </div>

            <GenerationStatusBanner prototype={activePrototype} />

            <ModelAssetLink prototype={activePrototype} />

            <p className="mt-3 text-sm leading-6 text-slate-600">{activePrototype.prompt}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoBlock label="Category" value={activePrototype.category} />
              <InfoBlock label="Shape" value={activePrototype.shape} />
              <InfoBlock label="Materials" value={activePrototype.materials.join(", ")} />
              <InfoBlock label="Intended use" value={activePrototype.intendedUse} />
            </div>
          </div>

          <div className="concept-panel p-3">
            <div className="flex items-center gap-2">
              <CubeIcon size={16} color="#050505" />
              <h2 className="text-lg font-semibold">3D preview</h2>
              <p className="mono ml-auto text-[10px] uppercase tracking-wide text-slate-500">
                {activePrototype.model.remoteModelUrl !== undefined ? "generated" : "model"} · {activePrototype.category}.glb
              </p>
            </div>
            <div className="mt-3">
              <ModelViewerClient prototype={activePrototype} mode="preview" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Link
                href={`/ar/${activePrototype.id}`}
                className="concept-primary-button flex items-center justify-center px-5 py-4 text-center text-sm font-bold"
              >
                View in AR
              </Link>
              <Link
                href={`/launch/${activePrototype.id}`}
                className="rounded-lg bg-[#2563EB] px-4 py-3 text-center text-sm font-semibold text-white shadow-[0_6px_20px_rgba(37,99,235,0.22)]"
              >
                Open Launch Page
              </Link>
              <Link
                href={`/build-pack/${activePrototype.id}`}
                className="concept-pill flex items-center justify-center px-5 py-4 text-center text-sm font-bold"
              >
                Open Build Pack
              </Link>
            </div>
          </div>

          <PhoneHandoff prototype={activePrototype} />
        </section>

        <aside className="flex flex-col gap-4">
          <section className="concept-panel p-4">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Key features</div>
            <div className="mt-3 flex flex-col gap-3">
              {activePrototype.features.map((feature) => (
                <div key={feature.label} className="flex gap-3 border-b border-black/5 pb-3 last:border-b-0 last:pb-0">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white">
                    <span className="h-2 w-2 rounded-full bg-black" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{feature.label}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="concept-panel p-4">
            <div className="flex items-center gap-2">
              <SparkleIcon size={15} color="#050505" />
              <h2 className="text-lg font-semibold">Generation timeline</h2>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <TimelineRow tone="success" title="Product spec ready" body="Codex app-layer inputs are generated locally." />
              <TimelineRow
                tone={activePrototype.model.remoteModelUrl !== undefined ? "success" : "warning"}
                title={activePrototype.model.remoteModelUrl !== undefined ? "Generated model linked" : "Model source pending"}
                body={activePrototype.model.remoteModelUrl ?? activePrototype.statuses.meshy.message}
              />
              <TimelineRow
                tone={activePrototype.statuses.meshy.kind === "succeeded" ? "success" : "warning"}
                title="Custom 3D"
                body={activePrototype.statuses.meshy.message}
              />
              <TimelineRow tone="success" title="Launch page ready" body={`Waitlist route and public page are ready at /launch/${activePrototype.id}.`} />
              <TimelineRow tone="primary" title="Build Pack ready" body="AR route, config, AGENTS.md, MVP spec, validation plan, and README content." />
            </div>
          </section>

          <section className="concept-panel p-4">
            <div className="mono mb-2 text-[10px] uppercase tracking-[0.1em] text-slate-500">Refined 3D prompt</div>
            <p className="mt-2 rounded-[22px] bg-slate-950 p-4 text-xs leading-5 text-slate-100">
              {activePrototype.refined3DPrompt}
            </p>
          </section>

          {activePrototype.analysis !== undefined ? (
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mono mb-2 text-[10px] uppercase tracking-[0.1em] text-slate-500">Generation brief</div>
              <p className="text-sm leading-6 text-slate-700">{activePrototype.analysis.visualDirection}</p>
              <div className="mt-3 flex flex-col gap-2">
                {activePrototype.analysis.generationNotes.map((note) => (
                  <p key={note} className="rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-600">
                    {note}
                  </p>
                ))}
              </div>
            </section>
          ) : null}

          <PreflightPanel prototype={activePrototype} />
        </aside>
      </div>
    </main>
  );
}

function getGenerationState(prototype: PrototypeSpec): {
  readonly tone: "primary" | "success" | "warning" | "neutral";
  readonly dotColor: string;
  readonly label: string;
} {
  if (prototype.statuses.meshy.kind === "succeeded") {
    return { tone: "success", dotColor: "#10B981", label: "GLB READY" };
  }

  if (prototype.statuses.meshy.kind === "pending") {
    return { tone: "warning", dotColor: "#F59E0B", label: "GENERATING" };
  }

  return { tone: "success", dotColor: "#10B981", label: "AR READY" };
}

function getModelReadinessLabel(prototype: PrototypeSpec): string {
  if (prototype.model.remoteModelUrl !== undefined || prototype.statuses.meshy.kind === "succeeded") {
    return "Generated GLB ready";
  }

  if (prototype.statuses.meshy.kind === "pending") {
    return "Generating GLB";
  }

  return "Model pending";
}

function GenerationStatusBanner({ prototype }: { readonly prototype: PrototypeSpec }): React.JSX.Element | null {
  const status = prototype.statuses.meshy;

  if (status.kind === "pending") {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
        Model is generating
        {typeof status.progress === "number" ? ` ${status.progress}%` : ""}
      </div>
    );
  }

  if (status.kind === "failed" || status.kind === "timeout") {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
        Generated model is unavailable. {status.message}
      </div>
    );
  }

  return null;
}

function ModelAssetLink({ prototype }: { readonly prototype: PrototypeSpec }): React.JSX.Element {
  const modelUrl = prototype.model.remoteModelUrl ?? prototype.model.glbPath;
  const isRemoteModel = prototype.model.remoteModelUrl !== undefined;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {isRemoteModel ? "Generated .glb URL" : "Current model path"}
      </p>
      {isRemoteModel ? (
        <a
          href={modelUrl}
          target="_blank"
          rel="noreferrer"
          className="mono mt-1 block break-all text-xs leading-5 text-[#2563EB]"
        >
          {modelUrl}
        </a>
      ) : (
        <p className="mono mt-1 break-all text-xs leading-5 text-slate-600">{modelUrl}</p>
      )}
    </div>
  );
}

function InfoBlock({ label, value }: { readonly label: string; readonly value: string }): React.JSX.Element {
  return (
    <div className="rounded-[22px] border border-black/5 bg-slate-50 p-3">
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
    <div className="flex gap-3 border-b border-black/5 pb-3 last:border-b-0 last:pb-0">
      <span
        className={`mt-1 h-2.5 w-2.5 rounded-full ${
          tone === "success" ? "bg-[#10B981]" : tone === "warning" ? "bg-[#F59E0B]" : "bg-black"
        }`}
      />
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm leading-5 text-slate-600">{body}</p>
      </div>
    </div>
  );
}
