import { notFound } from "next/navigation";
import { ModelViewerClient } from "@/components/ar/ModelViewerClient";
import { getSeededPrototype } from "@/lib/prototype-registry";

export default async function ArPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prototype = getSeededPrototype(id);
  if (!prototype) notFound();
  return <ModelViewerClient spec={prototype} />;
}
