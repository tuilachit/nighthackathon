# ARchitect

Turn a rough product sketch into a spatial MVP you can inspect, share, and open in AR.

ARchitect is a mobile-first Next.js PWA for hackathon demos: upload or capture a product sketch, describe the idea, answer a few product questions, and get an instant fallback-ready 3D prototype with an optional custom Meshy generation lane.

The app is designed so the demo never depends on a slow model generation request. A validated fallback model is ready immediately; OpenAI and Meshy can enhance the result when API keys are configured.

## What It Does

- Captures or uploads a product sketch/photo.
- Refines the concept with focused founder questions.
- Builds a typed `PrototypeSpec` from prompt, image, and answers.
- Shows a result page with model preview, AR handoff, generation status, and product details.
- Opens an AR route powered by `<model-viewer>`.
- Generates an inspectable Build Pack with route/config/docs/checklist artifacts.
- Falls back safely when OpenAI, Meshy, local storage, or AR support is unavailable.

## Demo Flow

```text
Sketch or photo + prompt
  -> product questions
  -> fallback PrototypeSpec
  -> result page
  -> AR reveal
  -> Build Pack proof
```

Optional enhancement path:

```text
OpenAI analysis/refinement
  -> Meshy Image-to-3D when an image exists
  -> Meshy Text-to-3D fallback
  -> generated GLB/USDZ replaces fallback model when valid
```

## Tech Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS
- Vitest + Testing Library
- Playwright
- `<model-viewer>` for web AR

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Environment

The app works without API keys by using deterministic fallback generation.

Create `.env.local` only if you want the enhanced paths:

```bash
OPENAI_API_KEY=
OPENAI_VISION_MODEL=gpt-5.4-mini

ENABLE_MESHY=true
MESHY_API_KEY=

ENABLE_NOTION=false
NOTION_TOKEN=
NOTION_WAITLIST_DATA_SOURCE_ID=
NOTION_WAITLIST_DATABASE_ID=
```

Notes:

- `OPENAI_API_KEY` enables concept refinement and product analysis.
- `ENABLE_MESHY=true` plus `MESHY_API_KEY` enables custom model generation.
- Meshy is non-blocking; fallback AR remains the primary demo path.
- Notion variables are only needed for the optional waitlist integration.

## Scripts

```bash
npm run dev        # Start local Next.js dev server
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run ESLint
npm run typecheck  # Run TypeScript checks
npm run test       # Run unit/component tests
npm run test:watch # Run Vitest in watch mode
npm run e2e        # Run Playwright smoke tests
```

## Project Structure

```text
app/
  page.tsx                         Create flow shell
  result/[id]/page.tsx             Generated prototype result
  ar/[id]/page.tsx                 AR viewer route
  build-pack/[id]/page.tsx         Generated artifact viewer
  api/                             OpenAI, Meshy, waitlist routes

components/
  create/                          Sketch/prompt/question flow
  result/                          Result, preflight, handoff UI
  ar/                              model-viewer client component
  build-pack/                      Build Pack renderer
  ui/                              Small typed primitives

lib/
  analyzer.ts                      Deterministic product analysis
  concept-refinement.ts            Optional OpenAI question generation
  openai-analysis.ts               Optional OpenAI product analysis
  meshy-client.ts                  Optional Meshy API boundary
  model-generation.ts              Generation state transitions
  prototype-registry.ts            Seeded prototype routes
  local-prototype-store.ts         Browser persistence boundary
  build-pack.ts                    Generated artifacts
  prototype-types.ts               Shared domain model
```

## Core Design Principle

The demo must always reach AR.

That means every external dependency is treated as an upgrade lane, not the critical path. If OpenAI is missing, the app uses local analysis. If Meshy is disabled or slow, the fallback model stays ready. If custom GLB validation fails, the user still lands on a working prototype.

## Testing

Run the full local check before shipping:

```bash
npm run typecheck
npm run lint
npm run test
npm run e2e
```

For phone demos, also verify:

- The Vercel preview URL loads on the target phone.
- `/result/smart-hydration-bottle` opens cleanly.
- `/ar/smart-hydration-bottle` loads the model.
- The fallback model renders before custom generation finishes.
- iOS/Android AR degrades to preview instead of blank UI when unsupported.

## Reference Material

- `docs/designs/reality-mvp-ceo-plan.md` explains the product strategy.
- `docs/designs/reality-mvp-engineering-plan.md` explains the implementation plan.
- `AR/` contains the original standalone prototype reference. The production app lives in typed Next.js files under `app/`, `components/`, and `lib/`.
