import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FitDemoClient } from "./FitDemoClient";
import type { CatalogProduct, SpaceMeasurement } from "@/lib/catalog-types";
import {
  createSavedSpace,
  SAVED_SPACES_STORAGE_KEY,
} from "@/lib/saved-spaces";
import { buildFitShareUrl } from "@/lib/fit-share-state";

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
  imagePath: "/window.svg",
  productUrl: "https://www.ikea.com/us/en/p/laiva-bookcase-black-brown-40178591/",
  verification: { sourceUrl: "https://www.ikea.com/...", verifiedAt: "2026-07-24" },
  provenance: {
    dimensionsSource: "json-ld",
    sourceUrl: "https://www.ikea.com/...",
    extractedAt: "2026-07-24",
    confidence: "high",
  },
  model: {
    glbPath: "/models/glb/ikea-laiva.glb",
    usdzPath: "/models/usdz/ikea-laiva.usdz",
    scaleVerified: true,
    nativeDimensionsMm: { widthMm: 619, heightMm: 1651, depthMm: 241 },
  },
};

describe("FitDemoClient", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/fit");
    vi.restoreAllMocks();
  });

  it("shows the AR viewer inline for a verified product instead of navigating away", () => {
    render(
      <FitDemoClient
        demoMeasurement={measurement}
        products={[product]}
        catalogSource="bundled"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try a demo space" }));
    fireEvent.click(screen.getByRole("button", { name: "View in room" }));

    expect(screen.getByRole("heading", { name: "LAIVA Bookcase", level: 2 })).toBeInTheDocument();
    const viewer = document.querySelector("model-viewer");
    expect(viewer).toHaveAttribute("src", "/models/glb/ikea-laiva.glb");
    expect(viewer).toHaveAttribute("scale", "1 1 1");

    fireEvent.click(screen.getByRole("button", { name: "‹ Back to results" }));
    expect(screen.queryByRole("heading", { name: "LAIVA Bookcase", level: 2 })).not.toBeInTheDocument();
  });

  it("uses the exact-dimension placeholder when no cached model exists", () => {
    const productWithoutModel: CatalogProduct = { ...product, model: undefined };

    render(
      <FitDemoClient
        demoMeasurement={measurement}
        products={[productWithoutModel]}
        catalogSource="bundled"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try a demo space" }));
    fireEvent.click(screen.getByRole("button", { name: "View in room" }));

    const viewer = document.querySelector("model-viewer");
    expect(viewer).toHaveAttribute("src", "/models/unit-box.glb");
    expect(viewer).toHaveAttribute("scale", "0.619 1.651 0.241");
  });

  it("opens on honest measurement entry and exposes the demo only on demand", () => {
    render(
      <FitDemoClient
        demoMeasurement={measurement}
        products={[product]}
        catalogSource="bundled"
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Measure the space furniture has to fit.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Verified fits" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try a demo space" }));
    expect(
      screen.getByRole("heading", { name: "Verified fits" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("heading", {
        name: "Measure the space furniture has to fit.",
      }),
    ).toBeInTheDocument();
  });

  it("returns directly to the most recent saved space", () => {
    const older = createSavedSpace("Bedroom alcove", measurement, {
      id: "older",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    const latest = createSavedSpace("Hallway", {
      ...measurement,
      widthMm: 880,
      source: "manual",
    }, {
      id: "latest",
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    window.localStorage.setItem(
      SAVED_SPACES_STORAGE_KEY,
      JSON.stringify([older, latest]),
    );

    render(
      <FitDemoClient
        demoMeasurement={measurement}
        products={[product]}
        catalogSource="bundled"
      />,
    );

    expect(screen.getByLabelText("Saved space")).toHaveValue("latest");
    expect(screen.getByRole("region", { name: "Your space is the search filter." })).toHaveTextContent("880");
    expect(
      screen.queryByRole("heading", {
        name: "Measure the space furniture has to fit.",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps a new manual space usable when localStorage writes fail", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota", "QuotaExceededError");
    });
    render(
      <FitDemoClient
        demoMeasurement={measurement}
        products={[product]}
        catalogSource="bundled"
      />,
    );

    submitManualSpace("Bedroom alcove");

    expect(screen.getByRole("heading", { name: "Verified fits" })).toBeInTheDocument();
    expect(screen.getByLabelText("Saved space")).toHaveTextContent("Bedroom alcove");
  });

  it("opens valid shared state without reading or changing saved spaces", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const sharedUrl = buildFitShareUrl(window.location.origin, {
      measurement,
      query: "white bookcase under $50",
      comparedProductIds: [product.id],
    });
    window.history.replaceState(null, "", new URL(sharedUrl).search);

    render(
      <FitDemoClient
        demoMeasurement={measurement}
        products={[product]}
        catalogSource="bundled"
      />,
    );

    expect(getItem).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("white bookcase under $50")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Clearance comparison" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Saved space")).toHaveTextContent(
      "Current space",
    );
  });

  it("falls back to measurement entry for malformed shared state", () => {
    const stored = createSavedSpace("Should stay untouched", measurement, {
      id: "stored",
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    window.localStorage.setItem(
      SAVED_SPACES_STORAGE_KEY,
      JSON.stringify([stored]),
    );
    window.history.replaceState(
      null,
      "",
      "/fit?w=0&h=1800&d=350&a=820&u=25&source=manual&q=shelf&compare=ikea-one",
    );
    const getItem = vi.spyOn(Storage.prototype, "getItem");

    render(
      <FitDemoClient
        demoMeasurement={measurement}
        products={[product]}
        catalogSource="bundled"
      />,
    );

    expect(getItem).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        name: "Measure the space furniture has to fit.",
      }),
    ).toBeInTheDocument();
  });
});

function submitManualSpace(name: string): void {
  fireEvent.change(screen.getByLabelText("Space name"), {
    target: { value: name },
  });
  for (const value of ["900", "1800", "350"]) {
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  }
  fireEvent.change(screen.getByRole("spinbutton"), {
    target: { value: "820" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Find furniture that fits" }),
  );
}
