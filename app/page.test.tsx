import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the initialized Reality MVP shell", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "Spatial prototype builder" })).toBeInTheDocument();
    expect(screen.getByText(/smart water bottle/i)).toBeInTheDocument();
  });
});
