import { ResultClient } from "@/components/result/ResultClient";
import { getPrototypeForRoute } from "@/lib/prototype-registry";

interface ResultPageProps {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

export default async function ResultPage({ params }: ResultPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const prototype = getPrototypeForRoute(id);
  return <ResultClient prototype={prototype} />;
}
