import type { PrototypeSpec, StorageStatus } from "./prototype-types";

const STORAGE_PREFIX = "reality-mvp:prototype:";
const LATEST_PROTOTYPE_ID_KEY = "reality-mvp:latest-prototype-id";
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
    window.localStorage.setItem(LATEST_PROTOTYPE_ID_KEY, spec.id);
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
    return parseStoredPrototype(storedValue);
  } catch {
    return undefined;
  }
}

export function loadLatestPrototypeFromLocalStorage(): PrototypeSpec | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const latestId = window.localStorage.getItem(LATEST_PROTOTYPE_ID_KEY);
    if (latestId !== null) {
      const latestPrototype = loadPrototypeFromLocalStorage(latestId);
      if (latestPrototype !== undefined) {
        return latestPrototype;
      }
    }

    return scanForBestStoredPrototype();
  } catch {
    return undefined;
  }
}

export function loadPrototypeForRouteFromLocalStorage(id: string): PrototypeSpec | undefined {
  const routePrototype = loadPrototypeFromLocalStorage(id);
  const latestPrototype = loadLatestPrototypeFromLocalStorage();

  if (routePrototype === undefined) {
    return latestPrototype;
  }

  if (latestPrototype !== undefined && !hasGeneratedOrPendingModel(routePrototype) && hasGeneratedOrPendingModel(latestPrototype)) {
    return latestPrototype;
  }

  return routePrototype;
}

function scanForBestStoredPrototype(): PrototypeSpec | undefined {
  let generatedOrPendingPrototype: PrototypeSpec | undefined;
  let firstValidPrototype: PrototypeSpec | undefined;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key === null || !key.startsWith(STORAGE_PREFIX)) {
      continue;
    }

    const prototype = parseStoredPrototype(window.localStorage.getItem(key));
    if (prototype === undefined) {
      continue;
    }

    firstValidPrototype ??= prototype;

    if (prototype.model.remoteModelUrl !== undefined || prototype.statuses.meshy.kind === "succeeded") {
      return prototype;
    }

    if (generatedOrPendingPrototype === undefined && hasGeneratedOrPendingModel(prototype)) {
      generatedOrPendingPrototype = prototype;
    }
  }

  return generatedOrPendingPrototype ?? firstValidPrototype;
}

function parseStoredPrototype(storedValue: string | null): PrototypeSpec | undefined {
  if (storedValue === null) {
    return undefined;
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue);
    if (!isPrototypeSpec(parsedValue)) {
      return undefined;
    }

    return parsedValue;
  } catch {
    return undefined;
  }
}

function hasGeneratedOrPendingModel(prototype: PrototypeSpec): boolean {
  return (
    prototype.model.remoteModelUrl !== undefined ||
    prototype.model.source === "generated" ||
    prototype.statuses.meshy.kind === "pending" ||
    prototype.statuses.meshy.kind === "succeeded"
  );
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
