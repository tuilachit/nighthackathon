/**
 * Enumerate storage-furniture product URLs from the retailers' own sitemaps and
 * upsert them into private.catalog_urls. Sitemaps are free, so this costs no
 * Firecrawl credits. Idempotent: re-running only adds newly published products.
 *
 *   NODE_OPTIONS=--conditions=react-server \
 *     npx tsx --env-file-if-exists=.env.local scripts/catalog/au-catalog/enumerate.ts
 */
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { loadCatalogEnv } from "./env";
import {
  parseSitemapUrls,
  selectCatalogCandidates,
  type CatalogUrlCandidate,
} from "@/lib/live-search/catalog/enumerate";

loadCatalogEnv();

const RETAILER_SITEMAP_INDEXES: readonly { readonly label: string; readonly index: string; readonly productSitemap: RegExp }[] = [
  { label: "ikea-au", index: "https://www.ikea.com/sitemaps/sitemap.xml", productSitemap: /prod-en-AU_\d+\.xml/i },
  { label: "kmart-au", index: "https://www.kmart.com.au/sitemap-index.xml", productSitemap: /product-sitemap[^<]*\.xml/i },
];

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FitmentCatalog/1.0)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`GET ${url} -> HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  // A .xml.gz body, or one served without a decompressing content-encoding,
  // begins with the gzip magic bytes.
  if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return gunzipSync(buffer).toString("utf8");
  }
  return buffer.toString("utf8");
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main(): Promise<void> {
  const all: CatalogUrlCandidate[] = [];
  for (const source of RETAILER_SITEMAP_INDEXES) {
    let productSitemaps: readonly string[];
    try {
      const indexXml = await fetchText(source.index);
      productSitemaps = parseSitemapUrls(indexXml).filter((u) => source.productSitemap.test(u));
    } catch (error) {
      console.error(`[${source.label}] could not read sitemap index: ${String(error)}`);
      continue;
    }
    console.log(`[${source.label}] ${productSitemaps.length} product sitemaps`);
    for (const sitemapUrl of productSitemaps) {
      try {
        const xml = await fetchText(sitemapUrl);
        const candidates = selectCatalogCandidates(parseSitemapUrls(xml));
        all.push(...candidates);
        console.log(`  ${sitemapUrl.split("/").pop()}: +${candidates.length} storage products`);
      } catch (error) {
        console.error(`  ${sitemapUrl}: ${String(error)}`);
      }
    }
  }

  // De-duplicate across sitemaps by canonical URL.
  const byUrl = new Map<string, CatalogUrlCandidate>();
  for (const candidate of all) {
    byUrl.set(candidate.canonicalUrl, candidate);
  }
  const unique = [...byUrl.values()];
  const perCategory = unique.reduce<Record<string, number>>((acc, c) => {
    acc[`${c.retailer}:${c.categoryHint}`] = (acc[`${c.retailer}:${c.categoryHint}`] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\nTotal unique storage products: ${unique.length}`);
  console.log(JSON.stringify(perCategory, null, 1));

  if (process.argv.includes("--dry-run")) {
    console.log("\n--dry-run: not writing to the database.");
    return;
  }

  const supabase = adminClient();
  let inserted = 0;
  for (let i = 0; i < unique.length; i += 500) {
    const batch = unique.slice(i, i + 500).map((c) => ({
      retailer: c.retailer,
      canonical_url: c.canonicalUrl,
      category_hint: c.categoryHint,
    }));
    const { error, count } = await supabase
      .from("catalog_urls")
      .upsert(batch, { onConflict: "canonical_url", ignoreDuplicates: true, count: "exact" });
    if (error) {
      throw new Error(`upsert failed at offset ${i}: ${error.message}`);
    }
    inserted += count ?? 0;
  }
  console.log(`\nUpserted ${unique.length} URLs (${inserted} newly inserted).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
