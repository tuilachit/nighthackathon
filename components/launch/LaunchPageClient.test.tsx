import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzePromptToPrototype } from "@/lib/analyzer";
import { LaunchPageClient } from "./LaunchPageClient";

describe("LaunchPageClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the launch page with AR and waitlist actions", () => {
    const prototype = analyzePromptToPrototype("A smart water bottle for gym users");

    render(<LaunchPageClient prototype={prototype} />);

    expect(screen.getByRole("heading", { name: "Smart Hydration Bottle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View in AR" })).toHaveAttribute("href", "/ar/smart-hydration-bottle");
    expect(screen.getByRole("button", { name: "Generate launch code" })).toBeInTheDocument();
    expect(screen.getByText("Frontend waitlist form")).toBeInTheDocument();
    expect(screen.getByText("Backend Notion route")).toBeInTheDocument();
  });

  it("previews the lead payload without calling the backend", () => {
    const prototype = analyzePromptToPrototype("A smart water bottle for gym users");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<LaunchPageClient prototype={prototype} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "founder@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate launch code" }));

    expect(screen.getByText("Code package ready. Use the frontend and backend snippets below when you are ready to connect Notion.")).toBeInTheDocument();
    expect(screen.getByText(/founder@example.com/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
