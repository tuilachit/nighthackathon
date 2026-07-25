# Verified Catalog Ingestion

The user-facing `/fit` route never scrapes a retailer. Search reads a verified
Supabase snapshot, and automatically falls back to the checked-in catalog if the
online snapshot is incomplete or unavailable.

## Data Flow

1. The scheduled runner requests only the configured IKEA, Target, and Wayfair
   catalog surfaces through ScrapingAnt.
2. Retailer-specific deterministic adapters extract factual name, price,
   dimensions, material/color metadata, canonical URLs, and photo source URLs.
3. Any product without exact positive dimensions, price, HTTPS source URLs, or
   a cacheable image is rejected.
4. At least 35 products must pass for each retailer before publication starts.
5. Product photos are copied to the public Supabase Storage
   `product-images` bucket. Each database row retains the original retailer
   source URL, attribution, MIME type, and SHA-256 digest.
6. Catalog rows are upserted with stable IDs and a sync-run audit record.
7. Old rows for that retailer are deactivated only after the incoming products
   and primary-image metadata exist.
8. `/fit` switches to Supabase only when at least 100 active products across all
   three retailers pass runtime validation.

## Credentials

- `SCRAPINGANT_API_KEY`: server/CI ingestion only.
- `NEXT_PUBLIC_SUPABASE_URL`: public project identifier.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public read key protected by RLS.
- `SUPABASE_SECRET_KEY`: privileged server/CI writer. Never prefix it with
  `NEXT_PUBLIC_`, print it, or commit it.

## Operations

The dry run performs live extraction and validation but makes no Supabase or
Storage changes:

```bash
npm run catalog:sync:dry
```

The publishing run requires all credentials:

```bash
npm run catalog:sync
```

`.github/workflows/catalog-sync.yml` runs weekly to fit within the selected
provider's free allowance. Manual workflow dispatch is also available.

## Failure Behavior

- A retailer below quota blocks the entire publishing run.
- A missing or invalid image blocks that product; falling below quota blocks
  publication.
- Failed refreshes are recorded in `catalog_sync_runs`.
- Public users cannot read operational sync records or write catalog tables.
- If the online view falls below its runtime gate, `/fit` serves the local
  verified fallback rather than a partial catalog.

## Production Caveat

The adapters collect public factual listing data for the hackathon demo. A
scraping provider solves delivery reliability, not data licensing. Before
commercial production, review every retailer's current terms and replace
adapters with authorized affiliate APIs, feeds, or licensed catalog sources
where available.
