import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import FitPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/catalog-source", () => ({
  loadFurnitureCatalog: vi.fn(),
}));

vi.mock("@/components/fit/FitDemoClient", () => ({
  FitDemoClient: vi.fn(() => null),
}));

describe("/fit compatibility routing", () => {
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
});
