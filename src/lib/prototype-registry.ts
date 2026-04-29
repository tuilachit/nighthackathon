import { createPrototypeSpec } from "./analyzer";
import type { PrototypeSpec } from "./prototype-types";

export const DEFAULT_PROMPT = "A smart water bottle for gym users that glows when hydration is low.";
export const DEFAULT_PROTOTYPE_ID = "smart-hydration-bottle";

export const seededPrototypes: Record<string, PrototypeSpec> = {
  [DEFAULT_PROTOTYPE_ID]: createPrototypeSpec(DEFAULT_PROMPT),
};

export function getSeededPrototype(id: string): PrototypeSpec | undefined {
  return seededPrototypes[id];
}
