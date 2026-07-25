import type { Metadata } from "next";
import { FitDemoClient } from "@/components/fit/FitDemoClient";
import { FURNITURE_CATALOG } from "@/lib/catalog";
import { DEMO_SPACE_MEASUREMENT } from "@/lib/fit-config";

export const metadata: Metadata = {
  title: "Fit-first furniture search",
  description: "Find verified furniture that fits your measured space and access opening.",
};

export default function FitPage(): React.JSX.Element {
  return (
    <FitDemoClient
      measurement={DEMO_SPACE_MEASUREMENT}
      products={FURNITURE_CATALOG}
    />
  );
}
