import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireValidCatalog } from "@/lib/catalog-validation";
import type { CatalogProduct } from "@/lib/catalog-types";

export type CatalogSource = "bundled" | "unavailable";

export interface CatalogLoadResult {
  readonly products: readonly CatalogProduct[];
  readonly source: CatalogSource;
  readonly retailerCount: number;
}

/**
 * Loads and validates the bundled catalog used by the fit experience.
 *
 * Retailer ingestion is intentionally kept off the request path so the app
 * remains deterministic and usable without external services.
 */
export async function loadFurnitureCatalog(): Promise<CatalogLoadResult> {
  const products = await loadBundledCatalog();
  if (products.length === 0) {
    return {
      products: [],
      source: "unavailable",
      retailerCount: 0,
    };
  }

  return {
    products,
    source: "bundled",
    retailerCount: new Set(products.map((product) => product.retailer)).size,
  };
}

async function loadBundledCatalog(): Promise<readonly CatalogProduct[]> {
  try {
    const snapshot = await readFile(
      join(process.cwd(), "public", "catalog.json"),
      "utf8",
    );
    return requireValidCatalog(JSON.parse(snapshot) as unknown);
  } catch {
    return [];
  }
}
