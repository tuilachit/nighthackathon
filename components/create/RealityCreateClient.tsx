"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyzePromptToPrototype, DEFAULT_PROMPT, EXAMPLE_PROMPTS } from "@/lib/analyzer";
import { savePrototypeToLocalStorage } from "@/lib/local-prototype-store";
import { applyGeneratedModelResult, getStartingMeshyStatus, withMeshyStatus } from "@/lib/model-generation";
import { validateImageUpload } from "@/lib/upload-validation";
import { ArrowRightIcon, CameraIcon, CubeIcon, SparkleIcon, UploadIcon } from "@/components/ui/Icon";
import type { ConceptRefinement, GeneratedModelResult, PrototypeSpec } from "@/lib/prototype-types";

const POLL_INTERVAL_MS = 3500;
const MAX_POLLS = 80;

interface RefineConceptResponse {
  readonly refinement?: ConceptRefinement;
  readonly error?: string;
}

interface StartGenerationResponse {
  readonly prototypeSpec?: PrototypeSpec;
  readonly generation?: GeneratedModelResult;
}

interface StatusGenerationResponse {
  readonly generation?: GeneratedModelResult;
}

export function RealityCreateClient(): React.JSX.Element {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [imageName, setImageName] = useState<string>("No sketch selected");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | undefined>(undefined);
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [validationError, setValidationError] = useState<string | undefined>(undefined);
  const [refinement, setRefinement] = useState<ConceptRefinement | undefined>(undefined);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  const canGenerate = useMemo<boolean>(() => prompt.trim().length > 0 && !isPending && !isRefining, [isPending, isRefining, prompt]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file === undefined) {
      setImageName("No sketch selected");
      setImagePreviewUrl(undefined);
      setImageDataUrl(undefined);
      setValidationError(undefined);
      return;
    }

    const validation = validateImageUpload(file);
    if (!validation.valid) {
      setImageName(file.name);
      setImagePreviewUrl(undefined);
      setImageDataUrl(undefined);
      setValidationError(validation.message);
      return;
    }

    setImageName(file.name);
    setValidationError(undefined);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : undefined;
      setImagePreviewUrl(result);
      setImageDataUrl(result);
    };
    reader.readAsDataURL(file);
  }

  async function handleAskQuestions(): Promise<void> {
    if (prompt.trim().length === 0) {
      return;
    }

    setValidationError(undefined);
    setIsRefining(true);

    try {
      const response = await fetch("/api/refine-concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, imageDataUrl }),
      });
      const data = (await response.json()) as RefineConceptResponse;

      if (!response.ok || data.refinement === undefined) {
        setValidationError(data.error ?? "Could not prepare product questions.");
        return;
      }

      setRefinement(data.refinement);
      setAnswers((currentAnswers) => {
        const nextAnswers = { ...currentAnswers };
        for (const question of data.refinement?.questions ?? []) {
          nextAnswers[question.id] ??= "";
        }
        return nextAnswers;
      });
    } catch {
      setValidationError("Could not prepare product questions.");
    } finally {
      setIsRefining(false);
    }
  }

  function handleGenerate(): void {
    if (!canGenerate) {
      return;
    }

    if (refinement === undefined) {
      void handleAskQuestions();
      return;
    }

    startTransition(() => {
      const founderContext = buildFounderContext(refinement, answers);
      const analyzedSpec = analyzePromptToPrototype(prompt);
      const spec = withMeshyStatus(analyzedSpec, getStartingMeshyStatus(imageDataUrl !== undefined));
      savePrototypeToLocalStorage(spec);
      void upgradePrototypeWithGeneratedModel(spec, prompt, imageDataUrl, founderContext);
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
              Snap a sketch, describe your idea, answer focused product questions, and generate the spatial prototype.
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

            <div className="concept-abstract concept-abstract-warm mt-5 hidden min-h-[244px] flex-col justify-between p-6 text-white shadow-[0_20px_44px_rgba(15,23,42,0.14)] md:flex">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white/74">Live preview</p>
                  <h2 className="mt-2 max-w-[12rem] text-[34px] font-black leading-[0.96] tracking-normal">
                    Ready for AR
                  </h2>
                </div>
                <div className="concept-circle-button flex h-12 w-12 items-center justify-center bg-white/75">
                  <CubeIcon size={18} color="#050505" />
                </div>
              </div>
              <div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/28">
                  <div className="h-full w-3/4 rounded-full bg-white" />
                </div>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <p className="max-w-[15rem] text-sm font-semibold leading-5 text-white">
                    Concept, route, QR handoff, and Build Pack generated together.
                  </p>
                  <p className="text-[28px] font-black leading-none">3/4</p>
                </div>
              </div>
            </div>
          </section>

          <section className="min-w-0">
            <SectionLabel>2 · Describe it</SectionLabel>
            <div className="concept-panel w-full min-w-0 p-4">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-32 w-full resize-none bg-transparent text-[16px] font-medium leading-7 text-slate-950 outline-none"
                aria-label="Product prompt"
                placeholder="Describe the object: shape, parts, materials, controls, seams, handles, surface details..."
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="mono text-[10px] text-slate-500">{prompt.length} chars</p>
                <p className="text-[10px] text-slate-500">generated model syncs to result, AR, and launch</p>
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
          </section>
        </div>

        <section className="concept-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionLabel>3 · Founder context</SectionLabel>
              <p className="text-sm leading-6 text-slate-600">
                Add the object details that make the generated model specific: shape, parts, materials, and hero functional details.
              </p>
            </div>
            <button
              type="button"
              disabled={isRefining || prompt.trim().length === 0}
              onClick={() => void handleAskQuestions()}
              className="concept-pill px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {isRefining ? "Asking" : refinement === undefined ? "Ask" : "Refresh"}
            </button>
          </div>

          {refinement !== undefined ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {refinement.questions.map((question) => (
                <label key={question.id} className="block">
                  <span className="text-sm font-semibold text-slate-900">{question.label}</span>
                  <input
                    value={answers[question.id] ?? ""}
                    onChange={(event) => setAnswers((currentAnswers) => ({ ...currentAnswers, [question.id]: event.target.value }))}
                    placeholder={question.placeholder}
                    className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#2563EB]"
                  />
                </label>
              ))}
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 md:col-span-2">
                <p className="text-sm font-semibold text-blue-950">{refinement.visualDirection}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {refinement.promptAdditions.map((addition) => (
                    <span key={addition} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-blue-800">
                      {addition}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
              The first tap prepares targeted questions. The second tap generates the prototype with those answers included.
            </p>
          )}
        </section>

        <button
          type="button"
          disabled={!canGenerate}
          onClick={handleGenerate}
          className="concept-primary-button flex w-full min-w-0 items-center justify-center gap-2 px-5 py-4 text-[15px] font-bold disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          <SparkleIcon size={16} color="#fff" />
          {isPending ? "Generating Reality MVP" : refinement === undefined ? "Answer product questions" : "Generate Reality MVP"}
          <ArrowRightIcon size={16} color="#fff" />
        </button>
      </section>
    </main>
  );
}

async function upgradePrototypeWithGeneratedModel(
  fallbackSpec: PrototypeSpec,
  prompt: string,
  imageDataUrl: string | undefined,
  founderContext: string,
): Promise<void> {
  try {
    const startResponse = await fetch("/api/generate-model/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, imageDataUrl, founderContext }),
    });

    if (!startResponse.ok) {
      return;
    }

    const startData = (await startResponse.json()) as StartGenerationResponse;
    let activeSpec = startData.prototypeSpec ?? fallbackSpec;
    if (startData.prototypeSpec !== undefined) {
      savePrototypeToLocalStorage(startData.prototypeSpec);
    }

    let generation = startData.generation;
    if (generation === undefined || generation.status !== "pending" || generation.taskId === undefined) {
      return;
    }

    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      await delay(POLL_INTERVAL_MS);

      const params = new URLSearchParams({
        taskId: generation.taskId,
        mode: generation.mode,
        refinedPrompt: generation.refinedMeshyPrompt,
        fallbackModelPath: generation.fallbackModelPath,
        allowTextFallback: generation.mode === "image-to-3d" ? "true" : "false",
      });

      const statusResponse = await fetch(`/api/generate-model/status?${params.toString()}`);
      if (!statusResponse.ok) {
        return;
      }

      const statusData = (await statusResponse.json()) as StatusGenerationResponse;
      if (statusData.generation === undefined) {
        return;
      }

      generation = statusData.generation;
      activeSpec = applyGeneratedModelResult(activeSpec, generation);
      savePrototypeToLocalStorage(activeSpec);

      if (generation.status !== "pending" || generation.taskId === undefined) {
        return;
      }
    }

    savePrototypeToLocalStorage(
      applyGeneratedModelResult(activeSpec, {
        ...generation,
        status: "timeout",
        error: "Custom generation took too long for the live demo.",
      }),
    );
  } catch (error) {
    console.warn("Generated model upgrade failed.", error);
  }
}

function buildFounderContext(refinement: ConceptRefinement, answers: Record<string, string>): string {
  const answerLines = refinement.questions
    .map((question) => {
      const answer = answers[question.id]?.trim();
      return answer !== undefined && answer.length > 0 ? `${question.label}: ${answer}` : "";
    })
    .filter(Boolean);

  return [
    refinement.generationBrief,
    refinement.visualDirection,
    ...refinement.promptAdditions.map((addition) => `Prompt guidance: ${addition}`),
    ...answerLines,
  ].join("\n");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function SectionLabel({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <div className="mb-3 pl-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{children}</div>;
}
