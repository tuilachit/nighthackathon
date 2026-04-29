import Link from "next/link";
import { GenerationTrace } from "@/components/build-pack/GenerationTrace";
import { BuildPackViewer } from "@/components/build-pack/BuildPackViewer";
import { generateBuildPack } from "@/lib/build-pack";
import { getSeededPrototype } from "@/lib/prototype-registry";

interface BuildPackPageProps {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

export default async function BuildPackPage({ params }: BuildPackPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const prototype = getSeededPrototype(id);

  if (prototype === undefined) {
    return (
      <main className="concept-page px-4 py-6">
        <section className="concept-shell mx-auto max-w-xl p-5">
          <p className="text-sm font-semibold text-[#F59E0B]">Build Pack missing</p>
          <h1 className="mt-2 text-2xl font-semibold">No generated artifacts exist for this URL.</h1>
          <Link href="/" className="concept-primary-button mt-5 inline-flex items-center px-6 py-3 text-sm font-bold">
            Back to create
          </Link>
        </section>
      </main>
    );
  }

  const buildPack = generateBuildPack(prototype);

  return (
    <main className="concept-page px-4 py-5 safe-bottom">
      <section className="concept-shell mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 sm:p-4 md:p-6">
        <div className="flex flex-col gap-4 rounded-[28px] bg-white p-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Codex Build Pack</p>
              <h1 className="mt-1 text-[32px] font-black leading-[0.98] tracking-normal text-slate-950 sm:text-[38px]">{prototype.name}</h1>
            </div>
            <Link
              href={`/result/${prototype.id}`}
              className="concept-pill inline-flex items-center px-5 py-3 text-sm font-bold"
            >
              Back to result
            </Link>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Reality MVP uses Codex to generate the runnable spatial prototype app layer around a product concept:
            AR page, product config, AGENTS.md, MVP spec, validation plan, and README submission content.
          </p>
        </div>

        <GenerationTrace prototype={prototype} />

        <BuildPackViewer buildPack={buildPack} />
      </section>
    </main>
  );
}
