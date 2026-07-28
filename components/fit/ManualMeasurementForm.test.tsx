import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEMO_SPACE_MEASUREMENT } from "@/lib/fit-config";
import { ManualMeasurementForm } from "./ManualMeasurementForm";

describe("ManualMeasurementForm", () => {
  it("submits an honestly labeled manual measurement", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ManualMeasurementForm
        demoMeasurement={DEMO_SPACE_MEASUREMENT}
        onConfirm={onConfirm}
      />,
    );

    await user.type(
      screen.getByRole("spinbutton", { name: /^Width/ }),
      "812",
    );
    await user.type(
      screen.getByRole("spinbutton", { name: /^Height/ }),
      "1600",
    );
    await user.type(
      screen.getByRole("spinbutton", { name: /^Depth/ }),
      "305",
    );
    await user.type(
      screen.getByRole("spinbutton", {
        name: /^Narrowest access opening/,
      }),
      "760",
    );
    await user.click(
      screen.getByRole("button", { name: "Use these measurements" }),
    );

    expect(onConfirm).toHaveBeenCalledWith({
      widthMm: 812,
      heightMm: 1600,
      depthMm: 305,
      uncertaintyMm: 5,
      accessWidthMm: 760,
      source: "manual",
    });
  });

  it("loads the demo fixture only through an explicit fallback control", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ManualMeasurementForm
        demoMeasurement={DEMO_SPACE_MEASUREMENT}
        onConfirm={onConfirm}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Use labeled demo measurement" }),
    );

    expect(onConfirm).toHaveBeenCalledWith(DEMO_SPACE_MEASUREMENT);
  });
});
