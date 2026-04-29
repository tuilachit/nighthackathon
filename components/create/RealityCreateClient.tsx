"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyzePromptToPrototype, DEFAULT_PROMPT, EXAMPLE_PROMPTS } from "@/lib/analyzer";
import { savePrototypeToLocalStorage } from "@/lib/local-prototype-store";
import { getInitialMeshyStatus, withMeshyStatus } from "@/lib/model-generation";
import { validateImageUpload } from "@/lib/upload-validation";
import { ArrowRightIcon, CameraIcon, CubeIcon, DotIcon, SparkleIcon, UploadIcon } from "@/components/ui/Icon";

export function RealityCreateClient(): React.JSX.Element {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [imageName, setImageName] = useState<string>("No sketch selected");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | undefined>(undefined);
  const [validationError, setValidationError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  const canGenerate = useMemo<boolean>(() => prompt.trim().length > 0 && !isPending, [isPending, prompt]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file === undefined) {
      setImageName("No sketch selected");
      setImagePreviewUrl(undefined);
      setValidationError(undefined);
      return;
    }

    const validation = validateImageUpload(file);
    if (!validation.valid) {
      setImageName(file.name);
      setImagePreviewUrl(undefined);
      setValidationError(validation.message);
      return;
    }

    setImageName(file.name);
    setImagePreviewUrl(URL.createObjectURL(file));
    setValidationError(undefined);
  }

  function handleGenerate(): void {
    if (!canGenerate) {
      return;
    }

    startTransition(() => {
      const analyzedSpec = analyzePromptToPrototype(prompt);
      const spec = withMeshyStatus(analyzedSpec, getInitialMeshyStatus(imagePreviewUrl !== undefined));
      savePrototypeToLocalStorage(spec);
      router.push(`/result/${spec.id}`);
    });
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-6 text-[#0F172A]">
      <section className="mx-auto flex w-full max-w-[430px] flex-col gap-5 md:max-w-5xl">
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#2563EB] to-[#1E40AF]">
              <CubeIcon size={16} color="#fff" />
            </div>
            <div className="text-sm font-semibold tracking-normal">Reality MVP</div>
            <div className="mono ml-auto rounded border border-slate-200 bg-slate-100 px-1.5 py-1 text-[10px] text-slate-500">
              v0.1 · codex
            </div>
          </div>
          <div>
            <h1 className="text-[26px] font-bold leading-[1.15] tracking-normal">
              Sketch a product.
              <br />
              <span className="text-[#2563EB]">Walk around it.</span>
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Snap a sketch, describe your idea, and generate the spatial prototype, Build Pack and all.
            </p>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section>
            <SectionLabel>1 · Sketch</SectionLabel>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={handleFileChange}
              aria-label="Upload sketch or product photo"
            />

            <button type="button" className="mt-2 w-full text-left" onClick={() => fileInputRef.current?.click()}>
              {imagePreviewUrl === undefined ? (
                <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white p-4 shadow-sm">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#2563EB]">
                    <CameraIcon size={22} color="#2563EB" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">Capture or upload a sketch</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">Phone camera · or drop a JPG / PNG</p>
                  </div>
                  <UploadIcon size={18} color="#64748B" />
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreviewUrl} alt="Uploaded product sketch preview" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#10B981]">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      </span>
                      Sketch ready
                    </div>
                    <p className="mono mt-1 truncate text-[11px] text-slate-500">{imageName}</p>
                  </div>
                </div>
              )}
            </button>

            {validationError !== undefined ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {validationError}
              </p>
            ) : null}
          </section>

          <section>
            <SectionLabel>2 · Describe it</SectionLabel>
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-24 w-full resize-none bg-transparent text-sm leading-6 text-slate-900 outline-none"
              aria-label="Product prompt"
            />
              <div className="mt-2 flex items-center justify-between">
                <p className="mono text-[10px] text-slate-500">{prompt.length} chars</p>
                <p className="text-[10px] text-slate-500">fallback first · Meshy optional</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((examplePrompt) => (
                <button
                  type="button"
                  key={examplePrompt}
                  className={`rounded-full border px-3 py-1.5 text-left text-[11.5px] font-medium ${
                    prompt === examplePrompt
                      ? "border-[#2563EB] bg-blue-50 text-[#2563EB]"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                  onClick={() => setPrompt(examplePrompt)}
                >
                  {examplePrompt.length > 52 ? `${examplePrompt.slice(0, 52)}...` : examplePrompt}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!canGenerate}
              onClick={handleGenerate}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-3.5 text-[15px] font-semibold text-white shadow-[0_6px_20px_rgba(37,99,235,0.25)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              <SparkleIcon size={16} color="#fff" />
              {isPending ? "Generating Reality MVP" : "Generate Reality MVP"}
              <ArrowRightIcon size={16} color="#fff" />
            </button>
          </section>
        </div>

        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <DotIcon size={6} color="#10B981" />
          Codex agents online · Vercel deploy ready
        </div>
      </section>
    </main>
  );
}

function SectionLabel({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
      {children}
    </div>
  );
}
