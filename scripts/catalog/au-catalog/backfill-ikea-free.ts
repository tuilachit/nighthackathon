/**
 * Zero-credit IKEA AU catalog backfill: enumerate product URLs from IKEA's own
 * sitemaps, fetch each product page with plain HTTP (the pages are fully
 * server-rendered), parse the structured facts, and validate through the same
 * gate as the live path. Emits DB-ready rows; no paid provider is touched.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx \
 *     scripts/catalog/au-catalog/backfill-ikea-free.ts \
 *       --per-category 60 --output catalog-ikea-free.json
 */
import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  parseSitemapUrls,
  selectCatalogCandidates,
  type CatalogCategory,
  type CatalogUrlCandidate,
} from "@/lib/live-search/catalog/enumerate";
import { parseIkeaProductPage } from "@/lib/live-search/catalog/ikea-free";
import { buildCatalogObservation } from "@/lib/live-search/catalog/ingest";
import { validateBrowserSearchOutput } from "@/lib/live-search/validation";

const SITEMAP_INDEX = "https://www.ikea.com/sitemaps/sitemap.xml";
const PRODUCT_SITEMAP = /prod-en-AU_\d+\.xml/i;
const CONCURRENCY = 4;
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-AU" },
    signal: AbortSignal.timeout(30_000),
    redirect: "follow",
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  const body = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b
    ? gunzipSync(buffer).toString("utf8")
    : buffer.toString("utf8");
  return { status: res.status, body };
}

async function enumerateAll(perCategory: number): Promise<readonly CatalogUrlCandidate[]> {
  const index = await fetchText(SITEMAP_INDEX);
  const sitemaps = parseSitemapUrls(index.body).filter((u) => PRODUCT_SITEMAP.test(u));
  const byCategory = new Map<CatalogCategory, CatalogUrlCandidate[]>();
  for (const sitemap of sitemaps) {
    const page = await fetchText(sitemap);
    for (const candidate of selectCatalogCandidates(parseSitemapUrls(page.body))) {
      if (candidate.retailer !== "ikea-au") continue;
      const bucket = byCategory.get(candidate.categoryHint) ?? [];
      bucket.push(candidate);
      byCategory.set(candidate.categoryHint, bucket);
    }
  }
  // Even stride within each category so one product family cannot dominate.
  const selected: CatalogUrlCandidate[] = [];
  for (const [category, all] of byCategory) {
    if (all.length <= perCategory) {
      selected.push(...all);
    } else {
      const stride = all.length / perCategory;
      for (let i = 0; i < perCategory; i += 1) {
        const candidate = all[Math.floor(i * stride)];
        if (candidate !== undefined) selected.push(candidate);
      }
    }
    console.log(`  ${category}: ${all.length} in sitemaps -> ${Math.min(all.length, perCategory)} selected`);
  }
  return selected;
}

async function main(): Promise<void> {
  const perCategory = Number.parseInt(arg("per-category", "60"), 10);
  const output = arg("output", "catalog-ikea-free.json");
  const observedAt = new Date().toISOString();

  console.log("Enumerating from IKEA sitemaps (free)...");
  const candidates = await enumerateAll(perCategory);
  console.log(`${candidates.length} pages to fetch (free, concurrency ${CONCURRENCY})\n`);

  const rows: { product: Record<string, string>; snapshot: Record<string, unknown> }[] = [];
  const rejections: Record<string, number> = {};
  let attempted = 0;
  const queue = [...candidates];

  const worker = async (): Promise<void> => {
    for (;;) {
      const candidate = queue.shift();
      if (candidate === undefined) return;
      attempted += 1;
      const label = candidate.canonicalUrl.split("/").pop() ?? "";
      try {
        const { status, body } = await fetchText(candidate.canonicalUrl);
        if (status !== 200) {
          rejections[`http_${status}`] = (rejections[`http_${status}`] ?? 0) + 1;
          continue;
        }
        const parsed = parseIkeaProductPage(body, candidate.canonicalUrl);
        if (parsed === undefined) {
          rejections.unparseable = (rejections.unparseable ?? 0) + 1;
          continue;
        }
        const built = buildCatalogObservation({
          retailer: "ikea-au",
          categoryHint: candidate.categoryHint,
          extraction: parsed.extraction,
          markdown: parsed.extraction.markdown,
          observedAt,
        });
        if (!built.ok) {
          rejections[built.reason] = (rejections[built.reason] ?? 0) + 1;
          continue;
        }
        const validated = validateBrowserSearchOutput({ products: [built.observation], partial: false, notes: [] });
        const observation = validated.value?.products[0];
        if (!validated.ok || observation === undefined) {
          const reason = validated.errors[0] ?? "validation_failed";
          rejections[reason] = (rejections[reason] ?? 0) + 1;
          continue;
        }
        const d = observation.assembledDimensions;
        rows.push({
          product: {
            retailer: "ikea-au",
            retailer_product_id: observation.retailerProductId,
            canonical_url: candidate.canonicalUrl,
          },
          snapshot: {
            name: observation.name,
            category: observation.category,
            product_url: observation.productUrl,
            image_url: observation.imageUrl,
            price_minor: observation.priceMinor,
            currency: observation.currency,
            availability: observation.availability,
            width_mm: d.widthMm,
            height_mm: d.heightMm,
            depth_mm: d.depthMm,
            dimensions_source: observation.dimensionsSource,
            dimensions_evidence: observation.dimensionsEvidence,
            confidence: observation.confidence,
            observed_at: observation.observedAt,
            retailer_identity: observation.retailer,
            category_hint: candidate.categoryHint,
          },
        });
        if (rows.length % 25 === 0) {
          console.log(`  ${rows.length} stored (${attempted} attempted)... latest: ${label}`);
        }
      } catch (error) {
        const reason = String(error).includes("Timeout") ? "timeout" : "error";
        rejections[reason] = (rejections[reason] ?? 0) + 1;
      }
      // Be polite to the retailer: small pause per worker between pages.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  writeFileSync(output, JSON.stringify(rows, null, 1));
  const perCat = rows.reduce<Record<string, number>>((acc, r) => {
    const hint = String(r.snapshot.category_hint);
    acc[hint] = (acc[hint] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\nAttempted ${attempted}, stored ${rows.length}. Wrote ${output}`);
  console.log("Per category:", JSON.stringify(perCat));
  console.log("Rejections:", JSON.stringify(rejections));
  console.log("Firecrawl credits spent: 0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
