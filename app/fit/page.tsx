import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FitDemoClient } from "@/components/fit/FitDemoClient";
import { loadFurnitureCatalog } from "@/lib/catalog-source";
import { DEMO_SPACE_MEASUREMENT } from "@/lib/fit-config";
import {
  resolveFitEntry,
  type FitCompatibilitySearchParams,
} from "@/lib/fit-route-contract";

export const metadata: Metadata = {
  title: "Find furniture that fits",
  description: "Compare source-backed furniture against your measured space and access opening.",
};

interface FitPageProps {
  readonly searchParams: Promise<FitCompatibilitySearchParams>;
}

export default async function FitPage({ searchParams }: FitPageProps): Promise<React.JSX.Element> {
  const entry = resolveFitEntry(await searchParams);
  if (entry.kind === "redirect") redirect(entry.href);
  const catalog = await loadFurnitureCatalog();

  return (
    <FitDemoClient
      demoMeasurement={DEMO_SPACE_MEASUREMENT}
      products={catalog.products}
      catalogSource={catalog.source}
      retailerCount={catalog.retailerCount}
    />
  );
}
