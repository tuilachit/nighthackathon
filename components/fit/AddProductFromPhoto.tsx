"use client";

import { useRef, useState } from "react";
import { getModelViewerAssetUrl } from "@/lib/assets";
import { validateImageUpload } from "@/lib/upload-validation";
import type { PlacementCandidate } from "@/components/xr/XRPlacementClient";

export interface AddProductFromPhotoProps {
  readonly onGenerated: (candidate: PlacementCandidate) => void;
  readonly onCancel: () => void;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40;

interface StartGenerationResponse {
  readonly generation?: {
    readonly status: "pending" | "succeeded" | "failed" | "timeout";
    readonly taskId?: string;
    readonly mode: "image-to-3d" | "text-to-3d";
    readonly refinedMeshyPrompt: string;
    readonly error?: string;
  };
  readonly error?: string;
}

interface StatusResponse {
  readonly generation?: {
    readonly status: "pending" | "succeeded" | "failed" | "timeout";
    readonly taskId?: string;
    readonly glbUrl?: string;
    readonly usdzUrl?: string;
    readonly error?: string;
  };
}

type Phase = "form" | "generating" | "error";

export function AddProductFromPhoto({ onGenerated, onCancel }: AddProductFromPhotoProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | undefined>(undefined);
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [imageError, setImageError] = useState<string | undefined>(undefined);
  const [name, setName] = useState<string>("");
  const [retailer, setRetailer] = useState<string>("");
  const [priceLabel, setPriceLabel] = useState<string>("");
  const [widthMm, setWidthMm] = useState<number>(800);
  const [depthMm, setDepthMm] = useState<number>(400);
  const [heightMm, setHeightMm] = useState<number>(900);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const canSubmit = name.trim().length > 0 && widthMm > 0 && depthMm > 0 && heightMm > 0;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file === undefined) return;

    const validation = validateImageUpload(file);
    if (!validation.valid) {
      setImageError(validation.message);
      return;
    }

    setImageError(undefined);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : undefined;
      setImagePreviewUrl(result);
      setImageDataUrl(result);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;

    setPhase("generating");
    setErrorMessage(undefined);
    setStatusMessage("Starting generation…");

    try {
      const startResponse = await fetch("/api/generate-model/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: name, imageDataUrl, founderContext: "" }),
      });
      const startData = (await startResponse.json()) as StartGenerationResponse;
      const generation = startData.generation;

      if (!startResponse.ok || generation === undefined) {
        setErrorMessage(startData.error ?? generation?.error ?? "Could not start generation.");
        setPhase("error");
        return;
      }

      if (generation.status === "failed") {
        setErrorMessage(generation.error ?? "Generation failed.");
        setPhase("error");
        return;
      }

      if (generation.taskId === undefined) {
        setErrorMessage("Generation did not return a task id.");
        setPhase("error");
        return;
      }

      await pollUntilDone(generation.taskId, generation.mode, generation.refinedMeshyPrompt);
    } catch {
      setErrorMessage("Could not reach the generation service.");
      setPhase("error");
    }
  }

  async function pollUntilDone(taskId: string, mode: string, refinedPrompt: string): Promise<void> {
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      await delay(POLL_INTERVAL_MS);

      const params = new URLSearchParams({
        taskId,
        mode,
        refinedPrompt,
        fallbackModelPath: "/models/unit-box.glb",
        allowTextFallback: mode === "image-to-3d" ? "true" : "false",
      });

      const statusResponse = await fetch(`/api/generate-model/status?${params.toString()}`);
      const statusData = (await statusResponse.json()) as StatusResponse;
      const generation = statusData.generation;

      if (!statusResponse.ok || generation === undefined) {
        setErrorMessage("Lost track of the generation task.");
        setPhase("error");
        return;
      }

      if (generation.status === "succeeded" && generation.glbUrl !== undefined) {
        onGenerated({
          id: `generated-${generation.taskId ?? taskId}`,
          name: name.trim(),
          retailer: retailer.trim().length > 0 ? retailer.trim() : "Generated",
          priceLabel: priceLabel.trim().length > 0 ? priceLabel.trim() : "—",
          fitLabel: "",
          model: {
            dimensions: { widthMm, depthMm, heightMm },
            glbUrl: getModelViewerAssetUrl(generation.glbUrl),
            iosUsdzUrl: getModelViewerAssetUrl(generation.usdzUrl),
            placeholderBoxGlbUrl: "/models/unit-box.glb",
            scaleSource: "generated",
          },
        });
        return;
      }

      if (generation.status === "failed" || generation.status === "timeout") {
        setErrorMessage(generation.error ?? "Generation failed.");
        setPhase("error");
        return;
      }

      // Keep polling; taskId can change once (image-to-3d falling back to text-to-3d).
      if (generation.taskId !== undefined && generation.taskId !== taskId) {
        taskId = generation.taskId;
      }
      setStatusMessage("Generating the 3D model…");
    }

    setErrorMessage("Generation took too long.");
    setPhase("error");
  }

  if (phase === "generating") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[24px] border border-black/10 bg-white p-8 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-black" />
        <p className="text-sm font-semibold text-slate-700">{statusMessage}</p>
        <p className="text-xs text-slate-400">This can take 30-60 seconds.</p>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
      {phase === "error" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {errorMessage}
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
        aria-label="Upload a product photo"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex min-h-[104px] items-center gap-4 rounded-2xl border border-dashed border-black/15 p-4 text-left"
      >
        {imagePreviewUrl === undefined ? (
          <span className="text-sm font-semibold text-slate-600">Tap to choose a product photo</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePreviewUrl} alt="Product preview" className="h-20 w-20 rounded-xl object-cover" />
        )}
      </button>
      {imageError !== undefined ? <p className="text-xs text-amber-700">{imageError}</p> : null}

      <label className="block">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Product name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Oakridge bookcase"
          className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-black"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Retailer</span>
          <input
            value={retailer}
            onChange={(event) => setRetailer(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-black"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Price</span>
          <input
            value={priceLabel}
            onChange={(event) => setPriceLabel(event.target.value)}
            placeholder="$249"
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-black"
          />
        </label>
      </div>

      <div className="rounded-2xl bg-slate-50 p-3.5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          Real dimensions (from the product listing — never guessed)
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          <NumberField label="Width" valueMm={widthMm} onChangeMm={setWidthMm} />
          <NumberField label="Depth" valueMm={depthMm} onChangeMm={setDepthMm} />
          <NumberField label="Height" valueMm={heightMm} onChangeMm={setHeightMm} />
        </div>
      </div>

      <div className="flex gap-2.5">
        <button type="button" onClick={onCancel} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm font-bold text-slate-900">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-[1.4] rounded-2xl bg-black py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Generate 3D model
        </button>
      </div>
    </form>
  );
}

function NumberField({
  label,
  valueMm,
  onChangeMm,
}: {
  readonly label: string;
  readonly valueMm: number;
  readonly onChangeMm: (mm: number) => void;
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-slate-400">{label} (mm)</span>
      <input
        type="number"
        inputMode="decimal"
        value={valueMm}
        onChange={(event) => {
          const raw = Number(event.target.value);
          if (!Number.isNaN(raw)) onChangeMm(raw);
        }}
        aria-label={`${label} in millimetres`}
        className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm font-bold outline-none focus:border-black"
      />
    </label>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
