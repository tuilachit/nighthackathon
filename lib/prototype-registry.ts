import { analyzePromptToPrototype, DEFAULT_PROMPT } from "./analyzer";
import type { PrototypeSpec } from "./prototype-types";

const SMART_HYDRATION_BOTTLE = analyzePromptToPrototype(DEFAULT_PROMPT);

export const SEEDED_PROTOTYPES: readonly PrototypeSpec[] = [SMART_HYDRATION_BOTTLE];

export function getSeededPrototype(id: string): PrototypeSpec | undefined {
  return SEEDED_PROTOTYPES.find((prototype) => prototype.id === id);
}

export function getDefaultPrototype(): PrototypeSpec {
  return SMART_HYDRATION_BOTTLE;
}

export function listSeededPrototypes(): readonly PrototypeSpec[] {
  return SEEDED_PROTOTYPES;
}
