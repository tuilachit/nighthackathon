import "server-only";

import type { ProductDimensions } from "@/lib/catalog-types";
import { sha256Hex, stableJson } from "./hashing";

export const MODEL_PROCESSING_VERSION = "glb-rescale-v2";
export const MESHY_GENERATION_SETTINGS = {
  aiModel: "meshy-6",
  modelType: "standard",
  enablePbr: true,
  shouldRemesh: true,
  shouldTexture: true,
  targetFormats: ["glb"],
} as const;

interface ModelReuseFacts {
  readonly productSnapshotHash: string;
  readonly sourceImageHash: string;
  readonly dimensions: ProductDimensions;
  readonly meshySettings?: Readonly<Record<string, unknown>>;
  readonly processingVersion?: string;
}

/** Keys reuse only when every fact that affects paid model output is identical. */
export function buildModelReuseKey(input: ModelReuseFacts): string {
  assertSha256(input.productSnapshotHash, "product snapshot");
  assertSha256(input.sourceImageHash, "source image");
  assertDimensions(input.dimensions);
  const processingVersion = input.processingVersion ?? MODEL_PROCESSING_VERSION;
  if (processingVersion.trim().length === 0 || processingVersion.length > 100) {
    throw new Error("Model processing version is invalid.");
  }
  return sha256Hex(stableJson({
    productSnapshotHash: input.productSnapshotHash,
    sourceImageHash: input.sourceImageHash,
    dimensions: input.dimensions,
    meshySettings: input.meshySettings ?? MESHY_GENERATION_SETTINGS,
    processingVersion,
  }));
}

function assertSha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} hash must be lowercase SHA-256.`);
  }
}

function assertDimensions(value: ProductDimensions): void {
  if ([value.widthMm, value.heightMm, value.depthMm].some((axis) => !Number.isInteger(axis) || axis <= 0 || axis > 10_000)) {
    throw new Error("Model reuse dimensions are invalid.");
  }
}
