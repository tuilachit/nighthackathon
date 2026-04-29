"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyzePromptToPrototype, DEFAULT_PROMPT, EXAMPLE_PROMPTS } from "@/lib/analyzer";
import { savePrototypeToLocalStorage } from "@/lib/local-prototype-store";
import { applyGeneratedModelResult, getStartingMeshyStatus, withMeshyStatus } from "@/lib/model-generation";
import { validateImageUpload } from "@/lib/upload-validation";
import { ArrowRightIcon, CameraIcon, CubeIcon, DotIcon, SparkleIcon, UploadIcon } from "@/components/ui/Icon";
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
              Snap a sketch, describe your idea, answer focused product questions, and generate the spatial prototype.
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
                <p className="text-[10px] text-slate-500">fallback first · custom model optional</p>
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
          </section>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionLabel>3 · Founder context</SectionLabel>
              <p className="text-sm leading-6 text-slate-600">
                Add the visual details that make the generated model specific: colors, logo placement, materials, and hero details.
              </p>
            </div>
            <button
              type="button"
              disabled={isRefining || prompt.trim().length === 0}
              onClick={() => void handleAskQuestions()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:text-slate-300"
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
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-3.5 text-[15px] font-semibold text-white shadow-[0_6px_20px_rgba(37,99,235,0.25)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          <SparkleIcon size={16} color="#fff" />
          {isPending ? "Generating Reality MVP" : refinement === undefined ? "Answer product questions" : "Generate Reality MVP"}
          <ArrowRightIcon size={16} color="#fff" />
        </button>

        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <DotIcon size={6} color="#10B981" />
          Codex agents online · Vercel deploy ready
        </div>
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
        error: "Custom generation took too long for the live demo. Fallback AR is still available.",
      }),
    );
  } catch (error) {
    console.warn("Generated model upgrade failed; fallback AR remains available.", error);
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
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
      {children}
    </div>
  );
}
