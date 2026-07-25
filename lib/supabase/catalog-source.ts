import "server-only";

import { createClient } from "@supabase/supabase-js";
import { FURNITURE_CATALOG } from "@/lib/catalog";
import type { CatalogProduct } from "@/lib/catalog-types";
import { mapCatalogRows } from "./catalog-mapper";
import type { Database } from "./database.types";

const DEFAULT_MINIMUM_ONLINE_PRODUCTS = 100;
const REQUIRED_RETAILER_COUNT = 3;

export type CatalogSource = "supabase" | "fallback";

export interface CatalogLoadResult {
  readonly products: readonly CatalogProduct[];
  readonly source: CatalogSource;
  readonly retailerCount: number;
}

export async function loadFurnitureCatalog(): Promise<CatalogLoadResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (url === undefined || url.length === 0 || publishableKey === undefined || publishableKey.length === 0) {
    return fallbackCatalog();
  }

  try {
    const client = createClient<Database>(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const { data, error } = await client
      .from("catalog_products")
      .select("*")
      .order("id")
      .limit(500);

    if (error !== null || data === null) {
      return fallbackCatalog();
    }

    const products = mapCatalogRows(data);
    const retailerCount = new Set(products.map((product) => product.retailer)).size;
    if (products.length < minimumOnlineProducts() || retailerCount < REQUIRED_RETAILER_COUNT) {
      return fallbackCatalog();
    }

    return {
      products,
      source: "supabase",
      retailerCount,
    };
  } catch {
    return fallbackCatalog();
  }
}

function fallbackCatalog(): CatalogLoadResult {
  return {
    products: FURNITURE_CATALOG,
    source: "fallback",
    retailerCount: new Set(FURNITURE_CATALOG.map((product) => product.retailer)).size,
  };
}

function minimumOnlineProducts(): number {
  const configured = Number.parseInt(process.env.SUPABASE_CATALOG_MIN_PRODUCTS ?? "", 10);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MINIMUM_ONLINE_PRODUCTS;
}
