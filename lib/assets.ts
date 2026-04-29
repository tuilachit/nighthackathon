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

export type ModelAssetExtension = "glb" | "usdz";

export function getRemoteModelAssetExtension(value: string): ModelAssetExtension | undefined {
  try {
    const parsedUrl = new URL(value);
    const pathname = parsedUrl.pathname.toLowerCase();

    if (parsedUrl.protocol !== "https:") {
      return undefined;
    }

    if (pathname.endsWith(".glb")) {
      return "glb";
    }

    if (pathname.endsWith(".usdz")) {
      return "usdz";
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export function isSupportedRemoteModelAssetUrl(value: string, extension?: ModelAssetExtension): boolean {
  const resolvedExtension = getRemoteModelAssetExtension(value);
  return resolvedExtension !== undefined && (extension === undefined || resolvedExtension === extension);
}

export function isSupportedLocalModelAssetPath(value: string, extension: ModelAssetExtension): boolean {
  return value.startsWith("/models/") && value.toLowerCase().endsWith(`.${extension}`);
}

export function isSupportedModelAssetSource(value: string, extension: ModelAssetExtension): boolean {
  return isSupportedRemoteModelAssetUrl(value, extension) || isSupportedLocalModelAssetPath(value, extension);
}

export function getPrimaryModelSource(model: PrototypeModel): string {
  if (model.remoteModelUrl !== undefined && isSupportedRemoteModelAssetUrl(model.remoteModelUrl, "glb")) {
    return model.remoteModelUrl;
  }

  return model.glbPath;
}

export function getIosModelSource(model: PrototypeModel): string | undefined {
  if (model.remoteUsdzUrl !== undefined && isSupportedRemoteModelAssetUrl(model.remoteUsdzUrl, "usdz")) {
    return model.remoteUsdzUrl;
  }

  return model.iosPath;
}

export function getModelViewerAssetUrl(source: string | undefined): string | undefined {
  if (source === undefined) {
    return undefined;
  }

  if (isSupportedRemoteModelAssetUrl(source)) {
    return `/api/model-asset?url=${encodeURIComponent(source)}`;
  }

  return source;
}
