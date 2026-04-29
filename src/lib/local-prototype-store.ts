"use client";

import type { PrototypeSpec } from "./prototype-types";

const keyPrefix = "reality-mvp:prototype:";

export function saveLocalPrototype(spec: PrototypeSpec): boolean {
  try {
    window.localStorage.setItem(`${keyPrefix}${spec.id}`, JSON.stringify(spec));
    return true;
  } catch {
    return false;
  }
}

export function loadLocalPrototype(id: string): PrototypeSpec | null {
  try {
    const raw = window.localStorage.getItem(`${keyPrefix}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as PrototypeSpec;
  } catch {
    return null;
  }
}
