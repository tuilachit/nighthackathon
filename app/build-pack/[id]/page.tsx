import Link from "next/link";
import { GenerationTrace } from "@/components/build-pack/GenerationTrace";
import { BuildPackViewer } from "@/components/build-pack/BuildPackViewer";
import { generateBuildPack } from "@/lib/build-pack";
import { getPrototypeForRoute } from "@/lib/prototype-registry";

interface BuildPackPageProps {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

export default async function BuildPackPage({ params }: BuildPackPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const prototype = getPrototypeForRoute(id);

  const buildPack = generateBuildPack(prototype);

  return (
    <main className="min-h-screen bg-[#0F172A] px-4 py-5 text-slate-100">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="rounded-lg border border-slate-800 bg-[#0B1220] p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-blue-300">Codex Build Pack</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal text-white">{prototype.name}</h1>
            </div>
            <Link
              href={`/result/${prototype.id}`}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200"
            >
              Back to result
            </Link>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
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
