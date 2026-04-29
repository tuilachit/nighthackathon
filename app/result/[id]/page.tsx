import Link from "next/link";
import { ResultClient } from "@/components/result/ResultClient";
import { getSeededPrototype } from "@/lib/prototype-registry";

interface ResultPageProps {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

export default async function ResultPage({ params }: ResultPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const prototype = getSeededPrototype(id);

  if (prototype === undefined) {
    return (
      <main className="min-h-screen bg-[#F8FAFC] px-4 py-6 text-[#0F172A]">
        <section className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-[#F59E0B]">Prototype not found</p>
          <h1 className="mt-2 text-2xl font-semibold">This seeded route is not available.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Cross-device demo routes use the static registry. Generate the default smart hydration bottle or open the
            create screen again.
          </p>
          <Link href="/" className="mt-5 inline-flex rounded-lg bg-[#2563EB] px-4 py-3 text-sm font-semibold text-white">
            Back to create
          </Link>
        </section>
      </main>
    );
  }

  return <ResultClient prototype={prototype} />;
}
