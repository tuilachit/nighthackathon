import { resolveCategoryModel } from "./assets";
import type { PrototypeCategory, PrototypeSpec } from "./prototype-types";

const categoryKeywords: Record<PrototypeCategory, string[]> = {
  bottle: ["bottle", "hydration", "water", "drink", "gym"],
  lamp: ["lamp", "light", "lighting", "desk light"],
  chair: ["chair", "seat", "stool"],
  box: ["box", "packaging", "case", "container"],
  device: ["device", "tracker", "gadget", "wearable", "phone", "hardware"],
};

export function classifyPrompt(prompt: string): PrototypeCategory {
  const normalized = prompt.toLowerCase();

  for (const [category, keywords] of Object.entries(categoryKeywords) as [PrototypeCategory, string[]][]) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return category;
  }

  return "bottle";
}

export function createPrototypeSpec(prompt: string): PrototypeSpec {
  const category = classifyPrompt(prompt);
  const model = resolveCategoryModel(category);

  return {
    id: "smart-hydration-bottle",
    name: category === "bottle" ? "Smart Hydration Bottle" : `Reality MVP ${category}`,
    prompt,
    category,
    shape: category === "bottle" ? "Tall cylindrical body with screw cap and grip band" : "Compact product form mapped to the validated bottle fallback for demo reliability",
    materials: category === "bottle" ? ["Tritan body", "Silicone grip", "Anodized aluminum cap"] : ["Prototype material", "Matte finish", "AR-safe fallback asset"],
    features: category === "bottle"
      ? ["LED hydration reminder", "Gym-friendly grip", "Refill tracking", "Companion app concept"]
      : ["Spatial prototype preview", "Feature callouts", "Fallback AR reveal"],
    intendedUse: category === "bottle" ? "Daily hydration tracking for gym-goers and athletes" : "Fast spatial validation before committing to a full build",
    refined3DPrompt: buildRefinedPrompt(prompt, category),
    model,
    meshy: { state: "disabled", reason: "meshy-disabled" },
    fallbackReason: model.category === category ? "none" : "unsupported-category",
  };
}

function buildRefinedPrompt(prompt: string, category: PrototypeCategory): string {
  return [
    `Create a clean product-prototype 3D model for a ${category}.`,
    "Use the uploaded sketch as the silhouette anchor when available.",
    `User intent: ${prompt}`,
    "Single object, centered, realistic materials, no background, suitable for mobile AR preview.",
  ].join(" ");
}
