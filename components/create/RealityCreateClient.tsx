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
    <main className="concept-page px-4 py-5 safe-bottom">
      <section className="concept-shell mx-auto flex w-full max-w-[430px] flex-col gap-6 px-4 py-5 sm:px-5 sm:py-6 md:max-w-5xl md:px-8">
        <header className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <div className="concept-circle-button flex h-11 w-11 items-center justify-center">
              <CubeIcon size={18} color="#050505" />
            </div>
            <div className="text-[15px] font-semibold tracking-normal">Reality MVP</div>
            <div className="mono ml-auto rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10px] text-slate-500">
              v0.1 · codex
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">Spatial prototype builder</p>
            <h1 className="mt-2 text-[36px] font-black leading-[0.98] tracking-normal sm:text-[42px] md:text-[56px]">
              Sketch a product.
              <br />
              <span>Walk around it.</span>
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Snap a sketch, describe your idea, and generate the spatial prototype, Build Pack and all.
            </p>
          </div>
        </header>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="min-w-0">
            <SectionLabel>1 · Sketch</SectionLabel>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={handleFileChange}
              aria-label="Upload sketch or product photo"
            />

            <button type="button" className="mt-2 w-full min-w-0 text-left" onClick={() => fileInputRef.current?.click()}>
              {imagePreviewUrl === undefined ? (
                <div className="concept-panel flex min-h-[104px] w-full min-w-0 items-center gap-4 border-dashed p-4">
                  <div className="concept-circle-button flex h-14 w-14 shrink-0 items-center justify-center">
                    <CameraIcon size={22} color="#050505" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-slate-950">Capture or upload a sketch</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">Phone camera · or drop a JPG / PNG</p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white">
                    <UploadIcon size={17} color="#FFFFFF" />
                  </div>
                </div>
              ) : (
                <div className="concept-panel flex min-h-[104px] w-full min-w-0 items-center gap-3 p-2">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[22px] bg-slate-100">
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
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-800">
                {validationError}
              </p>
            ) : null}
          </section>

          <section className="min-w-0">
            <SectionLabel>2 · Describe it</SectionLabel>
            <div className="concept-panel w-full min-w-0 p-4">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-32 w-full resize-none bg-transparent text-[16px] font-medium leading-7 text-slate-950 outline-none"
                aria-label="Product prompt"
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="mono text-[10px] text-slate-500">{prompt.length} chars</p>
                <p className="text-[10px] text-slate-500">fallback first · Meshy optional</p>
              </div>
            </div>

            <div className="noscroll mt-4 flex max-w-full gap-2 overflow-x-auto pb-1">
              {EXAMPLE_PROMPTS.map((examplePrompt) => (
                <button
                  type="button"
                  key={examplePrompt}
                  className={`shrink-0 rounded-full border px-4 py-3 text-left text-[12px] font-bold ${
                    prompt === examplePrompt
                      ? "border-black bg-black text-white"
                      : "border-black/10 bg-white text-slate-700"
                  }`}
                  onClick={() => setPrompt(examplePrompt)}
                >
                  {examplePrompt.length > 28 ? `${examplePrompt.slice(0, 28)}...` : examplePrompt}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!canGenerate}
              onClick={handleGenerate}
              className="concept-primary-button mt-6 flex w-full min-w-0 items-center justify-center gap-2 px-5 py-4 text-[15px] font-bold disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
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
  return <div className="mb-3 pl-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{children}</div>;
}
