import type { PrototypeCategory, PrototypeModel } from "./prototype-types";

export const HERO_CATEGORY: PrototypeCategory = "bottle";

export const MODEL_ASSETS: Record<PrototypeCategory, { glbPath: string; iosPath?: string; validated: boolean }> = {
  bottle: { glbPath: "/models/bottle.glb", validated: true },
  lamp: { glbPath: "/models/bottle.glb", validated: false },
  chair: { glbPath: "/models/bottle.glb", validated: false },
  box: { glbPath: "/models/bottle.glb", validated: false },
  device: { glbPath: "/models/bottle.glb", validated: false },
};

export function resolveCategoryModel(category: PrototypeCategory): PrototypeModel {
  const asset = MODEL_ASSETS[category];
  const resolved = asset.validated ? asset : MODEL_ASSETS[HERO_CATEGORY];

  return {
    glbPath: resolved.glbPath,
    iosPath: resolved.iosPath,
    fallbackGlbPath: MODEL_ASSETS[HERO_CATEGORY].glbPath,
    source: "fallback",
    category: asset.validated ? category : HERO_CATEGORY,
    generationMode: "none",
  };
}

export function isSupportedRemoteGlb(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.pathname.toLowerCase().endsWith(".glb");
  } catch {
    return false;
  }
}
