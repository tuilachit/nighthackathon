import { ModelViewerClient } from "@/components/ar/ModelViewerClient";
import { getPrototypeForRoute } from "@/lib/prototype-registry";
import { DotIcon } from "@/components/ui/Icon";

interface ArPageProps {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

export default async function ArPage({ params }: ArPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const prototype = getPrototypeForRoute(id);

  return (
    <main className="min-h-screen overflow-hidden bg-[#0F172A] px-4 py-5 text-white">
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <div className="rounded-lg border border-white/10 bg-white/10 p-4 shadow-sm backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="mono text-[9px] uppercase tracking-[0.14em] text-white/50">webxr · scene-viewer · quick-look</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal text-white">{prototype.name}</h1>
              <p className="mt-2 text-sm leading-6 text-white/70">{prototype.intendedUse}</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-400/15 px-3 py-1.5 text-[10px] font-semibold text-emerald-200">
              <DotIcon size={6} color="#10B981" />
              AR READY
            </div>
          </div>
        </div>

        <ModelViewerClient prototype={prototype} mode="ar" />

        <div className="grid gap-2">
          {prototype.features.slice(0, 3).map((feature) => (
            <div key={feature.label} className="rounded-lg border border-white/10 bg-white/10 p-3 shadow-sm backdrop-blur">
              <p className="text-sm font-semibold text-white">{feature.label}</p>
              <p className="mt-1 text-sm leading-5 text-white/65">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
