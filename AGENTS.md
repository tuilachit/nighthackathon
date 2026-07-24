# Night Hack Collaboration Guide

This file is the shared source of truth for humans and coding agents working in
this repository. Read it before making changes. When product ideas conflict with
this document, preserve the smallest reliable live demo and discuss the conflict
before expanding scope.

## Project in One Sentence

Build a fit-first, cross-retailer furniture search experience where the room is
the query: measure an awkward space, show only products that physically fit,
compare their remaining clearance, and preview a chosen item at true scale in AR.

## Product Thesis

Furniture search usually begins with a catalog and asks the buyer to work out
whether an item will fit. We reverse that workflow:

1. Capture the available space.
2. Describe the desired item.
3. Eliminate products that cannot fit.
4. Compare the valid choices across retailers.
5. Place the selected item at true scale.
6. Open the retailer's purchase page.

The winning idea is not "furniture in AR." That already exists. The novel wedge
is measurement-first, fit-constrained, cross-retailer comparison. AR is the
payoff and proof, not the opening pitch.

The target user is a renter or small-space shopper solving a high-friction
problem such as a narrow office nook, record shelf gap, bedside gap, or awkward
alcove. This is not intended to replace general furniture browsing.

## Honest Product Promise

Never promise that an item is guaranteed to fit in every real-world sense. The
correct claim is:

> This product fits inside the measured envelope in this orientation with
> `X mm` minimum clearance, subject to the stated measurement uncertainty.

Real installation can still be affected by skirting boards, radiators, uneven
walls, plugs, drawer and door operation, assembly requirements, and the delivery
path. Show this limitation clearly but concisely. Do not implement doorway-path
validation during the hackathon; rotational access geometry is a separate
problem.

## Hackathon Context

Night Hack is judged primarily on progress made during the five-hour build
window. Other criteria are technical complexity, creativity, user experience,
and demo quality.

- Venue: Founders, Inc., Building C
- Check-in: 6:30 PM
- Kickoff and hacking start: 7:00 PM
- Building doors lock/no re-entry: 11:00 PM
- Build window ends: 11:45 PM
- Initial judging: 12:15 AM
- Top 10 live demos: 12:45 AM
- Winners announced: 1:15 AM
- Event ends: 1:30 AM
- Top 10 presentation time: 90 seconds
- Live demos only
- No slide-only presentation
- No localhost; the app must be on public HTTPS

Existing code, APIs, models, datasets, templates, and assets are allowed, but
they must be disclosed. Judges evaluate the new work completed after kickoff.

The generic sketch-to-3D AR application in this repository is the pre-event
baseline. The fit-first measurement, catalog filtering, comparison, and
true-scale product workflow are the new Night Hack capability.

The baseline is preserved by the annotated tag
`night-hack-baseline-2026-07-24`. At the actual 7:00 PM kickoff, create another
commit or tag that captures the exact starting state. Do not present pre-event
work as work completed during the event.

Do not add private attendee links, credentials, Wi-Fi details, or other secrets
to the repository.

## Binding Scope

### Must Build

- Manual width, depth, and height entry that works on every device.
- Android WebXR floor-footprint measurement.
- Conservative fit filtering with measurement uncertainty.
- Support for width/depth orientation swapping while keeping height upright.
- A comparison view across multiple retailers.
- Exact product dimensions and remaining clearance on every result.
- A separate near-miss section with an exact reason such as "18 mm too wide."
- True-scale placement for the hero products.
- Product swapping without remeasuring the space.
- Live retailer links.
- A public HTTPS deployment.
- A cached demo query and measurement fallback.

### Explicit Non-Goals

- Runtime retailer scraping.
- Accounts, authentication, user persistence, or database writes.
- Postgres, a vector database, a data warehouse, or Docker.
- Runtime 3D model generation.
- Native mobile applications.
- Custom furniture generation, parametric furniture, or cut lists.
- Checkout or payments.
- Whole-room scanning.
- Doorway/delivery-path fit guarantees.
- Supporting every furniture category or retailer.

When time is tight, cut breadth, animation, and AI sophistication before cutting
measurement, fit correctness, comparison, or demo reliability.

