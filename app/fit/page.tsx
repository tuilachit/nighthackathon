import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SpaceHomeScreen } from "@/components/fit/journey/SpaceHomeScreen";
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
  const params = await searchParams;
  const entry = resolveFitEntry(params);
  if (entry.kind === "redirect") redirect(entry.href);
  const mode = firstSearchParam(params.mode);
  return <SpaceHomeScreen initialMode={mode === "link" ? "link" : "describe"} />;
}

function firstSearchParam(
  value: string | readonly string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}
