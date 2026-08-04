import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HowItWorksPage from "./page";

describe("How it works page", () => {
  it("explains the complete stranger flow without hiding the access check", () => {
    render(<HowItWorksPage />);

    for (const heading of [
      "Measure",
      "Search",
      "Compare",
      "Check the doorway",
      "Place or buy",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }

    expect(screen.getByText("820 mm access opening")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Measure your space" }),
    ).toHaveAttribute("href", "/fit?new=1");
  });
});
