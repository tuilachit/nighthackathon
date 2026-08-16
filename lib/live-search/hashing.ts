import "server-only";

import { createHash } from "node:crypto";

/** Produces the stable SHA-256 keys used for commands, observations, and assets. */
export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (typeof value === "object" && value !== null) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortKeys((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}
