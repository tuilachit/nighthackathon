import type { LiveProductObservation } from "@/lib/live-search/types";
import { assertControlledCacheImage, type ControlledImageFacts } from "@/lib/live-search/controlled-image";

/**
 * A served snapshot records our cached copy as its display image, with the
 * retailer original preserved in sourceImageUrl. The validation gate judges
 * imageUrl against the retailer's image hosts — that is the fact we can
 * defend — so stored rows must be validated with the retailer original
 * swapped back in, and only then wear the verified cached copy again.
 *
 * Without this swap, every serve poisoned the rows it touched: the recorded
 * snapshot's imageUrl was our storage host, the next read rejected it against
 * the retailer allowlist, and the catalog burned down as it was used ("study
 * desk" found one desk left out of twenty-five).
 */

interface CachedImageClaim {
  readonly cachedUrl: string;
  readonly hash: string;
}

export interface PreparedCatalogRows {
  /** Rows with the retailer original as imageUrl, ready for the validation gate. */
  readonly rows: readonly unknown[];
  /** Cached-copy claims by "<retailerKey>:<retailerProductId>", verified at restore. */
  readonly cachedImages: ReadonlyMap<string, CachedImageClaim>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function claimKey(retailerKey: string, retailerProductId: string): string {
  return `${retailerKey}:${retailerProductId}`;
}

/** Swaps each stored row's display image for its retailer original before validation. */
export function prepareCatalogRowsForValidation(rows: readonly unknown[]): PreparedCatalogRows {
  const cachedImages = new Map<string, CachedImageClaim>();
  const prepared = rows.map((row) => {
    if (
      !isRecord(row) ||
      typeof row.imageUrl !== "string" ||
      typeof row.sourceImageUrl !== "string" ||
      typeof row.sourceImageHash !== "string" ||
      typeof row.retailerProductId !== "string" ||
      !isRecord(row.retailer) ||
      typeof row.retailer.key !== "string"
    ) {
      return row;
    }
    cachedImages.set(claimKey(row.retailer.key, row.retailerProductId), {
      cachedUrl: row.imageUrl,
      hash: row.sourceImageHash,
    });
    return { ...row, imageUrl: row.sourceImageUrl };
  });
  return { rows: prepared, cachedImages };
}

/**
 * Restores the verified cached copy onto validated products, carrying the
 * provenance pair downstream. A claim that fails verification leaves the
 * product on its already-validated retailer image, so a bad claim can only
 * cost us a recache, never serve an uncontrolled URL.
 */
export function restoreCachedCatalogImages(
  products: readonly LiveProductObservation[],
  cachedImages: ReadonlyMap<string, CachedImageClaim>,
  expectedOrigin: string,
): readonly LiveProductObservation[] {
  return products.map((product) => {
    const claim = cachedImages.get(claimKey(product.retailer.key, product.retailerProductId));
    if (claim === undefined) {
      return product;
    }
    try {
      assertControlledCacheImage(claim.cachedUrl, claim.hash, expectedOrigin);
    } catch {
      return product;
    }
    return {
      ...product,
      imageUrl: claim.cachedUrl,
      sourceImageUrl: product.imageUrl,
      sourceImageHash: claim.hash,
    } as LiveProductObservation & ControlledImageFacts;
  });
}
