import { analyzePromptToPrototype, DEFAULT_PROMPT } from "./analyzer";
import type { PrototypeSpec } from "./prototype-types";

const SMART_HYDRATION_BOTTLE = analyzePromptToPrototype(DEFAULT_PROMPT);

export const SEEDED_PROTOTYPES: readonly PrototypeSpec[] = [SMART_HYDRATION_BOTTLE];

export function getSeededPrototype(id: string): PrototypeSpec | undefined {
  return SEEDED_PROTOTYPES.find((prototype) => prototype.id === id);
}

export function getPrototypeForRoute(id: string): PrototypeSpec {
  return getSeededPrototype(id) ?? createRouteFallbackPrototype(id);
}

export function getDefaultPrototype(): PrototypeSpec {
  return SMART_HYDRATION_BOTTLE;
}

export function listSeededPrototypes(): readonly PrototypeSpec[] {
  return SEEDED_PROTOTYPES;
}

function createRouteFallbackPrototype(id: string): PrototypeSpec {
  const readableName = titleizeSlug(id);
  const prompt =
    readableName === "Reality MVP Prototype"
      ? "A product concept captured in Reality MVP."
      : `A product concept named ${readableName}.`;
  const spec = analyzePromptToPrototype(prompt);

  return {
    ...spec,
    id,
    name: readableName,
    prompt,
    statuses: {
      ...spec.statuses,
      storage: {
        kind: "unavailable",
        message: "Open the create screen on this device to generate and save the full prototype.",
      },
    },
  };
}

function titleizeSlug(id: string): string {
  const words = id
    .split("-")
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return "Reality MVP Prototype";
  }

  return words.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
}
