import "server-only";

import { createHmac } from "node:crypto";

export const PRODUCT_EVENT_NAMES = [
  "measurement_completed",
  "search_submitted",
  "search_acknowledged",
  "cache_hit",
  "results_presented",
  "comparison_opened",
  "candidate_approved",
  "model_ready",
  "retailer_outbound",
  "share_created",
  "recovery_used",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

interface EventRule {
  readonly keys: Readonly<Record<string, readonly (string | number | boolean)[] | "boolean">>;
}

const EVENT_RULES: Readonly<Record<ProductEventName, EventRule>> = {
  measurement_completed: {
    keys: {
      source: ["manual", "demo", "webxr"],
      unit: ["mm", "cm"],
      access_provided: "boolean",
      duration_bucket: ["under_20s", "20_60s", "over_60s"],
    },
  },
  search_submitted: {
    keys: {
      intent: ["prompt", "product_link"],
      retailer_count: [0, 1, 2],
      cache_policy: ["prefer_recent", "force_refresh"],
    },
  },
  search_acknowledged: { keys: { latency_bucket: ["under_1s", "1_3s", "over_3s"] } },
  cache_hit: { keys: { age_bucket: ["under_1h", "1_6h", "6_24h"] } },
  results_presented: {
    keys: {
      coverage: ["full", "partial"],
      fits_bucket: ["0", "1_3", "4_6", "7_plus"],
      access_bucket: ["0", "1_3", "4_plus"],
      near_bucket: ["0", "1_3", "4_plus"],
      latency_bucket: ["under_10s", "10_30s", "30_60s", "over_60s"],
    },
  },
  comparison_opened: {
    keys: {
      selection: ["default", "manual"],
      count: [1, 2, 3],
      cross_retailer: "boolean",
    },
  },
  candidate_approved: {
    keys: {
      retailer: ["ikea-au", "kmart-au", "other"],
      rank_bucket: ["1", "2_3", "4_plus"],
    },
  },
  model_ready: {
    keys: {
      kind: ["glb", "usdz"],
      latency_bucket: ["under_2m", "2_5m", "over_5m"],
      scale_verified: [true],
      reused: "boolean",
    },
  },
  retailer_outbound: {
    keys: {
      retailer: ["ikea-au", "kmart-au", "other"],
      surface: ["card", "comparison", "model"],
      tier: ["fits", "access_issue", "near_miss"],
    },
  },
  share_created: { keys: { surface: ["link", "qr"], compared_count: [1, 2, 3] } },
  recovery_used: {
    keys: {
      stage: ["search", "generation", "share", "session"],
      action: ["retry_status", "cancel", "restart", "refresh"],
      failure: ["network", "provider", "expired", "unauthorized", "invalid", "unknown"],
    },
  },
};

export interface ValidatedProductEvent {
  readonly name: ProductEventName;
  readonly journeyToken: string;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

/** Strictly allowlists funnel-event names, fields, and values. */
export function validateProductEvent(input: unknown): ValidatedProductEvent {
  if (!isRecord(input) || !PRODUCT_EVENT_NAMES.includes(input.name as ProductEventName)) {
    throw new Error("Unsupported product event.");
  }
  if (typeof input.journeyToken !== "string" || !/^[A-Za-z0-9_-]{22,96}$/.test(input.journeyToken)) {
    throw new Error("Invalid journey token.");
  }
  if (!isRecord(input.properties)) {
    throw new Error("Product event properties must be an object.");
  }
  const name = input.name as ProductEventName;
  const rules = EVENT_RULES[name].keys;
  const properties: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input.properties)) {
    const allowed = rules[key];
    if (allowed === undefined) {
      throw new Error(`Property ${key} is not allowed for ${name}.`);
    }
    if (allowed === "boolean") {
      if (typeof value !== "boolean") {
        throw new Error(`Property ${key} must be boolean.`);
      }
    } else if (!allowed.some((candidate) => candidate === value)) {
      throw new Error(`Property ${key} has an unsupported value.`);
    }
    properties[key] = value as string | number | boolean;
  }
  return { name, journeyToken: input.journeyToken, properties };
}

/** Produces a daily, unlinkable event identifier without storing the raw token. */
export function hashJourneyToken(token: string, secret: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return createHmac("sha256", secret).update(`${day}:${token}`).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
