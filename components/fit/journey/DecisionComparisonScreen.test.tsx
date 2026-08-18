import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SpaceMeasurement } from "@/lib/catalog-types";
import { DecisionComparisonScreen } from "./DecisionComparisonScreen";
import { candidateFixture } from "./test-support";

const measurement: SpaceMeasurement = {
  widthMm: 900,
  heightMm: 1800,
  depthMm: 350,
  uncertaintyMm: 25,
  accessWidthMm: 820,
  source: "manual",
};
const first = candidateFixture({
  key: "ikea-1",
  name: "Narrow IKEA shelf",
  minimumClearanceMm: 25,
});
const second = candidateFixture({
  key: "kmart-1",
  name: "Narrow Kmart shelf",
  retailer: "kmart",
  minimumClearanceMm: 15,
});

describe("DecisionComparisonScreen", () => {
  it("draws two products against one measured envelope", () => {
    render(
      <DecisionComparisonScreen
        measurement={measurement}
        candidates={[first, second]}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Clearance comparison" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Technical measurement envelope diagram" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Narrow IKEA shelf clearance drawing" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Narrow Kmart shelf clearance drawing" })).toBeInTheDocument();
    expect(screen.getByText("900 W × 1800 H × 350 D mm · 820 mm access")).toBeInTheDocument();
    expect(screen.getByText("10 mm")).toBeInTheDocument();
    expect(screen.getByText("Narrow IKEA shelf has the higher minimum-clearance value.")).toBeInTheDocument();
    expect(screen.getAllByLabelText("W axis clearance 235 millimetres")).toHaveLength(2);
  });

  it("keeps source dimensions, packages, provenance, and retailer evidence available", () => {
    render(
      <DecisionComparisonScreen
        measurement={measurement}
        candidates={[first, second]}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getAllByText("600 W × 1700 H × 280 D mm")).toHaveLength(2);
    expect(screen.getAllByText("Flat pack: 650 W × 100 H × 300 D mm")).toHaveLength(2);
    expect(screen.getByText(/Retailer page · live/)).toBeInTheDocument();
    expect(screen.getByText(/Retailer JSON-LD · live/)).toBeInTheDocument();
    expect(screen.getAllByText("Width 60 cm, height 170 cm, depth 28 cm.")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Retailer source ↗" })).toHaveLength(2);
  });

  it("offers one primary continuation action", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    const onRetailerOutbound = vi.fn();
    render(
      <DecisionComparisonScreen
        measurement={measurement}
        candidates={[first, second]}
        onContinue={onContinue}
        onRetailerOutbound={onRetailerOutbound}
        continueLabel="Approve one product"
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("Approve one product");
    await user.click(buttons[0]);
    expect(onContinue).toHaveBeenCalledOnce();

    await user.click(screen.getAllByRole("link", { name: "Retailer source ↗" })[1]);
    expect(onRetailerOutbound).toHaveBeenCalledWith(second);
  });
});
