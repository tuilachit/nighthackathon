import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchIntentForm } from "./SearchIntentForm";

const measurement = {
  widthMm: 900,
  heightMm: 1_800,
  depthMm: 350,
  accessWidthMm: 820,
  uncertaintyMm: 25,
  source: "manual",
} as const;

describe("SearchIntentForm", () => {
  it("submits the default Australian prompt request once", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SearchIntentForm measurement={measurement} onSubmit={onSubmit} />,
    );

    await user.type(
      screen.getByLabelText("What do you need?"),
      "narrow oak bookshelf under $300",
    );
    await user.click(
      screen.getByRole("button", { name: "Find products that fit" }),
    );

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith({
      intent: {
        kind: "prompt",
        text: "narrow oak bookshelf under $300",
        retailers: ["ikea-au", "kmart-au"],
      },
      measurement,
      cachePolicy: "prefer-recent",
    });
  });

  it("keeps an exact product link separate from prompt retailer choices", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SearchIntentForm measurement={measurement} onSubmit={onSubmit} />,
    );

    await user.click(screen.getByRole("button", { name: "Paste product link" }));
    await user.type(
      screen.getByLabelText("Product link"),
      "https://example.com/furniture/shelf",
    );
    await user.click(
      screen.getByRole("button", { name: "Find products that fit" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      intent: {
        kind: "product-link",
        url: "https://example.com/furniture/shelf",
      },
      measurement,
      cachePolicy: "prefer-recent",
    });
  });

  it("keeps search options collapsed until requested", async () => {
    const user = userEvent.setup();
    render(
      <SearchIntentForm measurement={measurement} onSubmit={vi.fn()} />,
    );
    expect(screen.queryByText("Source freshness")).not.toBeVisible();
    await user.click(screen.getByText("Search options"));
    expect(screen.getByText("Source freshness")).toBeVisible();
  });

  it("disables the only primary action while offline", () => {
    render(
      <SearchIntentForm
        measurement={measurement}
        offline
        onSubmit={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Find products that fit" }),
    ).toBeDisabled();
    expect(screen.getByText("Loaded spaces remain available offline.")).toBeVisible();
  });
});
