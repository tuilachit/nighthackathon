import { describe, expect, it } from "vitest";
import type { ClearancePolicy, ProductDimensions } from "./catalog-types";
import { evaluateDeliveryAccess } from "./delivery-access";
import type { DeliveryPackage } from "./live-search/types";

const policy: ClearancePolicy = { sideMm: 20, backMm: 20, topMm: 10 };
const assembled: ProductDimensions = {
  widthMm: 800,
  heightMm: 1_600,
  depthMm: 280,
};

describe("evaluateDeliveryAccess", () => {
  it("skips without an access width and reveals no package detail", () => {
    expect(evaluateDeliveryAccess(
      assembled,
      [{ widthMm: 900, heightMm: 200, depthMm: 850, label: "Box 1" }],
      undefined,
      25,
      policy,
    )).toEqual({ status: "skipped", passes: true, basis: "unknown" });
  });

  it("uses assembled dimensions as an advisory fallback when packages are unavailable", () => {
    expect(evaluateDeliveryAccess(assembled, [], 820, 25, policy)).toEqual({
      status: "failed",
      passes: false,
      basis: "assembled-advisory",
      accessWidthMm: 820,
      crossSection: [
        { axis: "depth", sizeMm: 280 },
        { axis: "width", sizeMm: 800 },
      ],
      deficitMm: 45,
      reason: "Fits the space, but 45 mm too wide for the 820 mm access opening.",
    });
  });

  it("evaluates every package and returns the lowest passing clearance", () => {
    const packages: readonly DeliveryPackage[] = [
      { widthMm: 700, heightMm: 180, depthMm: 260, label: "Shelf pack" },
      { widthMm: 760, heightMm: 120, depthMm: 300, label: "Frame pack" },
    ];

    expect(evaluateDeliveryAccess(assembled, packages, 820, 20, policy)).toEqual({
      status: "passed",
      passes: true,
      basis: "package",
      accessWidthMm: 820,
      crossSection: [
        { axis: "height", sizeMm: 120 },
        { axis: "depth", sizeMm: 300 },
      ],
      clearanceMm: 460,
      controllingPackageIndex: 1,
      controllingPackageLabel: "Frame pack",
    });
  });

  it("returns the greatest deficit when more than one package fails", () => {
    const packages: readonly DeliveryPackage[] = [
      { widthMm: 900, heightMm: 850, depthMm: 300, label: "Box 1" },
      { widthMm: 920, heightMm: 870, depthMm: 320, label: "Box 2" },
    ];

    expect(evaluateDeliveryAccess(assembled, packages, 820, 20, policy)).toMatchObject({
      status: "failed",
      passes: false,
      basis: "package",
      deficitMm: 110,
      controllingPackageIndex: 1,
      controllingPackageLabel: "Box 2",
      reason: "Fits the space, but 110 mm too wide for the 820 mm access opening.",
    });
  });
});
