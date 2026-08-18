import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveWorkflowRoute } from "@/components/agent/LiveWorkflowRoute";
import { isFitWorkflowId } from "@/lib/fit-route-contract";

export const metadata: Metadata = {
  title: "Fit results · Fitment",
};

interface ResultsPageProps {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function FitResultsPage({ params }: ResultsPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  if (!isFitWorkflowId(id)) notFound();
  return <LiveWorkflowRoute workflowId={id} surface="results" />;
}