## Canonical User Workflow

Keep the experience linear, mobile-first, and usable with one hand.

1. **Choose or confirm the space**
   - Primary demo path: Android WebXR.
   - Universal fallback: enter width, depth, and height manually.
   - Emergency fallback: load a known demo measurement.
2. **Measure the floor footprint**
   - Tap back-left.
   - Tap back-right.
   - Tap front-right.
   - Derive width and depth from the three points.
   - Enter height manually for the hackathon.
3. **Confirm or correct dimensions**
   - Show millimetres and inches.
   - Make correction easy; AR measurement is an estimate, not unquestionable
     truth.
4. **Describe the desired item**
   - Example: "warm oak record shelf under $300."
   - AI parsing is optional enhancement, never a critical dependency.
5. **Review fit-first results**
   - Show "Fits" results first.
   - Show retailer, price, exact dimensions, material/color, orientation,
     minimum clearance, fit confidence, and a verified-dimensions badge.
   - Put near misses in a separate section and state the shortfall.
6. **Compare**
   - Allow a small number of products to be compared side by side.
   - Clearance is the killer metric; do not bury it behind visual polish.
7. **Place at true scale**
   - Preserve the measured coordinate frame when possible.
   - Swap among hero products without asking the user to measure again.
8. **Buy**
   - Open the retailer's current product page in a new tab.

Avoid onboarding tours, account prompts, nav clutter, and multiple competing
calls to action. Each step should have one obvious primary action and visible
progress.

## Measurement and Fit Model

Use millimetres internally. Convert only for display.

```ts
interface SpaceMeasurement {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  uncertaintyMm: number;
  source: "webxr" | "manual" | "demo";
}

interface ProductDimensions {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

interface ClearancePolicy {
  sideMm: number;
  backMm: number;
  topMm: number;
}

interface FitEvaluation {
  fits: boolean;
  orientation: "default" | "rotated-90";
  widthClearanceMm: number;
  heightClearanceMm: number;
  depthClearanceMm: number;
  minimumClearanceMm: number;
  confidence: "high" | "medium" | "low";
  reasons: readonly string[];
}
```

For upright furniture, evaluate two orientations:

- Default: product width against space width and product depth against space
  depth.
- Rotated 90 degrees: product depth against space width and product width
  against space depth.

Height never rotates. A product fits only when all adjusted dimensions pass.
Apply measurement uncertainty and the clearance policy conservatively rather
than subtracting them after declaring a fit.

A reasonable demo default is:

- Measurement uncertainty: 20-30 mm.
- Side clearance: 20 mm per side.
- Back clearance: 20 mm.
- Top clearance: 10 mm.

Keep these values centralized and visible in tests. A smaller positive clearance
is not automatically "better"; rank it after category, budget, and preference
matching. Never mix failing products into the "Fits" list.

Required fit-engine tests:

- Exact boundary behavior.
- Default orientation fits.
- Only rotated orientation fits.
- Height failure.
- Uncertainty converts a nominal fit into a near miss.
- Clearance policy converts a nominal fit into a near miss.
- Invalid, zero, negative, and missing measurements.
- Stable reason strings and minimum-clearance calculation.

## Search and Ranking

The hard fit predicate runs before preference ranking.

1. Filter by verified physical fit.
2. Match category.
3. Match budget.
4. Rank material, color, and style preferences.
5. Use clearance and confidence as decision support.

Use an optional Claude call to turn natural language into a small structured
query. Always provide a deterministic local parser/ranker and cached example
queries. The demo must still work when the AI request, Wi-Fi, or API key fails.
Do not put runtime embeddings or a vector database on the critical path.

Suggested parsed query shape:

```ts
interface FurnitureQuery {
  category?: string;
  maxPrice?: number;
  materials: readonly string[];
  colors: readonly string[];
  styles: readonly string[];
  keywords: readonly string[];
}
```

## Catalog and Asset Rules

Use a curated static catalog in `public/data/catalog.json`.

