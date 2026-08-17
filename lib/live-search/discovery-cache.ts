import "server-only";

import { sha256Hex, stableJson } from "./hashing";
import type { LiveSearchIntent } from "./types";
import { canonicalizePublicProductUrl } from "./url-security";

export const DISCOVERY_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
export const EXTRACTION_SCHEMA_VERSION = 2;

export interface DiscoveryCacheIdentity {
  readonly key: string;
  readonly canonicalIntent: Readonly<Record<string, unknown>>;
  readonly extractionSchemaVersion: number;
}

/** Builds an exact cross-user cache key without including a user's measurement. */
export function buildDiscoveryCacheIdentity(intent: LiveSearchIntent): DiscoveryCacheIdentity {
  const canonicalIntent = intent.kind === "prompt"
    ? {
        kind: "prompt",
        text: normalizePrompt(intent.text),
        retailers: [...new Set(intent.retailers)].sort(),
      }
    : {
        kind: "product-link",
        url: canonicalizePublicProductUrl(intent.url),
      };
  const extractionSchemaVersion = EXTRACTION_SCHEMA_VERSION;
  return {
    key: sha256Hex(stableJson({ canonicalIntent, extractionSchemaVersion })),
    canonicalIntent,
    extractionSchemaVersion,
  };
}

export function isRecentDiscoveryObservation(
  observedAt: string,
  now = Date.now(),
): boolean {
  const timestamp = Date.parse(observedAt);
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= DISCOVERY_CACHE_TTL_MS;
}

export function normalizePrompt(value: string): string {
  return value.trim().toLocaleLowerCase("en-AU").replace(/\s+/g, " ");
}
