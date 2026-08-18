import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PENDING_MEASUREMENT_REVIEW_KEY,
  readPendingMeasurementReviewDraft,
} from "@/lib/pending-measurement-review";
import { SpaceMeasurementInput } from "./SpaceMeasurementInput";

describe("SpaceMeasurementInput", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("presents the compact one-line entry with an accessible unit choice", () => {
    render(<SpaceMeasurementInput backHref="/fit" onParsed={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Enter your space" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Paste the measurements in one line."),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "90 cm wide, 180 high, 35 deep, doorway 82",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Default unit")).toHaveValue("cm");
    expect(screen.getByRole("link", { name: "Space" })).toHaveAttribute(
      "href",
      "/fit",
    );
    expect(
      screen.getByRole("button", { name: "Check measurements" }),
    ).toHaveClass("min-h-12");
  });

  it("normalizes a complete sentence, persists the review handoff and preserves edit identity", async () => {
    const user = userEvent.setup();
    const onParsed = vi.fn();
    render(
      <SpaceMeasurementInput
        editingSpaceId="space-7"
        onParsed={onParsed}
      />,
    );

    await user.type(
      screen.getByLabelText("Space and doorway measurements"),
      "90 cm wide, 180 high, 35 deep, doorway 82",
    );
    await user.click(
      screen.getByRole("button", { name: "Check measurements" }),
    );

    const measurement = {
      widthMm: 900,
      heightMm: 1800,
      depthMm: 350,
      accessWidthMm: 820,
      uncertaintyMm: 25,
      source: "manual" as const,
    };
    expect(onParsed).toHaveBeenCalledWith(measurement, "space-7");
    expect(readPendingMeasurementReviewDraft(window.sessionStorage)).toEqual({
      version: 1,
      measurement,
      selectedUnit: "cm",
      editingSpaceId: "space-7",
    });
  });

  it("reports missing required measurements without advancing", async () => {
    const user = userEvent.setup();
    const onParsed = vi.fn();
    render(<SpaceMeasurementInput onParsed={onParsed} />);

    await user.type(
      screen.getByLabelText("Space and doorway measurements"),
      "width 90 cm",
    );
    await user.click(
      screen.getByRole("button", { name: "Check measurements" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add height and depth before continuing.",
    );
    expect(onParsed).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PENDING_MEASUREMENT_REVIEW_KEY)).toBeNull();
  });

  it("surfaces deterministic parser errors without advancing", async () => {
    const user = userEvent.setup();
    const onParsed = vi.fn();
    render(<SpaceMeasurementInput onParsed={onParsed} />);

    await user.type(
      screen.getByLabelText("Space and doorway measurements"),
      "width 90cm, width 91cm, height 180cm, depth 35cm",
    );
    await user.click(
      screen.getByRole("button", { name: "Check measurements" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Conflicting Width values were provided.",
    );
    expect(onParsed).not.toHaveBeenCalled();
  });

  it("prefills an existing space in the selected centimetre format", () => {
    render(
      <SpaceMeasurementInput
        initialMeasurement={{
          widthMm: 905,
          heightMm: 1810,
          depthMm: 355,
          accessWidthMm: 825,
          uncertaintyMm: 25,
          source: "manual",
        }}
        onParsed={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText("Space and doorway measurements"),
    ).toHaveValue("width 90.5, height 181, depth 35.5, doorway 82.5 cm");
  });
});
