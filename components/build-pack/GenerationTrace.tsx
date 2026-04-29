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
    { title: "Select fallback model", detail: `${prototype.model.glbPath} is ready before optional custom generation.` },
    { title: "Generate AR route", detail: `/ar/${prototype.id} renders the model through model-viewer.` },
    {
      title: "Write Build Pack files",
      detail: "Codex outputs route code, product config, AGENTS.md, MVP spec, validation plan, and README content.",
    },
    { title: "Validate demo path", detail: "Result, AR, fallback model, and Build Pack routes are ready for phone preflight." },
  ];

  return (
    <section className="rounded-lg border border-slate-800 bg-[#0B1220] p-4 shadow-sm">
      <div className="mono mb-1 text-[9px] uppercase tracking-[0.14em] text-blue-300">codex-generated layer</div>
      <h2 className="text-lg font-semibold text-slate-50">Codex generation trace</h2>
      <div className="mt-3 grid gap-2">
        {steps.map((step, index) => (
          <div key={step.title} className="flex gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#2563EB] text-xs font-semibold text-white">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-100">{step.title}</p>
              <p className="mt-1 text-sm leading-5 text-slate-400">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