- Target 30-50 verified products.
- Use at least three retailers.
- Keep one currency for the demo.
- Verify dimensions, price, image, and live product URL for every hero item.
- Spot-check the remaining catalog and record verification metadata.
- Include six to ten hero products with cached GLB assets.
- Include USDZ for the small iPhone Quick Look hero set.
- Use exact-dimension placeholder boxes for products without a 3D model; label
  them honestly.
- Optimize and locally cache images and 3D assets used in the demo.
- Never invent product dimensions.
- Never scrape retailers at runtime.

Catalog records should include a stable ID, retailer, name, category, price,
currency, canonical URL, image, exact dimensions, material/color/style tags,
verification source/date, and optional GLB/USDZ paths.

The catalog validation script should reject duplicate IDs, missing dimensions,
invalid URLs, negative prices, unsupported units, and model records without
matching scale metadata.

## Device and AR Strategy

### Android Demo Path

Use Three.js WebXR with hit-test and a `local-floor` reference space. Measurement
and product placement should remain in the same XR session so the coordinate
frame is preserved. Keep the measurement points, footprint, and placement
anchor visible enough for the audience to understand the system.

Bring and test on two known-good Android phones. Browser feature detection must
decide whether the WebXR path is available.

### iPhone and Unsupported Browsers

Do not depend on immersive WebXR on iPhone. Use:

1. Manual dimension entry.
2. Fit-first results and comparison.
3. Apple Quick Look for cached USDZ hero models.

For `<model-viewer>`, preserve true scale with `ar-scale="fixed"` and specify
the relevant AR modes. If Quick Look is unavailable, retain a normal 3D viewer
or exact-dimension box rather than blocking the workflow.

### Reliability Rules

- AR is optional; finding products that fit must not be blocked by AR support.
- Provide retry, undo-last-point, and restart-measurement controls.
- Preload the demo catalog and hero assets.
- Provide one-tap demo data for camera, plane-detection, permission, or network
  failure.
- Never rely on `localStorage` to transfer state between different devices.
- Test camera permissions from the deployed HTTPS origin before demo day.

## Technical Architecture

Keep the existing Next.js application. Do not rewrite the project during the
event.

```text
Browser
├── Next.js App Router shell
├── Fit flow client island
│   ├── WebXR measurement or manual dimensions
│   ├── Measurement confirmation/correction
│   ├── Query input
│   ├── Local hard-fit engine
│   └── Local deterministic ranking
├── Comparison/results
└── True-scale viewer/placement

Server
└── Optional query-parser route
    ├── Claude structured parsing
    └── deterministic/cached fallback in browser

Static assets
├── catalog.json
├── cached query examples
├── product images
├── GLB models
└── USDZ models
```

Recommended file boundaries:

```text
app/
├── page.tsx
└── api/parse-query/route.ts
components/
├── prototype/
│   └── useActivePrototype.ts
├── fit/
│   ├── FitFlowClient.tsx
│   ├── MeasurementConfirm.tsx
│   ├── QueryInput.tsx
│   ├── ComparisonResults.tsx
│   └── ProductCard.tsx
└── xr/
    ├── XRMeasurementClient.tsx
    ├── XRPlacementClient.tsx
    └── ManualMeasurementForm.tsx
lib/
├── catalog-types.ts
├── catalog-loader.ts
├── fit-engine.ts
├── product-ranker.ts
├── query-parser.ts
├── measurement-geometry.ts
├── model-scaling.ts
└── device-capabilities.ts
public/
├── data/catalog.json
├── data/cached-queries.json
├── images/products/
├── models/glb/
└── models/usdz/
scripts/catalog/
├── validate-catalog.ts
└── verify-dimensions.ts
```

These paths are guidance, not permission to duplicate working abstractions.
Prefer small pure modules for geometry, fit evaluation, and ranking. Browser and
WebXR APIs belong only in client components. Keep the static shell and
non-interactive content as Server Components.

## Current Repository Baseline

The existing project uses:

- Next.js 15 App Router.
- React 19.
- TypeScript.
- Tailwind CSS.
- Vitest and Testing Library.
- Playwright.
- `<model-viewer>`.

The baseline app currently turns a sketch and prompt into a structured product
concept, optionally generates a model, and provides result, AR, launch, and
Build Pack routes. Reuse useful infrastructure, but the Night Hack demo should
lead with fit-first furniture search rather than the generic concept-generation
flow.

