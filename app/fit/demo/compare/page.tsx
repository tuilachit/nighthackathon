import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadFurnitureCatalog } from "@/lib/catalog-source";
import { searchProducts } from "@/lib/product-ranker";
import { parseFurnitureQuery } from "@/lib/query-parser";
import { adaptProductSearchResultsToDecisionCandidates } from "@/components/fit/journey/demo-adapter";
import { DemoComparisonRoute } from "../_components/DemoComparisonRoute";
import {
  buildDemoResultsHref,
  parseDemoResultsRouteState,
  type DemoRouteSearchParams,
} from "../demo-route-state";

export const metadata: Metadata = {
  title: "Demo comparison · Fitment",
  description: "Compare two bundled-catalog products against one disclosed demo space.",
};

interface DemoComparisonPageProps {
  readonly searchParams: Promise<DemoRouteSearchParams>;
}

export default async function DemoComparisonPage({
  searchParams,
}: DemoComparisonPageProps): Promise<React.JSX.Element> {
  const [catalog, routeState] = await Promise.all([
    loadFurnitureCatalog(),
    searchParams.then(parseDemoResultsRouteState),
  ]);
  const resultsHref = buildDemoResultsHref(routeState);
  const [firstId, secondId] = routeState.comparedProductIds;
  if (firstId === undefined || secondId === undefined) {
    redirect(resultsHref);
  }

  const candidates = adaptProductSearchResultsToDecisionCandidates(
    searchProducts(
      catalog.products,
      routeState.measurement,
      parseFurnitureQuery(routeState.queryText),
    ),
  );
  const first = candidates.find((candidate) => candidate.key === firstId);
  const second = candidates.find((candidate) => candidate.key === secondId);
  if (first === undefined || second === undefined) {
    redirect(resultsHref);
  }

  return (
    <DemoComparisonRoute
      measurement={routeState.measurement}
      candidates={[first, second]}
      resultsHref={resultsHref}
    />
  );
}
