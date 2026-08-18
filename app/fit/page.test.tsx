import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import FitPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/components/fit/journey/SpaceHomeScreen", () => ({
  SpaceHomeScreen: vi.fn(({ initialMode }: { readonly initialMode: string }) => (
    <h1 data-mode={initialMode}>Space home</h1>
  )),
}));

describe("/fit compatibility routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects an old job query before loading the catalog", async () => {
    await expect(FitPage({
      searchParams: Promise.resolve({
        job: "00000000-0000-4000-8000-000000000001",
      }),
    })).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith(
      "/fit/jobs/00000000-0000-4000-8000-000000000001",
    );
  });

  it("redirects the old new-space query to the dedicated space route", async () => {
    await expect(FitPage({
      searchParams: Promise.resolve({ new: "1" }),
    })).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/fit/space");
  });

  it("redirects the old demo query to the dedicated tier results", async () => {
    await expect(FitPage({
      searchParams: Promise.resolve({ demo: "1" }),
    })).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/fit/demo/results?tier=fits");
  });

  it("redirects a backend-free legacy share to the readable tier route", async () => {
    await expect(FitPage({
      searchParams: Promise.resolve({
        w: "880",
        h: "1750",
        d: "330",
        a: "760",
        u: "25",
        source: "manual",
        q: "narrow shelf",
        compare: "ikea-one,target-two",
      }),
    })).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith(
      "/fit/demo/results?tier=fits&w=880&h=1750&d=330&a=760&u=25&source=manual&q=narrow+shelf&compare=ikea-one%2Ctarget-two",
    );
  });

  it("opens the saved-space home when no compatibility redirect applies", async () => {
    render(await FitPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { name: "Space home" }),
    ).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("preserves exact-link intent while the user chooses a space", async () => {
    render(await FitPage({ searchParams: Promise.resolve({ mode: "link" }) }));

    expect(screen.getByRole("heading", { name: "Space home" })).toHaveAttribute(
      "data-mode",
      "link",
    );
    expect(redirect).not.toHaveBeenCalled();
  });
});
