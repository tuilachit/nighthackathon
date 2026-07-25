import type { PlacementCandidate } from "@/components/xr/XRPlacementClient";
import type { CatalogProduct, FitEvaluation } from "./catalog-types";
import { formatFitLabel } from "./fit-engine";

/**
 * Bridges the search/catalog domain (lib/catalog-types.ts) to the AR placement
 * domain (lib/model-scaling.ts + XRPlacementClient/ProductQuickLookViewer).
 * A catalog product's model is only trusted at native scale when the catalog
 * itself marked it `scaleVerified: true` — everything else falls back to the
 * shared placeholder box stretched to the product's verified dimensions.
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
