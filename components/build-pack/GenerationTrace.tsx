import type { PrototypeSpec } from "@/lib/prototype-types";

interface GenerationTraceProps {
  readonly prototype: PrototypeSpec;
}

interface TraceStep {
  readonly title: string;
  readonly detail: string;
}

export function GenerationTrace({ prototype }: GenerationTraceProps): React.JSX.Element {
  const steps: readonly TraceStep[] = [
    { title: "Analyze product concept", detail: `${prototype.category} concept extracted from prompt and sketch input.` },
    {
      title: prototype.model.remoteModelUrl !== undefined ? "Link generated model" : "Prepare model slot",
      detail: prototype.model.remoteModelUrl ?? "The generated GLB will populate this prototype as soon as it is ready.",
    },
    { title: "Generate AR route", detail: `/ar/${prototype.id} renders the model through model-viewer.` },
    { title: "Generate launch route", detail: `/launch/${prototype.id} renders the public waitlist page for the prototype.` },
    {
      title: "Write Build Pack files",
      detail: "Codex outputs route code, waitlist API, product config, AGENTS.md, MVP spec, validation plan, and README content.",
    },
    { title: "Validate demo path", detail: "Result, AR, launch, and Build Pack routes are ready for preflight." },
  ];

  return (
    <section className="concept-panel p-4">
      <div className="mono mb-1 text-[9px] uppercase tracking-[0.14em] text-slate-400">codex-generated layer</div>
      <h2 className="text-lg font-bold text-slate-950">Codex generation trace</h2>
      <div className="mt-3 grid gap-2">
        {steps.map((step, index) => (
          <div key={step.title} className="flex gap-3 border-b border-black/5 pb-3 last:border-b-0 last:pb-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-xs font-bold text-white">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-bold text-slate-950">{step.title}</p>
              <p className="mt-1 text-sm leading-5 text-slate-500">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
