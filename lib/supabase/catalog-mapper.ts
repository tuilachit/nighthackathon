import { requireValidCatalog } from "@/lib/catalog-validation";
import type { CatalogProduct } from "@/lib/catalog-types";
import type { Tables } from "./database.types";

type CatalogProductRow = Tables<"catalog_products">;

export function mapCatalogRows(rows: readonly CatalogProductRow[]): readonly CatalogProduct[] {
  const candidates = rows.map((row) => ({
    id: row.id,
    retailer: row.retailer,
    name: row.name,
    category: row.category,
    priceUsd: row.price_usd,
    dimensions: {
      widthMm: row.width_mm,
      heightMm: row.height_mm,
      depthMm: row.depth_mm,
    },
    materials: row.materials,
    colors: row.colors,
    styles: row.styles,
    keywords: row.keywords,
    imagePath: row.image_url,
    imageSourceUrl: row.image_source_url,
    imageAttribution: row.image_attribution,
    productUrl: row.product_url,
    verification: {
      sourceUrl: row.verification_source_url,
      verifiedAt: row.verified_at,
    },
    ...mapModel(row),
  }));

  return requireValidCatalog(candidates);
}

function mapModel(
  row: CatalogProductRow,
): Pick<CatalogProduct, "model"> | Record<never, never> {
  if (
    row.glb_path === null ||
    row.native_width_mm === null ||
    row.native_height_mm === null ||
    row.native_depth_mm === null ||
    row.scale_verified !== true
  ) {
    return {};
  }

  return {
    model: {
      glbPath: row.glb_path,
      ...(row.usdz_path === null ? {} : { usdzPath: row.usdz_path }),
      scaleVerified: true,
      nativeDimensionsMm: {
        widthMm: row.native_width_mm,
        heightMm: row.native_height_mm,
        depthMm: row.native_depth_mm,
      },
    },
  };
}
