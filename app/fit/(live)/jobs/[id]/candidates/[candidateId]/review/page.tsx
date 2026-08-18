import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveWorkflowRoute } from "@/components/agent/LiveWorkflowRoute";
import { isFitWorkflowId } from "@/lib/fit-route-contract";

export const metadata: Metadata = {
  title: "Review 3D generation · Fitment",
};

interface CandidateReviewPageProps {
  readonly params: Promise<{
    readonly id: string;
    readonly candidateId: string;
  }>;
}

export default async function FitCandidateReviewPage({
  params,
}: CandidateReviewPageProps): Promise<React.JSX.Element> {
  const { id, candidateId } = await params;
  if (!isFitWorkflowId(id) || !isFitWorkflowId(candidateId)) notFound();
  return (
    <LiveWorkflowRoute
      workflowId={id}
      surface="candidate-review"
      candidateId={candidateId}
    />
  );
}
