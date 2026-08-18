import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { notFound } from "next/navigation";
import FitCandidateReviewPage from "./(live)/jobs/[id]/candidates/[candidateId]/review/page";
import FitComparePage from "./(live)/jobs/[id]/compare/page";
import FitWorkflowPage from "./(live)/jobs/[id]/page";
import FitResultsPage from "./(live)/jobs/[id]/results/page";
import FitSearchPage from "./(live)/search/page";
import FitSpacePage from "./space/page";
import FitSpaceReviewPage from "./space/review/page";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/components/agent/LiveWorkflowRoute", () => ({
  LiveWorkflowRoute: ({
    workflowId,
    surface = "workflow",
    candidateId,
  }: {
    readonly workflowId?: string;
    readonly surface?: string;
    readonly candidateId?: string;
  }) => (
    <div
      data-testid="live-route"
      data-workflow-id={workflowId}
      data-surface={surface}
      data-candidate-id={candidateId}
    />
  ),
}));

const WORKFLOW_ID = "00000000-0000-4000-8000-000000000001";
const CANDIDATE_ID = "00000000-0000-4000-8000-000000000002";

describe("split fit journey routes", () => {
  it("keeps initial measurement routes server-only", () => {
    render(<FitSpacePage />);
    expect(screen.getByRole("heading", { name: "Measure your space" })).toBeInTheDocument();

    render(<FitSpaceReviewPage />);
    expect(screen.getByRole("heading", { name: "Review your measurements" })).toBeInTheDocument();
  });

  it("wires search and each owner workflow surface", async () => {
    const params = Promise.resolve({ id: WORKFLOW_ID });
    const views = [
      <FitSearchPage key="search" />,
      await FitWorkflowPage({ params }),
      await FitResultsPage({ params }),
      await FitComparePage({ params }),
      await FitCandidateReviewPage({
        params: Promise.resolve({ id: WORKFLOW_ID, candidateId: CANDIDATE_ID }),
      }),
    ];

    const { rerender } = render(views[0]);
    expect(screen.getByTestId("live-route")).toHaveAttribute("data-surface", "workflow");
    rerender(views[1]);
    expect(screen.getByTestId("live-route")).toHaveAttribute("data-workflow-id", WORKFLOW_ID);
    rerender(views[2]);
    expect(screen.getByTestId("live-route")).toHaveAttribute("data-surface", "results");
    rerender(views[3]);
    expect(screen.getByTestId("live-route")).toHaveAttribute("data-surface", "compare");
    rerender(views[4]);
    expect(screen.getByTestId("live-route")).toHaveAttribute("data-candidate-id", CANDIDATE_ID);
  });

  it("fails closed for malformed workflow routes", async () => {
    await expect(FitWorkflowPage({
      params: Promise.resolve({ id: "../../admin" }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
