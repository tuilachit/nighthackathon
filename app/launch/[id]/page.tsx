import { LaunchPageClient } from "@/components/launch/LaunchPageClient";
import { getPrototypeForRoute } from "@/lib/prototype-registry";

interface LaunchPageProps {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

export default async function LaunchPage({ params }: LaunchPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const prototype = getPrototypeForRoute(id);

  return <LaunchPageClient prototype={prototype} />;
}
