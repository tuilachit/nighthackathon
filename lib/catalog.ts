import rawCatalog from "@/public/data/catalog.json";
import { requireValidCatalog } from "./catalog-validation";
import type { CatalogProduct } from "./catalog-types";

export const FURNITURE_CATALOG: readonly CatalogProduct[] = requireValidCatalog(rawCatalog);