Operational collaboration files:

- `README.md` distinguishes the disclosed baseline from the Night Hack target.
- `TODOS.md` is the owner/status/blocker board.
- `docs/collaboration/handoff.md` is the handoff template.
- `docs/assets/asset-inventory.md` records model provenance and scale readiness.
- `docs/testing/real-device-deployment-preflight.md` is the required phone and
  deployed-origin test matrix.
- `.github/workflows/quality.yml` runs `npm run verify` for pushes and pull
  requests.

Known baseline risks to avoid carrying into the new critical path:

- Mixed ARchitect and Reality MVP branding.
- Fallback 3D assets may not render in the active viewer path.
- No complete USDZ workflow.
- The existing QR-like graphic is not a real QR code.
- Cross-device state cannot rely on same-device `localStorage`.
- Launch UI may preview a request instead of performing it.
- A production URL is not documented in the repository.

Do not spend the hackathon fixing unrelated baseline features unless they block
the fit-first live demo.

## UI and Interaction Direction

- Mobile-first, single-column flow.
- White background, near-black primary text, neutral secondary text, restrained
  gold accent.
- Large numbers for measurements and clearance.
- Large touch targets and readable contrast.
- Flat visual hierarchy; avoid decorative dashboard chrome.
- One primary call to action per step.
- Visible step progress.
- Skeletons only for real waits; local fit results should feel immediate.
- Use haptic feedback sparingly for successful measurement points when
  supported.
- Clearly distinguish `Fits`, `Near miss`, and `Measurement needs review`.
- Never use color alone to communicate fit status.

The emotional moment is not seeing a 3D chair. It is seeing uncertainty removed:
"Six real shelves fit this exact gap; this one leaves 34 mm."

## TypeScript Enforcement Rules

- **Strict Type Safety:** Always write code in TypeScript (`.ts`/`.tsx`). Never
  add JavaScript (`.js`/`.jsx`) source files.
- **No `any`:** Never use explicit or implicit `any`. Define precise interfaces,
  unions, generics, or `unknown` plus validation.
- **Modern React:** Prefer functional components and hooks with explicit public
  prop types.
- **Inference vs. explicit types:** Prefer inference for obvious local values and
  explicit types at module and API boundaries.
- **Imports:** Use ES module syntax. Never use `require()` or
  `module.exports`.
- **Validation:** Validate untrusted JSON, AI output, query strings, and static
  catalog data before use. Do not bypass the type system.
- **Units:** Put the unit in numeric field names (`widthMm`, `priceUsd`) and do
  not pass unlabelled measurement numbers across module boundaries.

<!-- BEGIN:nextjs-agent-rules -->
# Next.js Project Notes

This project uses Next.js App Router with TypeScript. Check the installed Next.js
docs in `node_modules/next/dist/docs/` before using APIs that may have changed.
<!-- END:nextjs-agent-rules -->

## Engineering Rules

- Preserve the existing package manager and lockfile.
- Do not add a dependency when a small, tested utility is enough.
- Keep secrets server-side and out of logs, browser bundles, fixtures, and git.
- AI output must be parsed and validated; it is never trusted application state.
- Do not make live network calls from the fit engine.
- Prefer deterministic behavior in the demo path.
- Every error state needs a recovery action.
- Accessibility and mobile performance are requirements, not post-demo polish.
- Optimize large 3D assets before committing them.
- Do not introduce auth, a database, background jobs, or infrastructure not
  required by this document.

Before using a Next.js API that may have changed, inspect the installed
documentation under `node_modules/next/dist/docs/`. If dependencies are not
installed yet, install from the committed lockfile before relying on framework
behavior.

## Collaboration Protocol

Keep work separable so two teammates can move quickly without overwriting each
other.

Suggested ownership during the build:

- **Measurement/XR owner:** WebXR points, geometry, coordinate frame, placement,
  device capability detection, and manual fallback.
- **Fit/search/UI owner:** catalog schema, validation, fit engine, ranking,
  query parsing, comparison UI, retailer links, and deployment.

