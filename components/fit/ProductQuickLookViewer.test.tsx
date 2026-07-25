import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductQuickLookViewer } from "./ProductQuickLookViewer";
import type { PlacementModel } from "@/lib/model-scaling";

describe("ProductQuickLookViewer", () => {
  it("scales the placeholder box to the exact product dimensions and warns about iOS scale", () => {
    const model: PlacementModel = {
      dimensions: { widthMm: 778, depthMm: 280, heightMm: 840 },
      placeholderBoxGlbUrl: "/models/unit-box.glb",
    };

    const { container } = render(<ProductQuickLookViewer name="Oakridge 3-Shelf" model={model} />);

    const viewer = container.querySelector("model-viewer");
    expect(viewer).toHaveAttribute("src", "/models/unit-box.glb");
    expect(viewer).toHaveAttribute("scale", "0.778 0.84 0.28");
    expect(viewer).toHaveAttribute("ar-scale", "fixed");
    expect(screen.getByText(/may be resizable on iPhone/)).toBeInTheDocument();
  });

  it("uses the hero GLB at identity scale and trusts iOS true scale when a USDZ exists", () => {
    const model: PlacementModel = {
      dimensions: { widthMm: 778, depthMm: 280, heightMm: 840 },
      glbUrl: "/models/oakridge-3-shelf.glb",
      iosUsdzUrl: "/models/oakridge-3-shelf.usdz",
      placeholderBoxGlbUrl: "/models/unit-box.glb",
    };

    const { container } = render(<ProductQuickLookViewer name="Oakridge 3-Shelf" model={model} />);

    const viewer = container.querySelector("model-viewer");
    expect(viewer).toHaveAttribute("src", "/models/oakridge-3-shelf.glb");
    expect(viewer).toHaveAttribute("ios-src", "/models/oakridge-3-shelf.usdz");
    expect(viewer).toHaveAttribute("scale", "1 1 1");
    expect(screen.getByText("Placed at true real-world size.")).toBeInTheDocument();
  });
});
