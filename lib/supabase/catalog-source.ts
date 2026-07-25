import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { requireValidCatalog } from "@/lib/catalog-validation";
import type { CatalogProduct } from "@/lib/catalog-types";
import { mapCatalogRows } from "./catalog-mapper";
import type { Database } from "./database.types";

export type CatalogSource = "bundled" | "unavailable";

export interface CatalogLoadResult {
  readonly products: readonly CatalogProduct[];
  readonly source: CatalogSource;
  readonly retailerCount: number;
}

export async function loadFurnitureCatalog(): Promise<CatalogLoadResult> {
  // The snapshot is the runtime source of truth: it is bundled with the app and
  // survives an offline demo. Supabase refresh is deliberately best-effort and
  // never blocks or replaces a working snapshot on the request path.
  void refreshFromSupabase();
  const products = await loadBundledCatalog();
  if (products.length === 0) {
    return unavailableCatalog();
  }

  return {
    products,
    source: "bundled",
    retailerCount: new Set(products.map((product) => product.retailer)).size,
  };
}

async function loadBundledCatalog(): Promise<readonly CatalogProduct[]> {
  try {
    const snapshot = await readFile(join(process.cwd(), "public", "catalog.json"), "utf8");
    return requireValidCatalog(JSON.parse(snapshot) as unknown);
  } catch {
    return [];
  }
}

async function refreshFromSupabase(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (url === undefined || url.length === 0 || publishableKey === undefined || publishableKey.length === 0) {
    return;
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
      return;
    }

    // Validate the optional refresh response so malformed rows are never used.
    // Publishing it is handled by scripts/catalog/snapshot.ts, not by a request.
    mapCatalogRows(data);
  } catch {
    // A remote outage must be invisible to the offline bundled catalog.
  }
}

function unavailableCatalog(): CatalogLoadResult {
  return {
    products: [],
    source: "unavailable",
    retailerCount: 0,
  };
}
