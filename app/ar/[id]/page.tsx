import Link from "next/link";
import { ModelViewerClient } from "@/components/ar/ModelViewerClient";
import { getSeededPrototype } from "@/lib/prototype-registry";
import { CodeIcon, DotIcon } from "@/components/ui/Icon";

interface ArPageProps {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

export default async function ArPage({ params }: ArPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const prototype = getSeededPrototype(id);

  if (prototype === undefined) {
    return (
      <main className="concept-page px-4 py-6">
        <section className="concept-shell mx-auto max-w-xl p-5">
          <p className="text-sm font-semibold text-[#F59E0B]">AR route missing</p>
          <h1 className="mt-2 text-2xl font-semibold">No seeded prototype exists for this URL.</h1>
          <Link href="/" className="concept-primary-button mt-5 inline-flex items-center px-6 py-3 text-sm font-bold">
            Back to create
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="concept-page px-4 py-5 safe-bottom">
      <section className="concept-shell mx-auto flex w-full max-w-[430px] flex-col gap-4 p-3 sm:p-4 md:max-w-2xl">
        <div className="flex items-center justify-between">
          <Link href={`/result/${prototype.id}`} className="concept-circle-button flex h-11 w-11 items-center justify-center text-xl font-bold">
            ‹
          </Link>
          <div className="flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-2 text-[10px] font-bold text-slate-900">
            <DotIcon size={6} color="#10B981" />
            AR READY
          </div>
          <Link
            href={`/build-pack/${prototype.id}`}
            className="concept-circle-button flex h-11 w-11 items-center justify-center"
            aria-label="Open Build Pack"
          >
            <CodeIcon size={18} color="#050505" />
          </Link>
        </div>

        <div className="px-1">
          <p className="mono text-[9px] uppercase tracking-[0.14em] text-slate-400">webxr · scene-viewer · quick-look</p>
          <h1 className="mt-2 text-[32px] font-black leading-[0.98] tracking-normal text-slate-950 sm:text-[36px]">{prototype.name}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{prototype.intendedUse}</p>
        </div>

        <ModelViewerClient prototype={prototype} mode="ar" />

        <div className="grid gap-1 rounded-[28px] bg-white">
          {prototype.features.slice(0, 3).map((feature) => (
            <div key={feature.label} className="flex items-start gap-3 border-b border-black/5 px-2 py-3 last:border-b-0">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10">
                <span className="h-2.5 w-2.5 rounded-full bg-black" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-950">{feature.label}</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
