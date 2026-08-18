import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPendingMeasurementReviewDraft,
  persistPendingMeasurementReviewDraft,
  readPendingMeasurementReviewDraft,
} from "@/lib/pending-measurement-review";
import { SpaceMeasurementReview } from "./SpaceMeasurementReview";

const MEASUREMENT = {
  widthMm: 900,
  heightMm: 1800,
  depthMm: 350,
  uncertaintyMm: 25,
  source: "manual" as const,
};

describe("SpaceMeasurementReview", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("shows canonical values and keeps an unknown doorway explicitly unchecked", () => {
    render(
      <SpaceMeasurementReview
        measurement={MEASUREMENT}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Check measurements", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Correct anything before saving this space."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Width")).toHaveValue(900);
    expect(screen.getByLabelText("Height")).toHaveValue(1800);
    expect(screen.getByLabelText("Depth")).toHaveValue(350);
    expect(
      screen.getByRole("img", { name: /schematic measured envelope/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Doorway not checked")).toBeInTheDocument();
    expect(screen.queryByLabelText("Doorway")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Width")).toHaveAttribute(
      "inputmode",
      "numeric",
    );
  });

  it("adds a doorway, accepts corrections, confirms with the edit identity and clears the handoff", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    persistPendingMeasurementReviewDraft(
      window.sessionStorage,
      createPendingMeasurementReviewDraft(MEASUREMENT, "cm", "space-7"),
    );
    render(
      <SpaceMeasurementReview
        measurement={MEASUREMENT}
        editingSpaceId="space-7"
        onConfirm={onConfirm}
        onBack={vi.fn()}
      />,
    );

    const width = screen.getByLabelText("Width");
    await user.clear(width);
    await user.type(width, "920");
    await user.click(screen.getByRole("button", { name: "Add doorway" }));
    const doorway = screen.getByLabelText("Doorway");
    expect(doorway).toHaveFocus();
    expect(doorway).toHaveAttribute("inputmode", "numeric");
    await user.type(doorway, "820");
    await user.click(screen.getByRole("button", { name: "Use this space" }));

    expect(onConfirm).toHaveBeenCalledWith(
      {
        widthMm: 920,
        heightMm: 1800,
        depthMm: 350,
        accessWidthMm: 820,
        uncertaintyMm: 25,
        source: "manual",
      },
      "space-7",
    );
    expect(readPendingMeasurementReviewDraft(window.sessionStorage)).toBeUndefined();
  });

  it("renders an existing doorway and lets the user remove it", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <SpaceMeasurementReview
        measurement={{ ...MEASUREMENT, accessWidthMm: 820 }}
        onConfirm={onConfirm}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Doorway")).toHaveValue(820);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText("Doorway not checked")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use this space" }));

    expect(onConfirm).toHaveBeenCalledWith(MEASUREMENT, undefined);
  });

  it("persists valid corrections when a field loses focus", async () => {
    const user = userEvent.setup();
    render(
      <SpaceMeasurementReview
        measurement={MEASUREMENT}
        editingSpaceId="space-9"
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const depth = screen.getByLabelText("Depth");
    await user.clear(depth);
    await user.type(depth, "375");
    await user.tab();

    expect(readPendingMeasurementReviewDraft(window.sessionStorage)).toEqual({
      version: 1,
      measurement: { ...MEASUREMENT, depthMm: 375 },
      selectedUnit: "mm",
      editingSpaceId: "space-9",
    });
  });

  it("rejects implausible corrections and keeps the user on review", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <SpaceMeasurementReview
        measurement={MEASUREMENT}
        onConfirm={onConfirm}
        onBack={vi.fn()}
      />,
    );

    const depth = screen.getByLabelText("Depth");
    await user.clear(depth);
    await user.type(depth, "99");
    await user.click(screen.getByRole("button", { name: "Use this space" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Depth must be between 100 and 10,000 mm.",
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("returns to input without confirming", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <SpaceMeasurementReview
        measurement={MEASUREMENT}
        onConfirm={vi.fn()}
        onBack={onBack}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalledOnce();
  });
});
