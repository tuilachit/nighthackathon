# Night Hack: Fit-First Furniture Search

Measure an awkward space, find furniture that physically fits, compare the
remaining clearance across retailers, and preview a chosen item at true scale.

> **Collaboration source of truth:** Read [`AGENTS.md`](./AGENTS.md) before
> changing scope, shared contracts, or the demo path.

## Baseline and Night Hack Target

This repository contains two deliberately separate layers:

### Disclosed pre-event baseline

The current Next.js app is **ARchitect**, a mobile-first sketch-to-spatial-MVP
prototype. It can:

- capture a sketch and product prompt;
- create a typed fallback `PrototypeSpec`;
- optionally refine concepts with OpenAI and generate models with Meshy;
- show result, AR, launch, and Build Pack routes; and
- recover to deterministic local behavior when optional integrations fail.

This generic sketch-to-3D AR experience existed before Night Hack. The annotated
tag `night-hack-baseline-2026-07-24` records an earlier disclosed baseline. The
team must create another commit or tag at the actual kickoff to record the exact
starting state.

### Night Hack target

The new capability is fit-first, cross-retailer furniture search:

1. Capture width and depth with Android WebXR, or enter dimensions manually.
2. Confirm width, depth, height, and measurement uncertainty.
3. Describe the desired furniture.
4. Apply a conservative physical-fit predicate before preference ranking.
5. When supplied, apply an advisory narrowest-access check and keep failures
   separate from destination-space near misses.
6. Compare valid products by retailer, dimensions, price, and clearance.
7. Keep near misses separate and explain the exact shortfall.
8. Place selected hero products at true scale and swap without remeasuring.
9. Open the retailer product page.

The room is the query, not the catalog. AR is the final proof, not the product
claim. See [`AGENTS.md`](./AGENTS.md) for the binding scope, fit semantics,
device strategy, and five-hour build order.

## Run Locally

Requirements:

- Node `22.23.1` (see [`.nvmrc`](./.nvmrc))
- npm `10.9.8`

Install exactly from the committed lockfile:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The deterministic baseline and checked-in 18-product furniture catalog work
without API keys. When Supabase contains at least 100 verified products across
all three retailers, `/fit` automatically uses that online catalog instead.
Copy `.env.example` to `.env.local` only when testing an optional integration:

```bash
cp .env.example .env.local
```

All optional integrations are disabled by default. Do not commit `.env.local`
or real credentials.

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Optional server-side concept refinement, query parsing, and voice transcription |
| `OPENAI_VISION_MODEL` | Model used by the optional OpenAI path |
| `OPENAI_QUERY_MODEL` | Optional override for the furniture-query extraction model |
| `OPENAI_TRANSCRIPTION_MODEL` | Optional override for the voice transcription model |
| `ENABLE_MESHY` | Enables optional custom model generation when set to `true` |
| `MESHY_API_KEY` | Server-side credential for Meshy |
| `ENABLE_NOTION` | Enables the optional waitlist integration when set to `true` |
| `NOTION_TOKEN` | Server-side Notion credential |
| `NOTION_WAITLIST_DATABASE_ID` | Optional Notion database identifier |
| `NOTION_WAITLIST_DATA_SOURCE_ID` | Optional Notion data-source identifier |
| `SCRAPINGANT_API_KEY` | Server-side credential used only by scheduled catalog ingestion |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public read-only Data API key; RLS remains authoritative |
| `SUPABASE_SECRET_KEY` | Server/CI-only catalog writer credential; never expose to client code |
| `SUPABASE_CATALOG_MIN_PRODUCTS` | Online-catalog publication gate; defaults to `100` |
| `CATALOG_PRODUCTS_PER_RETAILER` | Ingestion quota; defaults to `35` and cannot be below `34` |

## Verified Online Catalog

Retailer pages are never scraped during a user search. A bounded scheduled job
collects factual product data, rejects incomplete records, caches attributed
product photos in Supabase Storage, and then publishes the verified snapshot.
The app reads only active rows through RLS:

