import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FURNITURE_CATALOG } from "@/lib/catalog";
import { DEMO_SPACE_MEASUREMENT } from "@/lib/fit-config";
import { searchProducts } from "@/lib/product-ranker";
import { parseFurnitureQuery } from "@/lib/query-parser";
import { FitSearchExperience } from "./FitSearchExperience";

vi.mock("qrcode", () => ({
  default: {
    toString: vi.fn().mockResolvedValue(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z"/></svg>',
    ),
  },
}));

describe("FitSearchExperience", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders verified fits, access failures, and space near misses separately", () => {
    render(
      <FitSearchExperience
        measurement={DEMO_SPACE_MEASUREMENT}
        products={FURNITURE_CATALOG}
        onSelectProduct={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Verified fits" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fits the space, access issue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Near misses" })).toBeInTheDocument();
    expect(screen.getAllByText("Source checked").length).toBeGreaterThan(5);
    expect(screen.getAllByText(/access opening\./i).length).toBeGreaterThanOrEqual(1);
  });

  it("caps passing cards at six until the user expands the tier", async () => {
    const user = userEvent.setup();
    render(
      <FitSearchExperience
        measurement={DEMO_SPACE_MEASUREMENT}
        products={FURNITURE_CATALOG}
        onSelectProduct={vi.fn()}
      />,
    );

    const fits = screen.getByRole("region", { name: "Verified fits" });
    expect(within(fits).getAllByRole("article")).toHaveLength(6);

    const expander = within(fits).getByRole("button", {
      name: "Show all 25 fits",
    });
    expect(expander).toHaveAttribute("aria-expanded", "false");
    await user.click(expander);

    expect(within(fits).getAllByRole("article")).toHaveLength(25);
    expect(
      within(fits).getByRole("button", { name: "Show fewer fits" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("labels access as unassessed without implying an access result", () => {
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
    expect(screen.getAllByText("Access not checked").length).toBeGreaterThan(0);
  });

  it("limits comparison to three products", async () => {
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

    expect(screen.getByText(/Comparison register · 3\/3/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Comparing" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Compare" }).every((button) => button.hasAttribute("disabled"))).toBe(true);
  });

  it("keeps access issues and near misses eligible for decision comparison", async () => {
    const user = userEvent.setup();
    render(
      <FitSearchExperience
        measurement={DEMO_SPACE_MEASUREMENT}
        products={FURNITURE_CATALOG}
        onSelectProduct={vi.fn()}
      />,
    );

    const accessTier = screen.getByRole("region", { name: "Fits the space, access issue" });
    const nearTier = screen.getByRole("region", { name: "Near misses" });
    await user.click(within(accessTier).getAllByRole("button", { name: "Compare" })[0]);
    await user.click(within(nearTier).getAllByRole("button", { name: "Compare" })[0]);
    await user.click(screen.getByRole("button", { name: /Comparison register · 2\/3/ }));

    const comparison = screen.getByRole("region", { name: "Clearance comparison" });
    expect(within(comparison).getAllByRole("button", { name: "Remove" })).toHaveLength(2);
    expect(within(comparison).queryByRole("button", { name: "View in room" })).not.toBeInTheDocument();
  });

  it("preselects the top IKEA and Target fits when comparison opens empty", async () => {
    const user = userEvent.setup();
    render(
      <FitSearchExperience
        measurement={DEMO_SPACE_MEASUREMENT}
        products={FURNITURE_CATALOG}
        onSelectProduct={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Top IKEA \+ Target/ }),
    );

    const comparison = screen.getByRole("region", {
      name: "Clearance comparison",
    });
    expect(within(comparison).getByText("IKEA")).toBeInTheDocument();
    expect(within(comparison).getByText("Target")).toBeInTheDocument();
    expect(
      within(comparison).getByText(/Δ \d+ mm/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Comparing" })).toHaveLength(2);
  });

  it("hands a compared product directly to the placement boundary", async () => {
    const user = userEvent.setup();
    const onSelectProduct = vi.fn();
    render(
      <FitSearchExperience
        measurement={DEMO_SPACE_MEASUREMENT}
        products={FURNITURE_CATALOG}
        onSelectProduct={onSelectProduct}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Top IKEA \+ Target/ }),
    );
    const comparison = screen.getByRole("region", {
      name: "Clearance comparison",
    });
    await user.click(
      within(comparison).getAllByRole("button", { name: "View in room" })[0],
    );

    expect(onSelectProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        fit: expect.objectContaining({ fits: true }),
        access: expect.objectContaining({ passes: true }),
      }),
    );
  });

  it("keeps the comparison tray visible after closing the detail view", async () => {
    const user = userEvent.setup();
    render(
      <FitSearchExperience
        measurement={DEMO_SPACE_MEASUREMENT}
        products={FURNITURE_CATALOG}
        onSelectProduct={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Top IKEA \+ Target/ }),
    );
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.queryByRole("region", { name: "Clearance comparison" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /IKEA \/ Target/ }),
    ).toBeInTheDocument();
  });

  it("copies an exact measurement, query, and comparison link", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <FitSearchExperience
        measurement={DEMO_SPACE_MEASUREMENT}
        products={FURNITURE_CATALOG}
        onSelectProduct={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Top IKEA \+ Target/ }),
    );
    await user.click(screen.getByRole("button", { name: "Share" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const copiedUrl = new URL(String(writeText.mock.calls[0]?.[0]));
    expect(copiedUrl.pathname).toBe("/fit");
    expect(copiedUrl.searchParams.get("w")).toBe("900");
    expect(copiedUrl.searchParams.get("a")).toBe("820");
    expect(copiedUrl.searchParams.get("q")).toBe(
      "white cube bookcase under $50",
    );
    expect(copiedUrl.searchParams.get("compare")?.split(",")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Link copied" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("dialog", { name: "Scan to compare on your phone" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "QR code for this exact furniture comparison",
      }),
    ).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml/));
  });

  it("opens an initial shared comparison without changing its selections", () => {
    const productIds = searchProducts(
      FURNITURE_CATALOG,
      DEMO_SPACE_MEASUREMENT,
      parseFurnitureQuery("white cube bookcase under $50"),
    ).fits
      .slice(0, 2)
      .map((entry) => entry.product.id);
    render(
      <FitSearchExperience
        measurement={DEMO_SPACE_MEASUREMENT}
        products={FURNITURE_CATALOG}
        initialComparedProductIds={productIds}
        onSelectProduct={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Clearance comparison" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Comparing" })).toHaveLength(
      productIds.length,
    );
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

    await user.click(screen.getByRole("button", { name: "white metal shelving unit under $30" }));
    expect(screen.getByDisplayValue("white metal shelving unit under $30")).toBeInTheDocument();
    expect(screen.getByText("shelving unit")).toBeInTheDocument();
    expect(screen.getByText("Under $30")).toBeInTheDocument();
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
    expect(screen.queryByText("Source checked")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Compare" })).not.toBeInTheDocument();
  });
});
