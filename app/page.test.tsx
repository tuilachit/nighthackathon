import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RootPage from "./page";

describe("Fitment landing page", () => {
  it("leads with the product promise and both honest entry paths", () => {
    render(<RootPage />);

    expect(screen.getByText("FITMENT", { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Compare furniture that fits your measured space—with delivery risks flagged before you buy.",
        { exact: true },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Measure your space" }),
    ).toHaveAttribute("href", "/fit?new=1");
    expect(
      screen.getByRole("link", { name: "Check a product" }),
    ).toHaveAttribute("href", "/fit?mode=link");
    expect(
      screen.getByRole("link", { name: "How Fitment works" }),
    ).toHaveAttribute("href", "/how-it-works");
  });
});
