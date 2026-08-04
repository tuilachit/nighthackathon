import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RootPage from "./page";

describe("Fitment landing page", () => {
  it("leads with the product promise and both honest entry paths", () => {
    render(<RootPage />);

    expect(screen.getByText("FITMENT", { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText(
        "only shows you furniture that actually fits, your space and your front door",
        { exact: true },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Measure your space" }),
    ).toHaveAttribute("href", "/fit?new=1");
    expect(
      screen.getByRole("link", { name: "Try a demo space" }),
    ).toHaveAttribute("href", "/fit?demo=1");
  });
});