Coordinate shared types before parallel implementation. `catalog-types.ts`,
`fit-engine.ts`, measurement state, and the top-level flow are shared contracts;
announce changes to them before editing.

For every work handoff, state:

1. What changed.
2. Which files changed.
3. What was tested and on which device/browser.
4. Known failures or assumptions.
5. The next smallest unblocked task.

Git conventions:

- Keep commits small and demo-oriented.
- Do not mix catalog data, XR code, and broad styling in one commit.
- Do not rewrite or force-push shared history.
- Pull/rebase before starting a shared file and before handing it off.
- Never discard another teammate's uncommitted work.
- Use descriptive commit subjects such as
  `feat(fit): evaluate rotated furniture orientation`.
- Record whether work is `pre-event` or `night-hack` when the distinction could
  affect judging disclosure.

## Pre-Event Work Allowed and Recommended

Before kickoff, reduce external risk without misrepresenting progress:

- Curate and verify the static product catalog.
- Download, optimize, and test product images, GLBs, and USDZs.
- Test measurement feasibility on the actual Android devices.
- Test Quick Look on the actual iPhone.
- Confirm the deployment pipeline and HTTPS camera permissions.
- Prepare cached queries and demo measurements.
- Write unit tests for pure geometry and fit semantics if allowed as baseline.
- Prepare a truthful baseline disclosure.
- Rehearse failure recovery and the 90-second story.

At kickoff, capture the exact baseline commit/tag. The core new integration and
visible fit-first experience should be implemented during the judged window.

## Five-Hour Build Order

Use this as the default execution plan. Adjust only to protect a reliable live
demo.

| Time | Outcome |
| --- | --- |
| 7:00-7:15 | Create kickoff tag, confirm production skeleton, assign ownership |
| 7:15-8:05 | Android footprint measurement plus manual/demo fallback |
| 8:05-8:40 | Fit engine, uncertainty, orientation, and unit tests |
| 8:40-9:15 | Fit/near-miss comparison results with clearance |
| 9:15-9:45 | Optional query parser plus cached/local fallback |
| 9:45-10:35 | True-scale placement and product swapping |
| 10:35-10:55 | Retailer links, correction flow, failure states |
| 10:55-11:15 | Android, iPhone, network, and deployed-origin testing |
| 11:15 | Code freeze except for demo-blocking bugs |
| 11:15-11:45 | Deploy, verify public URL, rehearse live demo |

If measurement is not reliable by 8:05, keep debugging it on one device while
the other teammate continues with manual dimensions and the pure fit engine.
The full product remains demoable even if WebXR becomes a bonus path.

## Definition of Done

The submission is ready only when:

- The public HTTPS URL works without a developer machine.
- Both Android demo devices can complete measurement or recover to manual mode.
- Manual measurement works on unsupported devices.
- Controlled measurement accuracy is approximately 20-30 mm and correction is
  available.
- The catalog has at least 30 verified items from three retailers.
- Local fit results appear in under one second.
- Every item under `Fits` passes the conservative predicate.
- Every result displays exact dimensions and clearance.
- Near misses display the exact failing dimension/shortfall.
- At least three hero products place at true scale.
- Products can be swapped without remeasuring.
- Retailer links open live pages.
- The cached demo measurement and query work if the network or AI fails.
- The baseline disclosure and new-work summary are accurate.
- The team has rehearsed the 90-second live demo on venue-like Wi-Fi.

## 90-Second Demo Story

Open with the problem and measurable result, not with an AR feature list:

> This gap is 812 millimetres wide. Furniture sites make me search thousands of
> products and do the fit math myself. Here are six shelves from three retailers
> that fit this exact space. This one leaves 34 millimetres. Now I can compare
> them and place the winner at true scale.

Recommended sequence:

1. Show the awkward gap.
2. Capture or load its dimensions.
3. Speak/type the request.
4. Reveal only fitting cross-retailer results.
5. Point to exact clearance and one near miss.
6. Swap two products in true-scale placement.
7. Open the live retailer link.
8. Close with: **The room is the query, not the catalog.**

Do not spend demo time on architecture, login, setup, or a long AI response.
