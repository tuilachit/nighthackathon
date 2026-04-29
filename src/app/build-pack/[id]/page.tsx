import Link from "next/link";
import { notFound } from "next/navigation";
import { BuildPackViewer } from "@/components/build-pack/BuildPackViewer";
import { generateBuildPack } from "@/lib/build-pack";
import { getSeededPrototype } from "@/lib/prototype-registry";

export default async function BuildPackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prototype = getSeededPrototype(id);
  if (!prototype) notFound();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-5 py-8">
      <Link href={`/result/${prototype.id}`} className="text-sm font-semibold text-slate-500">Back to result</Link>
      <h1 className="mt-5 text-4xl font-bold tracking-tight">Codex Build Pack</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
        This proves the product is more than a 3D model: Codex generates the runnable AR app layer around the product concept.
      </p>
      <div className="mt-8">
        <BuildPackViewer artifacts={generateBuildPack(prototype)} />
      </div>
    </main>
  );
}
