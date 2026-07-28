import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FitDemoClient } from "./FitDemoClient";
import type { CatalogProduct, SpaceMeasurement } from "@/lib/catalog-types";

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
  it("shows the AR viewer inline for a verified product instead of navigating away", () => {
    render(
      <FitDemoClient
        demoMeasurement={measurement}
        products={[product]}
        catalogSource="bundled"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Use labeled demo measurement" }),
    );
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
    fireEvent.click(
      screen.getByRole("button", { name: "Use labeled demo measurement" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "View in room" }));

    const viewer = document.querySelector("model-viewer");
    expect(viewer).toHaveAttribute("src", "/models/unit-box.glb");
    expect(viewer).toHaveAttribute("scale", "0.619 1.651 0.241");
  });
});
