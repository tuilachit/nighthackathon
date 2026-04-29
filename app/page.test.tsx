import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("Home", () => {
  it("renders the create screen", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "Sketch a product. Walk around it." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Answer product questions" })).toBeInTheDocument();
  });
});
