"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createPrototypeSpec } from "@/lib/analyzer";
import { DEFAULT_PROMPT, DEFAULT_PROTOTYPE_ID } from "@/lib/prototype-registry";
import { saveLocalPrototype } from "@/lib/local-prototype-store";
import { validateImageUpload } from "@/lib/upload-validation";

const examples = [
  "A smart water bottle for gym users that glows when hydration is low.",
  "A desk lamp that shifts color temperature with your focus state.",
  "A pocket-sized health tracker with an e-ink display and tactile dial.",
];

export function RealityCreateClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(file: File | undefined) {
    if (!file) return;
    const validation = validateImageUpload(file);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  function generate() {
    setError(null);
    startTransition(() => {
      const spec = createPrototypeSpec(prompt);
      saveLocalPrototype(spec);
      router.push(`/result/${DEFAULT_PROTOTYPE_ID}`);
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-6">
      <header className="mb-8 pt-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">R</div>
            <div>
              <p className="text-sm font-semibold">Reality MVP</p>
              <p className="text-xs text-slate-500">Vercel PWA demo</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">fallback ready</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Capture a product idea.</h1>
        <p className="mt-3 text-base leading-6 text-slate-600">
          Use the phone camera, describe the product, and open a spatial prototype in AR.
        </p>
      </header>

      <section className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">1. Sketch</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex min-h-44 w-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-left shadow-sm"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Uploaded sketch preview" className="h-40 w-full rounded-xl object-cover" />
            ) : (
              <div className="text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">CAM</div>
                <p className="font-semibold text-slate-950">Capture or upload a sketch</p>
                <p className="mt-1 text-sm text-slate-500">Phone camera, JPG, or PNG</p>
              </div>
            )}
          </button>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">2. Describe it</p>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-base leading-6 shadow-sm outline-none focus:border-blue-500"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
              >
                {example.split(" ").slice(1, 4).join(" ")}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p> : null}

        <button
          type="button"
          disabled={pending || !prompt.trim()}
          onClick={generate}
          className="mt-2 h-14 rounded-2xl bg-blue-600 text-base font-bold text-white shadow-lg shadow-blue-600/20 disabled:bg-slate-300 disabled:shadow-none"
        >
          {pending ? "Generating..." : "Generate Reality MVP"}
        </button>
      </section>
    </main>
  );
}
