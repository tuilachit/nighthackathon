export type MeasurementSource = "webxr" | "manual" | "demo";

export interface SpaceMeasurement {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number;
  readonly uncertaintyMm: number;
  readonly accessWidthMm?: number;
  readonly source: MeasurementSource;
}

export interface ProductDimensions {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number;
}

export interface ClearancePolicy {
  readonly sideMm: number;
  readonly backMm: number;
  readonly topMm: number;
}

export type FurnitureCategory = "bookcase" | "shelving-unit" | "sideboard" | "drawer-unit";

export type Retailer = "IKEA" | "Target" | "Wayfair";

export interface FurnitureQuery {
  readonly category?: FurnitureCategory;
  readonly maxPrice?: number;
  readonly materials: readonly string[];
  readonly colors: readonly string[];
  readonly styles: readonly string[];
  readonly keywords: readonly string[];
}

export interface CatalogVerification {
  readonly sourceUrl: string;
  readonly verifiedAt: string;
}

export type DimensionsSource = "json-ld" | "llm-extracted" | "retailer-api";

export interface CatalogProvenance {
  readonly dimensionsSource: DimensionsSource;
  readonly sourceUrl: string;
  readonly extractedAt: string;
  readonly confidence: "high";
}

export interface ProductModelAsset {
  readonly glbPath: string;
  readonly usdzPath?: string;
  readonly scaleVerified: true;
  readonly nativeDimensionsMm: ProductDimensions;
}

export interface CatalogProduct {
  readonly id: string;
  readonly retailer: Retailer;
  readonly name: string;
  readonly category: FurnitureCategory;
  readonly priceUsd: number;
  readonly dimensions: ProductDimensions;
  readonly materials: readonly string[];
  readonly colors: readonly string[];
  readonly styles: readonly string[];
  readonly keywords: readonly string[];
  readonly imagePath: string;
  readonly imageSourceUrl?: string;
  readonly imageAttribution?: string;
  readonly productUrl: string;
  readonly verification: CatalogVerification;
  readonly provenance: CatalogProvenance;
  readonly model?: ProductModelAsset;
}

export type ProductOrientation = "default" | "rotated-90";

export interface FitEvaluation {
  readonly fits: boolean;
  readonly orientation: ProductOrientation;
  readonly widthClearanceMm: number;
  readonly heightClearanceMm: number;
  readonly depthClearanceMm: number;
  readonly minimumClearanceMm: number;
  readonly confidence: "high" | "medium" | "low";
  readonly reasons: readonly string[];
}

export type ProductAxis = "width" | "depth" | "height";

export interface AccessCrossSectionDimension {
  readonly axis: ProductAxis;
  readonly sizeMm: number;
}

export type AccessEvaluation =
  | {
      readonly status: "skipped";
      readonly passes: true;
      readonly reason?: never;
    }
  | {
      readonly status: "passed";
      readonly passes: true;
      readonly accessWidthMm: number;
      readonly crossSection: readonly [AccessCrossSectionDimension, AccessCrossSectionDimension];
      readonly clearanceMm: number;
      readonly reason?: never;
    }
  | {
      readonly status: "failed";
      readonly passes: false;
      readonly accessWidthMm: number;
      readonly crossSection: readonly [AccessCrossSectionDimension, AccessCrossSectionDimension];
      readonly deficitMm: number;
      readonly reason: string;
    };

export interface EvaluatedProduct {
  readonly product: CatalogProduct;
  readonly fit: FitEvaluation;
  readonly access: AccessEvaluation;
  readonly preferenceScore: number;
  readonly matchedPreferences: readonly string[];
}

export interface ProductSearchResults {
  readonly fits: readonly EvaluatedProduct[];
  readonly fitsSpaceButFailsAccess: readonly EvaluatedProduct[];
  readonly nearMisses: readonly EvaluatedProduct[];
}

export interface ProductSelection {
  readonly product: CatalogProduct;
  readonly fit: FitEvaluation;
  readonly access: AccessEvaluation;
}

export interface FitSearchExperienceProps {
  readonly measurement: SpaceMeasurement;
  readonly initialQuery?: string;
  readonly onSelectProduct: (selection: ProductSelection) => void;
}
