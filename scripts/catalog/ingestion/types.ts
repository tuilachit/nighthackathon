import type {
  DimensionsSource,
  FurnitureCategory,
  ProductDimensions,
} from "../../../lib/catalog-types";

export type JsonValue =
  | boolean
  | number
  | string
  | null
  | { readonly [key: string]: JsonValue | undefined }
  | readonly JsonValue[];

export type RetailerId = "ikea" | "target" | "wayfair";

export interface ProductCandidate {
  readonly retailerId: RetailerId;
  readonly externalId: string;
  readonly name: string;
  readonly category: FurnitureCategory;
  readonly priceUsd: number;
  readonly dimensions: ProductDimensions;
  readonly materials: readonly string[];
  readonly colors: readonly string[];
  readonly styles: readonly string[];
  readonly keywords: readonly string[];
  readonly imageSourceUrl: string;
  readonly imageAltText: string;
  readonly productUrl: string;
  readonly verificationSourceUrl: string;
  readonly dimensionsSource: DimensionsSource;
  readonly extractedAt: string;
  readonly confidence: "high";
  readonly variantLabel?: string;
  readonly variantOptions: Readonly<Record<string, string>>;
  readonly sourcePayload: JsonValue;
}

export interface ProductDiscoveryTarget {
  readonly externalId: string;
  readonly productUrl: string;
}

export interface ScrapingRequestOptions {
  readonly renderJs?: boolean;
  readonly useResidentialProxy?: boolean;
  readonly waitForSelector?: string;
}
