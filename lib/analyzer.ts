import { categoryUsesValidatedAsset, getFallbackModel, getFallbackReason } from "./assets";
import type { FeatureCallout, ProductCategory, PrototypeSpec } from "./prototype-types";

const CATEGORY_KEYWORDS: ReadonlyArray<readonly [ProductCategory, readonly string[]]> = [
  ["bottle", ["bottle", "hydration", "water", "drink", "flask"]],
  ["lamp", ["lamp", "light", "lighting", "desk light", "glow"]],
  ["chair", ["chair", "seat", "stool", "ergonomic"]],
  ["box", ["box", "package", "container", "storage", "case"]],
  ["device", ["device", "gadget", "phone", "wearable", "sensor"]],
];

export const DEFAULT_PROMPT =
  "A smart water bottle for gym users that glows when hydration is low.";

export const EXAMPLE_PROMPTS: readonly string[] = [
  DEFAULT_PROMPT,
  "A compact desk lamp that changes color when focus time starts.",
  "An ergonomic chair for creators with posture feedback.",
  "A smart storage box that tracks what is inside.",
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function classifyProductCategory(prompt: string): ProductCategory {
  const normalizedPrompt = prompt.toLowerCase();
  const matchedCategory = CATEGORY_KEYWORDS.find(([, keywords]) =>
    keywords.some((keyword) => normalizedPrompt.includes(keyword)),
  );

  return matchedCategory?.[0] ?? "unknown";
}

function getProductName(category: ProductCategory, prompt: string): string {
  if (prompt.toLowerCase().includes("hydration") || prompt.toLowerCase().includes("water bottle")) {
    return "Smart Hydration Bottle";
  }

  const names: Record<ProductCategory, string> = {
    bottle: "Smart Hydration Bottle",
    lamp: "Focus Signal Lamp",
    chair: "Posture Feedback Chair",
    box: "Inventory Aware Box",
    device: "Connected Product Device",
    unknown: "Reality MVP Prototype",
  };

  return names[category];
}

function getShape(category: ProductCategory): string {
  const shapes: Record<ProductCategory, string> = {
    bottle: "Tall cylindrical body with a glowing LED hydration ring",
    lamp: "Compact vertical base with a soft rectangular light panel",
    chair: "Ergonomic seat form with sensor-backed posture zones",
    box: "Clean rectangular enclosure with a visible status strip",
    device: "Rounded handheld device with a compact sensor face",
    unknown: "Simple product form optimized for fast AR preview",
  };

  return shapes[category];
}

function getMaterials(category: ProductCategory): readonly string[] {
  const materials: Record<ProductCategory, readonly string[]> = {
    bottle: ["matte stainless steel", "translucent LED ring", "silicone grip"],
    lamp: ["brushed aluminum", "diffused acrylic", "soft-touch base"],
    chair: ["molded polymer", "breathable fabric", "embedded sensors"],
    box: ["recycled polymer", "rubber seal", "small e-ink label"],
    device: ["anodized aluminum", "glass sensor window", "soft polymer edge"],
    unknown: ["matte polymer", "soft grip detail", "status light"],
  };

  return materials[category];
}

function getFeatures(category: ProductCategory): readonly FeatureCallout[] {
  const features: Record<ProductCategory, readonly FeatureCallout[]> = {
    bottle: [
      { label: "LED hydration reminder", description: "Glows when hydration is low." },
      { label: "Gym-friendly grip", description: "Textured zones keep it stable during workouts." },
      { label: "Refill tracking", description: "Tracks drinking and refill cadence." },
      { label: "Companion app concept", description: "Syncs goals and hydration nudges." },
    ],
    lamp: [
      { label: "Focus color shift", description: "Signals when deep work starts." },
      { label: "Desk-safe footprint", description: "Keeps the base compact for small workspaces." },
      { label: "Ambient modes", description: "Adjusts warmth for different work states." },
    ],
    chair: [
      { label: "Posture feedback", description: "Highlights slouching and sitting patterns." },
      { label: "Creator comfort", description: "Supports long editing and design sessions." },
      { label: "Sensor zones", description: "Uses invisible pressure points for coaching." },
    ],
    box: [
      { label: "Inventory tracking", description: "Keeps a simple record of stored items." },
      { label: "Status strip", description: "Shows when something is missing or overdue." },
      { label: "Stackable shell", description: "Uses a clean rectangular form for easy storage." },
    ],
    device: [
      { label: "Connected sensor", description: "Turns a physical product signal into app data." },
      { label: "Pocketable shell", description: "Keeps the prototype compact and inspectable." },
      { label: "Status lighting", description: "Makes alerts visible without opening an app." },
    ],
    unknown: [
      { label: "Fallback-ready model", description: "Uses the validated bottle asset for the live demo." },
      { label: "Refined concept", description: "Turns the rough prompt into a structured prototype." },
      { label: "AR route ready", description: "Keeps the spatial preview available immediately." },
    ],
  };

  return features[category];
}

export function analyzePromptToPrototype(prompt: string): PrototypeSpec {
  const trimmedPrompt = prompt.trim() || DEFAULT_PROMPT;
  const rawCategory = classifyProductCategory(trimmedPrompt);
  const productName = getProductName(rawCategory, trimmedPrompt);
  const id = productName === "Smart Hydration Bottle" ? "smart-hydration-bottle" : slugify(productName);
  const fallbackReason = getFallbackReason(rawCategory);
  const usesValidatedAsset = categoryUsesValidatedAsset(rawCategory);

  return {
    id,
    name: productName,
    prompt: trimmedPrompt,
    category: rawCategory,
    shape: getShape(rawCategory),
    materials: getMaterials(rawCategory),
    features: getFeatures(rawCategory),
    intendedUse:
      rawCategory === "bottle"
        ? "Gym users who want a visible, low-friction hydration reminder."
        : "Early product teams testing whether the concept reads clearly in spatial context.",
    refined3DPrompt: `${productName}, ${getShape(rawCategory)}, ${getMaterials(rawCategory).join(", ")}, product design render, clean geometry, web AR ready GLB`,
    model: getFallbackModel(rawCategory),
    statuses: {
      analysis: { kind: "ready" },
      asset: usesValidatedAsset
        ? { kind: "ready" }
        : {
            kind: "fallback",
            reason: fallbackReason,
            message: "Using the validated bottle fallback until this category has a tested model.",
          },
      meshy: {
        kind: "disabled",
        reason: "meshy-disabled",
        message: "Custom 3D generation is optional; fallback AR is ready now.",
      },
      storage: { kind: "unavailable", message: "Not saved on this device yet." },
      arCompatibility: { kind: "unknown", message: "Open the AR route on a phone to verify support." },
    },
  };
}
