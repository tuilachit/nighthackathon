import type { FallbackReason, ProductCategory, PrototypeModel } from "./prototype-types";

interface FallbackAsset {
  readonly category: ProductCategory;
  readonly glbPath: string;
  readonly iosPath?: string;
  readonly validated: boolean;
}

const BOTTLE_ASSET: FallbackAsset = {
  category: "bottle",
  glbPath: "/models/bottle.glb",
  validated: true,
};

const CATEGORY_ASSETS: Record<Exclude<ProductCategory, "unknown">, FallbackAsset> = {
  bottle: BOTTLE_ASSET,
  lamp: { ...BOTTLE_ASSET, category: "lamp", validated: false },
  chair: { ...BOTTLE_ASSET, category: "chair", validated: false },
  box: { ...BOTTLE_ASSET, category: "box", validated: false },
  device: { ...BOTTLE_ASSET, category: "device", validated: false },
};

export function getFallbackReason(category: ProductCategory): FallbackReason {
  if (category === "unknown") {
    return "unsupported-category";
  }

  return CATEGORY_ASSETS[category].validated ? "none" : "unsupported-category";
}

export function getFallbackModel(category: ProductCategory): PrototypeModel {
  const asset = category === "unknown" ? BOTTLE_ASSET : CATEGORY_ASSETS[category];
  const resolvedAsset = asset.validated ? asset : BOTTLE_ASSET;

  return {
    glbPath: resolvedAsset.glbPath,
    iosPath: resolvedAsset.iosPath,
    source: "fallback",
    category: resolvedAsset.category,
    generationMode: "none",
  };
}

export function categoryUsesValidatedAsset(category: ProductCategory): boolean {
  if (category === "unknown") {
    return false;
  }

  return CATEGORY_ASSETS[category].validated;
}
