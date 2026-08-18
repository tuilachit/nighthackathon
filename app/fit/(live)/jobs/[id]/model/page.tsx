import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveWorkflowRoute } from "@/components/agent/LiveWorkflowRoute";
import { isFitWorkflowId } from "@/lib/fit-route-contract";

export const metadata: Metadata = {
  title: "3D placement · Fitment",
};

interface ModelPageProps {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function FitModelPage({
  params,
}: ModelPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  if (!isFitWorkflowId(id)) notFound();
  return <LiveWorkflowRoute workflowId={id} surface="model" />;
}
