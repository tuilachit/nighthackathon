import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CatalogProduct } from "../../lib/catalog-types";
import { requireValidCatalog } from "../../lib/catalog-validation";
import {
  discoverIkeaProducts,
  IKEA_CATEGORY_URLS,
  parseIkeaProduct,
} from "./ingestion/ikea";
import { ScrapingAntClient } from "./ingestion/scrapingant";
import type { ProductCandidate, ProductDiscoveryTarget } from "./ingestion/types";

const OUTPUT_PATH = resolve(process.cwd(), "public/catalog.json");
const TEMP_OUTPUT_PATH = `${OUTPUT_PATH}.tmp`;

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const scraper = new ScrapingAntClient(requiredEnvironment("SCRAPINGANT_API_KEY"));
  const categoryPages = await Promise.all(
    IKEA_CATEGORY_URLS.map((url) => scraper.fetchText(url)),
  );
  const targets = deduplicateTargets(categoryPages.flatMap(discoverIkeaProducts));
  const products = [...(await readExistingCatalog())];
  const knownIds = new Set(products.map((product) => product.id));

  for (const target of targets) {
    try {
      const html = await scraper.fetchText(target.productUrl);
      const candidate = parseIkeaProduct(html);
      if (candidate === undefined) {
        continue;
      }

      const product = toCatalogProduct(candidate, target);
      if (knownIds.has(product.id)) {
        continue;
      }

      const nextProducts = requireValidCatalog([...products, product]);
      await writeCatalog(nextProducts);
      products.push(product);
      knownIds.add(product.id);
      console.log(`IKEA snapshot: ${products.length} valid products.`);
    } catch (error) {
      console.warn(
        `IKEA skipped ${target.externalId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function toCatalogProduct(
  candidate: ProductCandidate,
  target: ProductDiscoveryTarget,
): CatalogProduct {
  return {
    id: `ikea-${candidate.externalId.toLowerCase()}`,
    retailer: "IKEA",
    name: candidate.name,
    category: candidate.category,
    priceUsd: candidate.priceUsd,
    dimensions: candidate.dimensions,
    materials: candidate.materials,
    colors: candidate.colors,
    styles: candidate.styles,
    keywords: candidate.keywords,
    imagePath: candidate.imageSourceUrl,
    imageSourceUrl: candidate.imageSourceUrl,
    imageAttribution: "IKEA product photo",
    productUrl: target.productUrl,
    verification: {
      sourceUrl: target.productUrl,
      verifiedAt: new Date().toISOString(),
    },
  };
}

async function readExistingCatalog(): Promise<readonly CatalogProduct[]> {
  try {
    return requireValidCatalog(JSON.parse(await readFile(OUTPUT_PATH, "utf8")) as unknown);
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
}

async function writeCatalog(products: readonly CatalogProduct[]): Promise<void> {
  await writeFile(TEMP_OUTPUT_PATH, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  await rename(TEMP_OUTPUT_PATH, OUTPUT_PATH);
}

function deduplicateTargets(
  targets: readonly ProductDiscoveryTarget[],
): readonly ProductDiscoveryTarget[] {
  return [...new Map(targets.map((target) => [target.externalId, target])).values()];
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
