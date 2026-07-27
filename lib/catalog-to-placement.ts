import type { PlacementCandidate } from "./model-scaling";
import type { CatalogProduct, FitEvaluation } from "./catalog-types";
import { formatFitLabel } from "./fit-engine";

/** Descriptive text-to-3d prompt built from the catalog's own verified attributes. */
export function buildMeshyPromptForProduct(product: CatalogProduct): string {
  return [product.name, product.category.replace("-", " "), ...product.materials, ...product.colors, ...product.styles]
    .filter((value) => value.trim().length > 0)
    .join(", ");
}

/**
 * Bridges a verified search result to the AR viewer. Unmodelled products use a
 * unit box scaled to the catalog dimensions rather than an invented shape.
 */
export function catalogProductToPlacementCandidate(
  product: CatalogProduct,
  fit: FitEvaluation,
): PlacementCandidate {
  return {
    id: product.id,
    name: product.name,
    retailer: product.retailer,
    priceLabel: `$${product.priceUsd.toFixed(2)}`,
    retailerUrl: product.productUrl,
    fitLabel: formatFitLabel(fit),
    model: {
      dimensions: product.dimensions,
      glbUrl: product.model?.glbPath,
      iosUsdzUrl: product.model?.usdzPath,
      placeholderBoxGlbUrl: "/models/unit-box.glb",
      scaleSource: "verified",
    },
  };
}
