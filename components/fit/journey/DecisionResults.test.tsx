import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DecisionCandidate } from "@/lib/live-search/types";
import { DecisionResults, type DecisionResultsProps } from "./DecisionResults";
import { candidateFixture } from "./test-support";

const fits = [
  candidateFixture({ key: "ikea-1", name: "Top IKEA fit" }),
  candidateFixture({ key: "ikea-2", name: "Second IKEA fit" }),
  candidateFixture({ key: "kmart-1", name: "Top Kmart fit", retailer: "kmart" }),
];
const doorway = candidateFixture({
  key: "doorway-1",
  name: "Doorway-limited shelf",
  fitStatus: "access_issue",
  minimumClearanceMm: 15,
});
const nearMiss = candidateFixture({
  key: "near-1",
  name: "Near-miss shelf",
  fitStatus: "near_miss",
  minimumClearanceMm: -15,
});
const candidates = [...fits, doorway, nearMiss];

function defaultProps(
  overrides: Partial<DecisionResultsProps> = {},
): DecisionResultsProps {
  return {
    candidates,
    selectedTier: "fits",
    pageIndex: 0,
    comparedKeys: [],
    onSelectTier: vi.fn(),
    onPageChange: vi.fn(),
    onToggleCompare: vi.fn(),
    onOpenComparison: vi.fn(),
    ...overrides,
  };
}

