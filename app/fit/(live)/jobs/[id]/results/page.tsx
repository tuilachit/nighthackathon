import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveWorkflowRoute } from "@/components/agent/LiveWorkflowRoute";
import { isFitWorkflowId } from "@/lib/fit-route-contract";
import type { CandidateFitStatus } from "@/lib/live-search/types";

export const metadata: Metadata = {
  title: "Fit results · Fitment",
};

interface ResultsPageProps {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<{
    readonly tier?: string | readonly string[];
    readonly page?: string | readonly string[];
  }>;
}

export default async function FitResultsPage({ params, searchParams }: ResultsPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  if (!isFitWorkflowId(id)) notFound();
  const query = await searchParams;
  return (
    <LiveWorkflowRoute
      workflowId={id}
      surface="results"
      initialTier={parseTier(first(query.tier))}
      initialPageIndex={parsePage(first(query.page))}
    />
  );
}

function parseTier(value: string | undefined): CandidateFitStatus {
  return value === "access_issue" || value === "near_miss" ? value : "fits";
}

function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 100 ? page - 1 : 0;
}

function first(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}
