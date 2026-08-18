import type { Metadata } from "next";
import { loadFurnitureCatalog } from "@/lib/catalog-source";
import { DemoResultsRoute } from "../_components/DemoResultsRoute";
import {
  parseDemoResultsRouteState,
  type DemoRouteSearchParams,
} from "../demo-route-state";

export const metadata: Metadata = {
  title: "Demo fit results · Fitment",
  description: "Compare the bundled catalog against Fitment's disclosed demo space.",
};

interface DemoResultsPageProps {
  readonly searchParams: Promise<DemoRouteSearchParams>;
}

export default async function DemoResultsPage({
  searchParams,
}: DemoResultsPageProps): Promise<React.JSX.Element> {
  const [catalog, routeState] = await Promise.all([
    loadFurnitureCatalog(),
    searchParams.then(parseDemoResultsRouteState),
  ]);
  return (
    <DemoResultsRoute
      products={catalog.products}
      state={routeState}
    />
  );
}
