import type { PrototypeSpec, StorageStatus } from "./prototype-types";

const STORAGE_PREFIX = "reality-mvp:prototype:";
export const LOCAL_PROTOTYPE_UPDATED_EVENT = "reality-mvp:prototype-updated";

function getStorageKey(id: string): string {
  return `${STORAGE_PREFIX}${id}`;
}

export function savePrototypeToLocalStorage(spec: PrototypeSpec): StorageStatus {
  if (typeof window === "undefined") {
    return { kind: "unavailable", message: "Local storage is only available in the browser." };
  }

  try {
    window.localStorage.setItem(getStorageKey(spec.id), JSON.stringify(spec));
    window.dispatchEvent(new CustomEvent(LOCAL_PROTOTYPE_UPDATED_EVENT, { detail: { id: spec.id } }));
    return { kind: "saved", message: "Prototype saved on this device." };
  } catch {
    return { kind: "failed", message: "Could not save this prototype on the device." };
  }
}

export function loadPrototypeFromLocalStorage(id: string): PrototypeSpec | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const storedValue = window.localStorage.getItem(getStorageKey(id));
    if (storedValue === null) {
      return undefined;
    }

    const parsedValue: unknown = JSON.parse(storedValue);
    if (!isPrototypeSpec(parsedValue)) {
      return undefined;
    }

    return parsedValue;
  } catch {
    return undefined;
  }
}

function isPrototypeSpec(value: unknown): value is PrototypeSpec {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PrototypeSpec>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.prompt === "string" &&
    typeof candidate.refined3DPrompt === "string" &&
    typeof candidate.model === "object" &&
    candidate.model !== null &&
    typeof candidate.statuses === "object" &&
    candidate.statuses !== null &&
    typeof candidate.statuses.meshy === "object" &&
    candidate.statuses.meshy !== null &&
    typeof candidate.statuses.meshy.kind === "string"
  );
}
