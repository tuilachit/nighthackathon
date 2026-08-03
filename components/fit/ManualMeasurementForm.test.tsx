import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEMO_SPACE_MEASUREMENT } from "@/lib/fit-config";
import { ManualMeasurementForm } from "./ManualMeasurementForm";

describe("ManualMeasurementForm", () => {
  it("collects measurements in order and submits millimetres with conservative uncertainty", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ManualMeasurementForm
        demoMeasurement={DEMO_SPACE_MEASUREMENT}
        onConfirm={onConfirm}
      />,
    );

    await enterCurrentMeasurement(user, "812");
    expect(screen.getByText(/Step 2 of 4 · Height/)).toBeInTheDocument();
    await enterCurrentMeasurement(user, "1600");
    expect(screen.getByText(/Step 3 of 4 · Depth/)).toBeInTheDocument();
    await enterCurrentMeasurement(user, "305");
    expect(
      screen.getByText(/Step 4 of 4 · Narrowest access opening/),
    ).toBeInTheDocument();

    await user.type(screen.getByRole("spinbutton"), "760");
    await user.click(
      screen.getByRole("button", { name: "Find furniture that fits" }),
    );

    expect(onConfirm).toHaveBeenCalledWith(
      {
        widthMm: 812,
        heightMm: 1600,
        depthMm: 305,
        uncertaintyMm: 25,
        accessWidthMm: 760,
        source: "manual",
      },
      "My space",
    );
  });

  it("accepts centimetres and normalizes every value to millimetres", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ManualMeasurementForm
        demoMeasurement={DEMO_SPACE_MEASUREMENT}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "cm" }));
    expect(screen.getByRole("button", { name: "cm" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await enterCurrentMeasurement(user, "81.2");
    await enterCurrentMeasurement(user, "160");
    await enterCurrentMeasurement(user, "30.5");
    await user.type(screen.getByRole("spinbutton"), "76");
    await user.click(
      screen.getByRole("button", { name: "Find furniture that fits" }),
    );

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        widthMm: 812,
        heightMm: 1600,
        depthMm: 305,
        accessWidthMm: 760,
      }),
      "My space",
    );
  });

  it("keeps the current measurement stable when switching units", async () => {
    const user = userEvent.setup();
    render(
      <ManualMeasurementForm
        demoMeasurement={DEMO_SPACE_MEASUREMENT}
        onConfirm={vi.fn()}
      />,
    );

    await user.type(screen.getByRole("spinbutton"), "812");
    await user.click(screen.getByRole("button", { name: "cm" }));
    expect(screen.getByRole("spinbutton")).toHaveValue(81.2);
    await user.click(screen.getByRole("button", { name: "mm" }));
    expect(screen.getByRole("spinbutton")).toHaveValue(812);
  });

  it("rejects missing, too-small and implausibly large values with plain-language guidance", async () => {
    const user = userEvent.setup();
    render(
      <ManualMeasurementForm
        demoMeasurement={DEMO_SPACE_MEASUREMENT}
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter the width before continuing.",
    );

    const input = screen.getByRole("spinbutton");
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Width must be at least 100 mm (10 cm).",
    );

    await user.clear(input);
    await user.type(input, "10001");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Width must be no more than 10,000 mm (1,000 cm).",
    );
  });

  it("allows corrections by moving back through completed steps", async () => {
    const user = userEvent.setup();
    render(
      <ManualMeasurementForm
        demoMeasurement={DEMO_SPACE_MEASUREMENT}
        onConfirm={vi.fn()}
      />,
    );

    await enterCurrentMeasurement(user, "812");
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByText(/Step 1 of 4 · Width/)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(812);
  });

  it("loads the fixture only through an explicit demo-space action", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ManualMeasurementForm
        demoMeasurement={DEMO_SPACE_MEASUREMENT}
        onConfirm={onConfirm}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Try a demo space" }),
    );

    expect(onConfirm).toHaveBeenCalledWith(DEMO_SPACE_MEASUREMENT);
  });

  it("submits a user-entered space name", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ManualMeasurementForm
        demoMeasurement={DEMO_SPACE_MEASUREMENT}
        onConfirm={onConfirm}
      />,
    );

    const name = screen.getByLabelText("Space name");
    await user.clear(name);
    await user.type(name, "Bedroom alcove");
    await enterCurrentMeasurement(user, "812");
    await enterCurrentMeasurement(user, "1600");
    await enterCurrentMeasurement(user, "305");
    await user.type(screen.getByRole("spinbutton"), "760");
    await user.click(
      screen.getByRole("button", { name: "Find furniture that fits" }),
    );

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ source: "manual" }),
      "Bedroom alcove",
    );
  });
});

async function enterCurrentMeasurement(
  user: ReturnType<typeof userEvent.setup>,
  value: string,
): Promise<void> {
  await user.type(screen.getByRole("spinbutton"), value);
  await user.click(screen.getByRole("button", { name: "Continue" }));
}
