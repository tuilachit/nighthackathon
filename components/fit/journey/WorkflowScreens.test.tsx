import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GenerationReviewScreen } from "./GenerationReviewScreen";
import { WorkflowWaitingScreen } from "./WorkflowWaitingScreen";
import { candidateFixture } from "./test-support";

describe("route-level workflow screens", () => {
  it("shows only the current real retailer-search stage", () => {
    render(
      <WorkflowWaitingScreen
        state="searching"
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Checking retailers", level: 1 }),
    ).toBeVisible();
    expect(screen.getByText("Retailer search")).toBeVisible();
    expect(screen.queryByText("Validating dimensions")).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("offers cancellation as a quiet secondary action", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <WorkflowWaitingScreen
        state="validating"
        onCancel={onCancel}
        onRetry={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel search" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("approves only a clean fit from its dedicated review screen", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const candidate = candidateFixture();
    render(
      <GenerationReviewScreen
        candidate={candidate}
        onApprove={onApprove}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Approve and generate 3D" }),
    );
    expect(onApprove).toHaveBeenCalledWith(candidate);
    expect(screen.getByText(/not an exact replica/i)).toBeVisible();
  });

  it("keeps generation disabled for a doorway failure", () => {
    render(
      <GenerationReviewScreen
        candidate={candidateFixture({ fitStatus: "access_issue" })}
        onApprove={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Approve and generate 3D" }),
    ).toBeDisabled();
  });
});
