import type { FurnitureCategory, ProductDimensions } from "../../../lib/catalog-types";
import type { Json } from "../../../lib/supabase/database.types";

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
  readonly variantLabel?: string;
  readonly variantOptions: Readonly<Record<string, string>>;
  readonly sourcePayload: Json;
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
