import { getPrototypeForRoute } from "@/lib/prototype-registry";
import { ModelViewerClient } from "./ModelViewerClient";

interface ArPageProps {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

export default async function ArPage({ params }: ArPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const prototype = getPrototypeForRoute(id);

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#0F172A] text-white">
      <ModelViewerClient prototype={prototype} />
    </main>
  );
}
