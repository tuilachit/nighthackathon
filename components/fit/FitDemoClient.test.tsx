import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FitDemoClient, SPACE_HANDOFF_STORAGE_KEY } from "./FitDemoClient";
import type { CatalogProduct, SpaceMeasurement } from "@/lib/catalog-types";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const measurement: SpaceMeasurement = {
  widthMm: 900,
  heightMm: 1800,
  depthMm: 350,
  uncertaintyMm: 25,
  source: "demo",
};

const product: CatalogProduct = {
  id: "ikea-laiva-40178591",
  retailer: "IKEA",
  name: "LAIVA Bookcase",
  category: "bookcase",
  priceUsd: 39.99,
  dimensions: { widthMm: 619, heightMm: 1651, depthMm: 241 },
  materials: ["wood"],
  colors: ["white"],
  styles: ["slim"],
  keywords: ["bookcase"],
  imagePath: "/images/products/laiva.svg",
  productUrl: "https://www.ikea.com/us/en/p/laiva-bookcase-black-brown-40178591/",
  verification: { sourceUrl: "https://www.ikea.com/...", verifiedAt: "2026-07-24" },
  model: {
    glbPath: "/models/glb/ikea-laiva.glb",
    usdzPath: "/models/usdz/ikea-laiva.usdz",
    scaleVerified: true,
    nativeDimensionsMm: { widthMm: 619, heightMm: 1651, depthMm: 241 },
  },
};

describe("FitDemoClient", () => {
  afterEach(() => {
    pushMock.mockClear();
    window.sessionStorage.clear();
  });

  it("hands the selected product off to the /space/place flow instead of a dead-end card", () => {
    render(<FitDemoClient measurement={measurement} products={[product]} catalogSource="bundled" />);

    fireEvent.click(screen.getByRole("button", { name: "View in room" }));

    const stored = window.sessionStorage.getItem(SPACE_HANDOFF_STORAGE_KEY);
    expect(stored).not.toBeNull();
    const candidate = JSON.parse(stored ?? "{}");
    expect(candidate.id).toBe("ikea-laiva-40178591");
    expect(candidate.model.glbUrl).toBe("/models/glb/ikea-laiva.glb");
    expect(candidate.model.scaleSource).toBe("verified");

    expect(pushMock).toHaveBeenCalledTimes(1);
    const [pushedUrl] = pushMock.mock.calls[0];
    expect(pushedUrl).toMatch(/^\/space\/place\?/);
    expect(pushedUrl).toContain("widthMm=900");
    expect(pushedUrl).toContain("source=demo");
  });

  it("generates a 3D preview from the catalog's own attributes when there is no verified model yet", async () => {
    const productWithoutModel: CatalogProduct = { ...product, model: undefined };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/generate-model/start") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              generation: { status: "pending", taskId: "task-9", mode: "text-to-3d", refinedMeshyPrompt: "LAIVA Bookcase" },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            generation: {
              status: "succeeded",
              taskId: "task-9",
              glbUrl: "https://assets.meshy.ai/task-9/output/model.glb",
              usdzUrl: "https://assets.meshy.ai/task-9/output/model.usdz",
            },
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<FitDemoClient measurement={measurement} products={[productWithoutModel]} catalogSource="bundled" />);
    fireEvent.click(screen.getByRole("button", { name: "View in room" }));

    expect(await screen.findByText(/Generating a 3D preview of LAIVA Bookcase/)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));

    const stored = window.sessionStorage.getItem(SPACE_HANDOFF_STORAGE_KEY);
    const candidate = JSON.parse(stored ?? "{}");
    expect(candidate.model.scaleSource).toBe("generated");
    expect(candidate.model.dimensions).toEqual(product.dimensions);
    expect(candidate.model.glbUrl).toBe("/api/model-asset?url=https%3A%2F%2Fassets.meshy.ai%2Ftask-9%2Foutput%2Fmodel.glb");

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
