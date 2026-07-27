import type { Metadata } from "next";
import { FitDemoClient } from "@/components/fit/FitDemoClient";
import { loadFurnitureCatalog } from "@/lib/catalog-source";
import { DEMO_SPACE_MEASUREMENT } from "@/lib/fit-config";

export const metadata: Metadata = {
  title: "Fit-first furniture search",
  description: "Find verified furniture that fits your measured space and access opening.",
};

export const dynamic = "force-dynamic";

export default async function FitPage(): Promise<React.JSX.Element> {
  const catalog = await loadFurnitureCatalog();

  return (
    <FitDemoClient
      measurement={DEMO_SPACE_MEASUREMENT}
      products={catalog.products}
      catalogSource={catalog.source}
      retailerCount={catalog.retailerCount}
    />
  );
}
