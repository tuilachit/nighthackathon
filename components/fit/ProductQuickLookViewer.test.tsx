import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
    expect(screen.getByRole("button", { name: "View in 3D" })).toBeInTheDocument();
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

  it("offers the room action only after the device reports native AR support", async () => {
    const user = userEvent.setup();
    const activateAR = vi.fn();
    const model: PlacementModel = {
      dimensions: { widthMm: 778, depthMm: 280, heightMm: 840 },
      glbUrl: "/models/oakridge-3-shelf.glb",
      iosUsdzUrl: "/models/oakridge-3-shelf.usdz",
      placeholderBoxGlbUrl: "/models/unit-box.glb",
    };
    const { container } = render(
      <ProductQuickLookViewer name="Oakridge 3-Shelf" model={model} />,
    );
    const viewer = container.querySelector("model-viewer");
    expect(viewer).not.toBeNull();
    Object.defineProperties(viewer, {
      canActivateAR: { configurable: true, value: true },
      activateAR: { configurable: true, value: activateAR },
    });
    fireEvent.load(viewer as Element);

    await user.click(
      screen.getByRole("button", { name: "View in your room" }),
    );
    expect(activateAR).toHaveBeenCalledTimes(1);
  });
});