describe("DecisionResults", () => {
  it("mounts only the controlled active tier and requests a tier change", async () => {
    const user = userEvent.setup();
    const onSelectTier = vi.fn();
    render(<DecisionResults {...defaultProps({ onSelectTier })} />);

    expect(screen.getByRole("tabpanel", { name: /Fits/ })).toBeInTheDocument();
    expect(screen.getByText("Top IKEA fit")).toBeInTheDocument();
    expect(screen.queryByText("Doorway-limited shelf")).not.toBeInTheDocument();
    expect(screen.queryByText("Near-miss shelf")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Doorway/ }));
    expect(onSelectTier).toHaveBeenCalledWith("access_issue");
  });

  it("supports arrow-key navigation across the controlled tabs", async () => {
    const user = userEvent.setup();
    const onSelectTier = vi.fn();
    render(<DecisionResults {...defaultProps({ onSelectTier })} />);

    const fitsTab = screen.getByRole("tab", { name: /Fits/ });
    fitsTab.focus();
    await user.keyboard("{ArrowLeft}");

    expect(onSelectTier).toHaveBeenCalledWith("near_miss");
    expect(screen.getByRole("tab", { name: /Near misses/ })).toHaveFocus();
  });

  it("paginates the selected tier in controlled groups of six", async () => {
    const user = userEvent.setup();
    const pagedFits = Array.from({ length: 7 }, (_, index) =>
      candidateFixture({
        key: `fit-${index + 1}`,
        name: `Fit product ${index + 1}`,
        retailer: index === 2 ? "kmart" : "ikea",
      }));
    const onPageChange = vi.fn();
    const props = defaultProps({ candidates: pagedFits, onPageChange });
    const { rerender } = render(<DecisionResults {...props} />);

    expect(screen.getByText("Fit product 1")).toBeInTheDocument();
    expect(screen.getByText("Fit product 6")).toBeInTheDocument();
    expect(screen.queryByText("Fit product 7")).not.toBeInTheDocument();
    expect(screen.getByText("1–6 of 7")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next 6" }));
    expect(onPageChange).toHaveBeenCalledWith(1);

    rerender(<DecisionResults {...props} pageIndex={1} />);
    expect(screen.queryByText("Fit product 1")).not.toBeInTheDocument();
    expect(screen.getByText("Fit product 7")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous 6" }));
    expect(onPageChange).toHaveBeenCalledWith(0);
  });

  it("shows compact decision facts and preserves the retailer evidence", () => {
    render(<DecisionResults {...defaultProps({ candidates: [fits[0]] })} />);

    expect(screen.getByText("IKEA Australia")).toBeInTheDocument();
    expect(screen.getByText("$129.00")).toBeInTheDocument();
    expect(screen.getByText("AUD listed")).toBeInTheDocument();
    expect(screen.getByLabelText("25 millimetres minimum clearance")).toBeInTheDocument();
    expect(screen.getByText("600 W × 1700 H × 280 D mm")).toBeInTheDocument();
    expect(screen.getByText("Flat pack: 650 W × 100 H × 300 D mm")).toBeInTheDocument();
    expect(screen.getByText(/Retailer page · live/)).toBeInTheDocument();
    expect(screen.getByText("Width 60 cm, height 170 cm, depth 28 cm.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retailer source ↗" })).toHaveAttribute(
      "href",
      fits[0].productUrl,
    );
    expect(screen.getByText("One validated match")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Refine search" })).toHaveAttribute(
      "href",
      "/fit/search",
    );
    expect(
      screen.queryByRole("button", { name: "Compare top matches" }),
    ).not.toBeInTheDocument();
  });

  it("keeps result cards single-column inside the narrow journey shell", () => {
    render(<DecisionResults {...defaultProps()} />);

    const firstCard = screen.getByTestId("decision-candidate-ikea-1");
    expect(firstCard.parentElement).toHaveClass("grid-cols-1");
    expect(firstCard.parentElement).not.toHaveClass("sm:grid-cols-2");
  });

  it("defaults an empty comparison to top fits from different retailers", async () => {
    const user = userEvent.setup();
    const onOpenComparison = vi.fn();
    render(<DecisionResults {...defaultProps({ onOpenComparison })} />);

    expect(screen.getByText("Two top matches ready")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Compare top matches" }));

    expect(onOpenComparison).toHaveBeenCalledWith(["ikea-1", "kmart-1"]);
  });

  it("uses a controller-supplied linked product as the first default", async () => {
    const user = userEvent.setup();
    const onOpenComparison = vi.fn();
    render(
      <DecisionResults
        {...defaultProps({
          defaultComparisonKeys: ["near-1", "kmart-1"],
          onOpenComparison,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Compare top matches" }));
    expect(onOpenComparison).toHaveBeenCalledWith(["near-1", "kmart-1"]);
  });

  it("holds the default action while a linked product is being restored", () => {
    render(
      <DecisionResults
        {...defaultProps({
          defaultComparisonKeys: [],
          defaultComparisonPending: true,
        })}
      />,
    );

    expect(screen.getByText("Restoring linked product")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Compare top matches" }),
    ).toBeDisabled();
  });

  it("falls back through doorway and near-miss tiers for a second retailer", async () => {
    const user = userEvent.setup();
    const onOpenComparison = vi.fn();
    const kmartDoorway = candidateFixture({
      key: "kmart-doorway",
      name: "Kmart doorway option",
      retailer: "kmart",
      fitStatus: "access_issue",
    });
    render(
      <DecisionResults
        {...defaultProps({
          candidates: [fits[0], kmartDoorway, nearMiss],
          onOpenComparison,
        })}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Compare top matches" }),
    );
    expect(onOpenComparison).toHaveBeenCalledWith([
      "ikea-1",
      "kmart-doorway",
    ]);
  });

  it("requires exactly two explicit selections and keeps deselection available", async () => {
    const user = userEvent.setup();
    const onToggleCompare = vi.fn();
    const { rerender } = render(
      <DecisionResults
        {...defaultProps({ comparedKeys: ["ikea-1"], onToggleCompare })}
      />,
    );

    expect(screen.getByRole("button", { name: "Select one more" })).toBeDisabled();
    expect(screen.getByText("Choose one more product")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Compare" })[0]);
    expect(onToggleCompare).toHaveBeenCalled();

    rerender(
      <DecisionResults
        {...defaultProps({
          comparedKeys: ["ikea-1", "kmart-1"],
          onToggleCompare,
        })}
      />,
    );
    expect(screen.getAllByRole("button", { name: "Comparing" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Comparing" })[0]).toBeEnabled();
    expect(screen.getByText("Two products ready")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Compare" })[0]).toBeDisabled();
  });

  it("keeps the provided ranked candidate order within a tier", () => {
    const ranked: readonly DecisionCandidate[] = [fits[2], fits[0], fits[1]];
    render(<DecisionResults {...defaultProps({ candidates: ranked })} />);

    const cards = screen.getAllByTestId(/^decision-candidate-/);
    expect(cards.map((card) => card.getAttribute("data-testid"))).toEqual([
      "decision-candidate-kmart-1",
      "decision-candidate-ikea-1",
      "decision-candidate-ikea-2",
    ]);
  });
});