```text
ScrapingAnt → deterministic retailer adapters → validation
            → Supabase Postgres + Storage → /fit server read
```

The checked-in 18-product catalog remains the deterministic fallback whenever
Supabase is unavailable, contains fewer than 100 products, or lacks one of the
three required retailers.

Validate retailer adapters without changing Supabase:

```bash
npm run catalog:sync:dry
```

Publish a complete verified snapshot:

```bash
npm run catalog:sync
```

The weekly GitHub Actions refresh requires repository secrets named
`SCRAPINGANT_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and
`SUPABASE_SECRET_KEY`. Review retailer terms and migrate to authorized
affiliate/catalog feeds before treating this hackathon ingestion path as a
commercial production data source.

## Quality Gate

Run the same reproducible gate used by CI:

```bash
npm run verify
```

It runs TypeScript checks, ESLint, Vitest, and a production build. Playwright is
kept separate because browser binaries and a running app may be required:

```bash
npm run e2e
```

Before a phone-demo handoff, also verify the deployed HTTPS origin on the actual
Android and iPhone devices. Automated checks do not validate camera permission,
plane detection, Scene Viewer, or Quick Look behavior.

## Code Boundaries

The existing baseline remains organized as follows:

```text
app/
  page.tsx                         Existing create-flow shell
  result/[id]/page.tsx             Existing generated prototype result
  ar/[id]/page.tsx                 Existing model-viewer AR route
  launch/[id]/page.tsx             Existing launch/waitlist surface
  build-pack/[id]/page.tsx         Existing generated artifact viewer
  api/                             Optional OpenAI, Meshy, and waitlist routes

components/
  create/ result/ ar/ launch/      Existing baseline UI
  build-pack/ ui/                  Existing artifact and UI primitives

lib/
  prototype-*.ts                   Existing baseline domain and registry
  analyzer.ts                      Existing deterministic analysis
  model-generation.ts             Existing generation state transitions
  meshy-client.ts                  Existing optional Meshy boundary
```

New fit-first work should use the boundaries defined in `AGENTS.md`:

```text
components/fit/                    Measurement confirmation and comparison UI
components/xr/                     WebXR measurement and placement clients
lib/catalog-*.ts                   Catalog schema, validation, and fallback data
lib/supabase/                      Online catalog mapping and read boundary
lib/fit-engine.ts                  Pure conservative fit predicate
lib/measurement-geometry.ts        Pure point-to-dimensions geometry
lib/product-ranker.ts              Deterministic ranking after hard fit
public/data/                       Verified catalog and cached queries
public/models/{glb,usdz}/          Optimized local hero assets
scripts/catalog/                   Bounded ingestion, validation, and asset tools
supabase/migrations/               Catalog schema, RLS, view, and Storage bucket
```

Do not duplicate a working abstraction just to match this suggested layout.
Coordinate changes to shared types, the fit engine, measurement state, and the
top-level flow before editing them.

## Collaboration

- [`AGENTS.md`](./AGENTS.md) — canonical product, engineering, and demo rules.
- [`TODOS.md`](./TODOS.md) — current owner/status/blocker board.
- [`docs/collaboration/handoff.md`](./docs/collaboration/handoff.md) — small
  handoff checklist and paste-ready template.
- [`docs/designs/`](./docs/designs/) — archived historical plans for the older
  Reality MVP direction; useful context, not active scope.

Keep commits small, mark pre-event work truthfully, and never commit credentials,
private attendee links, Wi-Fi details, or other event-only information.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js server |
| `npm run build` | Create a production build |
| `npm run start` | Serve a production build |
| `npm run typecheck` | Run TypeScript checks |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run e2e` | Run Playwright tests |
| `npm run catalog:sync:dry` | Validate 105+ live retailer records without database writes |
| `npm run catalog:sync` | Cache images and publish a fully verified Supabase snapshot |
| `npm run verify` | Run the CI quality gate |
