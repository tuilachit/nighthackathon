/**
 * Extract catalog products for the storage-furniture URLs enumerated from the
 * retailer sitemaps, validate them through the same gate the live path uses, and
 * emit DB-ready rows. Writing to Supabase is done separately (the local secret
 * key is not available), so this stage is pure extraction + validation and never
 * touches the database.
 *
 *   NODE_OPTIONS=--conditions=react-server \
 *     npx tsx scripts/catalog/au-catalog/backfill.ts \
 *       --category bookcase --per-retailer 30 --output catalog-products.json
 */
import { writeFileSync } from "node:fs";
import { loadCatalogEnv } from "./env";
loadCatalogEnv();

import {
  parseSitemapUrls,
  selectCatalogCandidates,
  type CatalogCategory,
  type CatalogUrlCandidate,
} from "@/lib/live-search/catalog/enumerate";
import { buildCatalogObservation } from "@/lib/live-search/catalog/ingest";
import { extractProductWithFirecrawl } from "@/lib/live-search/providers/firecrawl";
import { validateBrowserSearchOutput } from "@/lib/live-search/validation";
import { sha256Hex, stableJson } from "@/lib/live-search/hashing";
import type { LiveRetailer } from "@/lib/live-search/types";
import { gunzipSync } from "node:zlib";

const CONCURRENCY = 2; // The Firecrawl plan's maxConcurrency; exceeding it queues and times out.

const SITEMAP_INDEXES: readonly { readonly retailer: LiveRetailer; readonly index: string; readonly productSitemap: RegExp }[] = [
  { retailer: "ikea-au", index: "https://www.ikea.com/sitemaps/sitemap.xml", productSitemap: /prod-en-AU_\d+\.xml/i },
  { retailer: "kmart-au", index: "https://www.kmart.com.au/sitemap-index.xml", productSitemap: /product-sitemap[^<]*\.xml/i },
];

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FitmentCatalog/1.0)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`GET ${url} -> HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return gunzipSync(buffer).toString("utf8");
  }
  return buffer.toString("utf8");
}

async function enumerateCandidates(category: CatalogCategory, perRetailer: number): Promise<readonly CatalogUrlCandidate[]> {
  const selected: CatalogUrlCandidate[] = [];
  for (const source of SITEMAP_INDEXES) {
    const indexXml = await fetchText(source.index);
    const sitemaps = parseSitemapUrls(indexXml).filter((u) => source.productSitemap.test(u));
    // Gather every candidate for this category across all of the retailer's
    // sitemaps, then sample evenly. Taking the first N in file order lets a
    // single product family (e.g. IKEA SMASTAD) dominate the pool; an even
    // stride spreads selection across series so slim, cheap bookcases appear
    // alongside the large ones.
    const all: CatalogUrlCandidate[] = [];
    for (const sitemap of sitemaps) {
      const candidates = selectCatalogCandidates(parseSitemapUrls(await fetchText(sitemap)))
        .filter((c) => c.retailer === source.retailer && c.categoryHint === category);
      all.push(...candidates);
    }
    if (all.length <= perRetailer) {
      selected.push(...all);
      continue;
    }
    const stride = all.length / perRetailer;
    for (let i = 0; i < perRetailer; i += 1) {
      const candidate = all[Math.floor(i * stride)];
      if (candidate !== undefined) {
        selected.push(candidate);
      }
    }
  }
  return selected;
}

async function firecrawlCredits(): Promise<number | undefined> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/team/credit-usage", {
      headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY ?? ""}` },
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as { data?: { remainingCredits?: number } };
    return json.data?.remainingCredits;
  } catch {
    return undefined;
  }
}

interface CatalogRow {
  readonly product: { readonly retailer: LiveRetailer; readonly retailer_product_id: string; readonly canonical_url: string };
  readonly snapshot: Readonly<Record<string, unknown>>;
}

async function main(): Promise<void> {
  const category = arg("category", "bookcase") as CatalogCategory;
  const perRetailer = Number.parseInt(arg("per-retailer", "30"), 10);
  const output = arg("output", "catalog-products.json");
  const pageTimeoutMs = Number.parseInt(arg("page-timeout", "45000"), 10);
  const observedAt = new Date().toISOString();

  const creditsBefore = await firecrawlCredits();
  console.log(`Enumerating ${category} (<=${perRetailer}/retailer)...`);
  const candidates = await enumerateCandidates(category, perRetailer);
  console.log(`${candidates.length} candidates. Credits before: ${creditsBefore ?? "?"}\n`);

  const rows: CatalogRow[] = [];
  const rejections: Record<string, number> = {};
  let attempted = 0;
  const queue = [...candidates];

  const worker = async (): Promise<void> => {
    for (;;) {
      const candidate = queue.shift();
      if (candidate === undefined) return;
      attempted += 1;
      const label = candidate.canonicalUrl.split("/").pop() ?? candidate.canonicalUrl;
      try {
        const extraction = await extractProductWithFirecrawl(candidate.canonicalUrl, fetch, pageTimeoutMs);
        const built = buildCatalogObservation({
          retailer: candidate.retailer,
          categoryHint: candidate.categoryHint,
          extraction,
          markdown: extraction.markdown,
          observedAt,
        });
        if (!built.ok) {
          rejections[built.reason] = (rejections[built.reason] ?? 0) + 1;
          console.log(`  reject ${label}: ${built.reason}`);
          continue;
        }
        const validated = validateBrowserSearchOutput({ products: [built.observation], partial: false, notes: [] });
        const observation = validated.value?.products[0];
        if (!validated.ok || observation === undefined) {
          const reason = validated.errors[0] ?? "validation_failed";
          rejections[reason] = (rejections[reason] ?? 0) + 1;
          console.log(`  reject ${label}: ${reason}`);
          continue;
        }
        const { observedAt: _omit, ...facts } = observation as unknown as Record<string, unknown>;
        void _omit;
        const contentHash = sha256Hex(stableJson(facts));
        rows.push({
          product: {
            retailer: candidate.retailer,
            retailer_product_id: String(observation.retailerProductId),
            canonical_url: candidate.canonicalUrl,
          },
          snapshot: { ...observation, content_hash: contentHash, category_hint: candidate.categoryHint },
        });
        console.log(`  store  ${label}: ${observation.name} $${(observation.priceMinor / 100).toFixed(2)} ${observation.assembledDimensions.widthMm}x${observation.assembledDimensions.heightMm}x${observation.assembledDimensions.depthMm}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const reason = message.includes("HTTP 429") ? "rate_limited" : message.includes("SCRAPE_TIMEOUT") ? "scrape_timeout" : "error";
        rejections[reason] = (rejections[reason] ?? 0) + 1;
        console.log(`  reject ${label}: ${reason}`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const creditsAfter = await firecrawlCredits();
  writeFileSync(output, JSON.stringify(rows, null, 1));
  console.log(`\nAttempted ${attempted}, stored ${rows.length}. Wrote ${output}`);
  console.log("Rejections:", JSON.stringify(rejections));
  console.log(`Credits: ${creditsBefore ?? "?"} -> ${creditsAfter ?? "?"} (spent ${creditsBefore !== undefined && creditsAfter !== undefined ? creditsBefore - creditsAfter : "?"})`);
  const perRetailerStored = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.product.retailer] = (acc[r.product.retailer] ?? 0) + 1;
    return acc;
  }, {});
  console.log("Stored per retailer:", JSON.stringify(perRetailerStored));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
