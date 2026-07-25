import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManualMeasurementForm } from "./ManualMeasurementForm";

describe("ManualMeasurementForm", () => {
  it("submits the default dimensions as a manual space measurement", () => {
    const onMeasured = vi.fn();
    render(<ManualMeasurementForm onMeasured={onMeasured} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onMeasured).toHaveBeenCalledWith({
      widthMm: 800,
      depthMm: 400,
      heightMm: 900,
      uncertaintyMm: 5,
      source: "manual",
    });
  });

  it("lets the user correct a dimension before continuing", () => {
    const onMeasured = vi.fn();
    render(<ManualMeasurementForm onMeasured={onMeasured} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Width in millimetres"), { target: { value: "812" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onMeasured).toHaveBeenCalledWith(expect.objectContaining({ widthMm: 812 }));
  });

  it("converts the display to inches without changing the stored millimetres", () => {
    const onMeasured = vi.fn();
    render(<ManualMeasurementForm onMeasured={onMeasured} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "in" }));
    expect(screen.getByLabelText("Width in inches")).toHaveValue(31.5);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onMeasured).toHaveBeenCalledWith(expect.objectContaining({ widthMm: 800 }));
  });

  it("disables continue and blocks submission when a dimension is cleared to zero", () => {
    const onMeasured = vi.fn();
    render(<ManualMeasurementForm onMeasured={onMeasured} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Height in millimetres"), { target: { value: "0" } });

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onMeasured).not.toHaveBeenCalled();
  });

  it("calls onCancel from the back button", () => {
    const onCancel = vi.fn();
    render(<ManualMeasurementForm onMeasured={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
