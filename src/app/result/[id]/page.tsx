import { notFound } from "next/navigation";
import { ResultClient } from "@/components/result/ResultClient";
import { getSeededPrototype } from "@/lib/prototype-registry";

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prototype = getSeededPrototype(id);
  if (!prototype) notFound();
  return <ResultClient seeded={prototype} />;
}
