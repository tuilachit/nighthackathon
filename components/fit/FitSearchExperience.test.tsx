import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FURNITURE_CATALOG } from "@/lib/catalog";
import { DEMO_SPACE_MEASUREMENT } from "@/lib/fit-config";
import { FitSearchExperience } from "./FitSearchExperience";

describe("FitSearchExperience", () => {
  it("renders verified fits, access failures, and space near misses separately", () => {
    render(
      <FitSearchExperience
        measurement={DEMO_SPACE_MEASUREMENT}
        products={FURNITURE_CATALOG}
        onSelectProduct={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: /verified fits/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fits the space, access issue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Near misses" })).toBeInTheDocument();
    expect(screen.getAllByText("Dimensions verified").length).toBeGreaterThan(5);
    expect(screen.getAllByText(/access opening\./i).length).toBeGreaterThanOrEqual(1);
  });

  it("removes every access reference when access width is absent", () => {
    render(
      <FitSearchExperience
        measurement={{ ...DEMO_SPACE_MEASUREMENT, accessWidthMm: undefined }}
        products={FURNITURE_CATALOG}
        onSelectProduct={vi.fn()}
      />,
    );

    expect(screen.queryByText(/access issue/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/access opening/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/narrowest access/i)).not.toBeInTheDocument();
  });

  it("limits comparison to three passing products", async () => {
    const user = userEvent.setup();
    render(
      <FitSearchExperience
        measurement={DEMO_SPACE_MEASUREMENT}
        products={FURNITURE_CATALOG}
        onSelectProduct={vi.fn()}
      />,
    );

    const compareButtons = screen.getAllByRole("button", { name: "Compare" });
    await user.click(compareButtons[0]);
    await user.click(compareButtons[1]);
    await user.click(compareButtons[2]);

    expect(screen.getByText("3/3")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Comparing" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Compare" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
  });

  it("hands a passing product to the placement boundary", async () => {
    const user = userEvent.setup();
    const onSelectProduct = vi.fn();
    render(
      <FitSearchExperience
        measurement={DEMO_SPACE_MEASUREMENT}
        products={FURNITURE_CATALOG}
        onSelectProduct={onSelectProduct}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "View in room" })[0]);
    expect(onSelectProduct).toHaveBeenCalledTimes(1);
    expect(onSelectProduct.mock.calls[0]?.[0]).toMatchObject({
      fit: { fits: true },
      access: { passes: true },
    });
  });

  it("submits cached query chips through the same text pipeline", async () => {
    const user = userEvent.setup();
    render(
      <FitSearchExperience
        measurement={DEMO_SPACE_MEASUREMENT}
        products={FURNITURE_CATALOG}
        onSelectProduct={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "white shelving unit under $200" }));
    expect(screen.getByDisplayValue("white shelving unit under $200")).toBeInTheDocument();
    expect(screen.getByText("shelving unit")).toBeInTheDocument();
    expect(screen.getByText("Under $200")).toBeInTheDocument();
  });

  it("shows no fixture products when the live catalog is unavailable", () => {
    render(
      <FitSearchExperience
        measurement={DEMO_SPACE_MEASUREMENT}
        products={[]}
        catalogSource="unavailable"
        onSelectProduct={vi.fn()}
      />,
    );

    expect(screen.getByTestId("catalog-unavailable")).toHaveTextContent(
      "No placeholder products are being shown",
    );
    expect(screen.queryByText("Dimensions verified")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Compare" })).not.toBeInTheDocument();
  });
});
