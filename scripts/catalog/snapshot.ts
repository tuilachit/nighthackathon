import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { mapCatalogRows } from "../../lib/supabase/catalog-mapper";
import type { Database, Tables } from "../../lib/supabase/database.types";

const OUTPUT_PATH = resolve(process.cwd(), "public/catalog.json");

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const url = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const client = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const { data, error } = await client.from("catalog_products").select("*").order("id").limit(1_000);
  if (error !== null || data === null) {
    throw new Error(`Could not read catalog snapshot: ${error?.message ?? "empty response"}`);
  }

  const products = data.flatMap((row) => validatedProduct(row));
  if (products.length === 0) {
    throw new Error("Supabase contains no dimension-validated products; existing snapshot was left unchanged.");
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(products, null, 2)}\n`, "utf8");

  const counts = products.reduce<Record<string, number>>((summary, product) => {
    summary[product.retailer] = (summary[product.retailer] ?? 0) + 1;
    return summary;
  }, {});
  console.log(`Wrote ${products.length} validated products to public/catalog.json.`);
  for (const retailer of ["IKEA", "Target", "Wayfair"]) {
    console.log(`${retailer}: ${counts[retailer] ?? 0}`);
  }
}

function validatedProduct(row: Tables<"catalog_products">) {
  try {
    return mapCatalogRows([row]);
  } catch {
    return [];
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
