---
status: ACTIVE
review: plan-eng-review
date: 2026-04-29
branch: main
repo: 34wizrd/chain-broker-hackathon
supersedes: docs/designs/reality-mvp-ceo-plan.md
---

# Engineering Plan: Reality MVP

This plan turns the existing `AR/` standalone prototype into a Vercel-ready,
mobile-first Next.js PWA. The `AR/` folder is reference material only: it
contains useful product flow and visual decisions, but it is `.jsx` plus
Babel-in-browser and does not satisfy the repo's TypeScript-only rules or the
requested App Router architecture.

## Locked Decisions

| Decision | Choice | Engineering impact |
|---|---|---|
| D1 | Port the prototype into a real Next.js TypeScript app | Keep the visual/product ideas from `AR/`, but implement production code as `.ts` and `.tsx`. |
| D2 | Static seeded slugs plus same-device `localStorage` | Cross-device demo works for seeded routes such as `smart-hydration-bottle`; custom local generations remain same-device only. |
| D3 | Validated hero bottle asset first | The default AR reveal depends on one proven bottle GLB plus iOS-safe path before broader model coverage. |
| D4 | Deterministic local analyzer and mocked Meshy timeline | No OpenAI or Meshy API calls in the first MVP; leave typed seams for later integrations. |
| D5 | Server route shells plus focused client islands | App Router pages stay server-safe; browser-only upload, storage, and `<model-viewer>` logic live in client components. |
| D6 | Vitest, Testing Library, and Playwright smoke tests | Unit/component tests cover logic and escaping; browser smoke tests cover the critical create-result-AR path. |

## What Already Exists

- `AR/src/screen-create.jsx` has the useful upload/prompt shape, example chips,
  progress handoff, and mobile-first interaction model. Reuse the flow, not the
  code.
- `AR/src/screen-result.jsx` has the right hierarchy: generated product,
  preview, AR call to action, spec, features, and Build Pack link. Replace the
  fake SVG model with `<model-viewer>`.
- `AR/src/screen-ar.jsx` has a strong presenter story but simulates AR. Replace
  it with a minimal real AR route powered by `<model-viewer>`.
- `AR/src/screen-buildpack.jsx` renders generated content as escaped text through
  React text nodes. Preserve that security posture.
- `AR/src/data.jsx` contains starter product copy, example chips, and Build Pack
  artifact ideas. Convert the useful content into typed registry/build-pack
  modules.

## NOT In Scope

- Native mobile app.
- User accounts, auth, or database.
- Custom camera streaming.
- Complex 3D editor or multi-user collaboration.
- Live Codex invocation during the demo.
- Live OpenAI or Meshy calls in MVP implementation.
- Build Pack export/download in first implementation.
- Cross-device custom prototype persistence beyond seeded static slugs.
- Full validation of lamp, chair, box, and device assets before the bottle reveal
  works on the target phone.

## Architecture

Use Next.js App Router with TypeScript and Tailwind. Next supports PWA manifest
metadata through `app/manifest.ts`; use that built-in rather than custom manifest
plumbing. Use the official `<model-viewer>` web component for GLB preview and AR
with `ar-modes="webxr scene-viewer quick-look"`.

```text
app/
  layout.tsx
  manifest.ts
  page.tsx                       server shell for create screen
  result/[id]/page.tsx           server shell reads seeded registry
  ar/[id]/page.tsx               server shell reads seeded registry
  build-pack/[id]/page.tsx       server shell reads seeded registry

components/
  create/RealityCreateClient.tsx browser upload, prompt, examples, generate
  result/ResultClient.tsx        localStorage merge, preview, CTA state
  ar/ModelViewerClient.tsx       model-viewer import and AR button
  build-pack/BuildPackViewer.tsx escaped generated artifact display
  ui/*                           small typed UI primitives

lib/
  analyzer.ts                    deterministic prompt/category analysis
  assets.ts                      fallback model registry and validation helpers
  build-pack.ts                  artifact generation from PrototypeSpec
  local-prototype-store.ts       localStorage boundary
  prototype-registry.ts          seeded static slugs
  prototype-types.ts             shared domain types and status unions
  upload-validation.ts           image type/size/zero-byte validation
```

### Dependency Graph

```text
prototype-types.ts
  +--> analyzer.ts
  +--> assets.ts
  +--> prototype-registry.ts
  +--> build-pack.ts
  +--> local-prototype-store.ts

app/*/page.tsx
  +--> prototype-registry.ts
  +--> route-specific client component

client components
  +--> analyzer.ts / upload-validation.ts / local-prototype-store.ts
  +--> model-viewer only inside ModelViewerClient.tsx
```

Keep `lib/*` framework-light and testable. Components can import pure library
functions, but library modules must not import React components.

## Domain Model

Define explicit TypeScript types. Do not use `any`.

```text
PrototypeSpec
  id
  name
  prompt
  category
  shape
  materials[]
  features[]
  intendedUse
  refined3DPrompt
  model
    glbPath
    iosPath?
    source: fallback | generated
    category
  statuses
    analysis
    asset
    meshy
    storage
    arCompatibility
```

Use discriminated unions for status and error states:

```text
AnalysisStatus = idle | validating | analyzing | ready | failed
AssetStatus = ready | missing | invalid | fallback
MeshyStatus = disabled | pending | succeeded | failed | timeout
StorageStatus = unavailable | saved | failed
ArCompatibilityStatus = unknown | webxr | scene-viewer | quick-look | preview-only
```

## Data Flow

```text
CREATE SCREEN (/)
  |
  +-- file input: accept="image/*" capture="environment"
  |     |
  |     +-- validate type, size, zero-byte
  |     +-- show preview through object URL or data URL
  |
  +-- prompt input / example chip
        |
        +-- Generate button disables while pending
        v
DETERMINISTIC ANALYZER
  |
  +-- category match: bottle | lamp | chair | box | device | unknown
  +-- unknown category -> bottle fallback for MVP reliability
  v
PROTOTYPE SPEC
  |
  +-- save same-device copy to localStorage if available
  +-- seeded slug remains source of truth for cross-device demo
  v
/result/[id]
  |
  +-- product analysis
  +-- model preview
  +-- mocked Meshy timeline
  +-- AR compatibility copy
  +-- View in AR -> /ar/[id]
  +-- Build Pack -> /build-pack/[id]
```

## Route Contract

### `/`

Mobile-first creation surface:

- Upload area using `<input type="file" accept="image/*" capture="environment" />`.
- Prompt textarea with default example chips.
- Generate button.
- Inline validation errors.
- Deterministic navigation to `/result/smart-hydration-bottle` for the default
  demo prompt.

### `/result/[id]`

Result surface:

- Server shell resolves seeded spec by `id`.
- Client component merges same-device localStorage spec when available.
- Unknown `id` shows a typed not-found state, not a blank page.
- Real 3D preview uses the same model registry as AR.
- The page hierarchy is AR reveal first, Build Pack proof second.

### `/ar/[id]`

Minimal mobile AR route:

- Server shell resolves seeded spec by `id`.
- Client component renders `<model-viewer>`.
- Required attributes:
  - `src`
  - `ios-src` when validated USDZ exists
  - `ar`
  - `ar-modes="webxr scene-viewer quick-look"`
  - `camera-controls`
  - `auto-rotate`
  - `shadow-intensity`
- Show product name, short feature callouts, and a visible View in AR button.
- Show clear preview-only fallback copy when AR is unavailable.

### `/build-pack/[id]`

Generated app-layer proof:

- Render deterministic artifacts as escaped text.
- Include:
  - `app/ar/[id]/page.tsx`
  - `product.config.json`
  - `AGENTS.md`
  - `MVP_SPEC.md`
  - `VALIDATION_PLAN.md`
  - `README.md` section
- State the core framing plainly: Codex creates the runnable AR app layer around
  the product concept.

## Asset Strategy

Create `public/models/` and prioritize one known-good bottle path:

```text
public/models/bottle.glb
public/models/bottle.usdz    optional only if validated; otherwise omit ios-src
```

The original requested model list stays represented in the registry, but only
validated assets should be exposed as real AR choices. Until the remaining assets
exist and pass phone preflight, classify unsupported categories to the known-good
bottle fallback with visible fallback copy.

```text
prompt category      MVP model behavior
--------------       ------------------
bottle               /models/bottle.glb
lamp                 bottle fallback until lamp asset is validated
chair                bottle fallback until chair asset is validated
box                  bottle fallback until box asset is validated
device               bottle fallback until device asset is validated
unknown              bottle fallback
```

## Client/Server Boundary

```text
SERVER-SAFE
  app/*/page.tsx
  lib/analyzer.ts
  lib/assets.ts
  lib/build-pack.ts
  lib/prototype-registry.ts
  lib/prototype-types.ts
  lib/upload-validation.ts

BROWSER-ONLY CLIENT ISLANDS
  file input and preview
  localStorage reads/writes
  navigator/browser capability checks
  model-viewer web component registration
```

Do not call `window`, `document`, `localStorage`, `FileReader`, or custom element
APIs outside client components or guarded browser helpers.

## Build Pack Security

- Never use `dangerouslySetInnerHTML` for generated artifact content.
- Render code and markdown as text nodes.
- Escape prompt-derived content in generated JSON/code strings.
- Validate generated artifact shape before display so missing fields show explicit
  warnings instead of broken panels.

## Test Plan

Use Vitest for pure functions, Testing Library for client components, and
Playwright for browser smoke flows.

### Coverage Diagram

```text
CODE PATHS                                           USER FLOWS
[+] lib/analyzer.ts                                  [+] Create default product
  +-- [GAP] default hydration prompt -> bottle          +-- [GAP] [E2E] upload optional, prompt, generate
  +-- [GAP] lamp/chair/box/device keywords              +-- [GAP] disabled generate while pending
  +-- [GAP] unknown category -> bottle fallback         +-- [GAP] validation error blocks submit

[+] lib/upload-validation.ts                         [+] Result route
  +-- [GAP] valid image file                            +-- [GAP] [E2E] /result/smart-hydration-bottle loads
  +-- [GAP] wrong MIME type                             +-- [GAP] missing id shows not-found state
  +-- [GAP] zero-byte file
  +-- [GAP] too-large file                           [+] AR route
                                                        +-- [GAP] [E2E] /ar/smart-hydration-bottle renders model-viewer
[+] lib/assets.ts                                      +-- [GAP] preview-only fallback message can render
  +-- [GAP] bottle has GLB path
  +-- [GAP] unsupported category maps to bottle       [+] Build Pack route
  +-- [GAP] optional USDZ/ios-src handling              +-- [GAP] generated files render as escaped text
                                                        +-- [GAP] README/Codex framing is visible
[+] lib/build-pack.ts
  +-- [GAP] full artifact set generated
  +-- [GAP] prompt-derived strings escaped
  +-- [GAP] missing fields produce warnings

[+] local-prototype-store.ts
  +-- [GAP] localStorage available -> save/load
  +-- [GAP] localStorage unavailable -> graceful fallback
  +-- [GAP] malformed stored JSON ignored

COVERAGE NOW: 0/24 planned paths tested (0%)
REQUIRED BEFORE SHIP: all pure branches covered, plus 3 Playwright smoke flows
```

### Required Test Files

- `lib/analyzer.test.ts`
  - default prompt returns Smart Hydration Bottle spec.
  - each known category classifies deterministically.
  - unknown category falls back to bottle.
- `lib/upload-validation.test.ts`
  - accepts valid images.
  - rejects wrong MIME type, zero-byte files, and over-budget files.
- `lib/assets.test.ts`
  - bottle model requires a GLB path.
  - unsupported categories map to the known-good fallback.
  - `ios-src` is only emitted when an iOS-safe asset exists.
- `lib/build-pack.test.ts`
  - emits all required artifacts.
  - renders prompt-derived content safely.
  - reports missing-field warnings.
- `lib/local-prototype-store.test.ts`
  - handles available storage, unavailable storage, failed writes, and malformed
    JSON without throwing.
- `components/create/RealityCreateClient.test.tsx`
  - Generate disables while pending.
  - validation error blocks navigation.
- `e2e/reality-mvp.spec.ts`
  - `/` -> generate -> `/result/smart-hydration-bottle`.
  - `/result/smart-hydration-bottle` -> `/ar/smart-hydration-bottle`.
  - `/build-pack/smart-hydration-bottle` shows escaped generated files.

## Failure Modes

| Codepath | Production failure | Test coverage required | User-facing handling |
|---|---|---|---|
| Upload validation | User selects PDF, empty file, or huge image | Unit and component tests | Inline error, Generate blocked |
| Analyzer | Prompt has no known category | Unit test | Bottle fallback with visible fallback copy |
| Local storage | Private mode or quota blocks writes | Unit test | Continue with seeded slug route |
| Result route | Unknown or stale id | Component/route smoke | Not-found state with link home |
| Model preview | GLB missing or bad asset | Asset unit test plus manual preflight | Preview error and fallback copy |
| AR launch | Device lacks WebXR/Scene Viewer/Quick Look | Playwright smoke plus manual phone preflight | Preview-only compatibility banner |
| Build Pack | Prompt contains HTML/script text | Unit test | Escaped text rendering only |
| Mocked Meshy timeline | User reads mocked state as real generation | Component test for labels | Explicit "fallback ready" and "custom generation optional" copy |

Critical gap before implementation: there are currently no real model assets and
no test runner. The implementation must add both before claiming Vercel readiness.

## Manual Preflight

Run this on the exact demo phone before judging:

```text
1. Deploy Vercel preview.
2. Open /result/smart-hydration-bottle on desktop.
3. Open /ar/smart-hydration-bottle on the phone.
4. Confirm model-viewer loads /models/bottle.glb.
5. Tap View in AR.
6. Confirm AR placement works, or preview-only fallback copy is clear.
7. Record a 20-30 second screen capture backup after the route works.
```

## Implementation Order

```text
1. Scaffold Next.js, TypeScript, Tailwind, ESLint, Vitest, Playwright.
2. Add typed domain modules and seeded `smart-hydration-bottle` registry.
3. Add upload validation and create-screen client island.
4. Add result route and model preview component.
5. Add AR route and `<model-viewer>` client component.
6. Add Build Pack generator and viewer.
7. Add PWA manifest metadata.
8. Add tests and Playwright smoke flow.
9. Deploy to Vercel preview and run manual phone preflight.
```

## Worktree Parallelization Strategy

This can be split after the base scaffold and shared domain types exist.

| Step | Modules touched | Depends on |
|---|---|---|
| Base scaffold and types | app/, lib/, config files | - |
| Create/result flow | components/create/, components/result/, app/, lib/ | Base scaffold and types |
| AR viewer | components/ar/, app/ar/, public/models/, lib/ | Base scaffold and types, bottle asset |
| Build Pack | components/build-pack/, app/build-pack/, lib/ | Base scaffold and types |
| Tests and E2E | tests/e2e/config | Feature modules |

Parallel lanes:

```text
Lane A: Base scaffold and types
Lane B: Create/result flow after Lane A
Lane C: AR viewer after Lane A, in parallel with Lane B if asset is ready
Lane D: Build Pack after Lane A, in parallel with Lane B and C
Lane E: Tests after each feature lands, final E2E after B+C+D
```

Conflict flags:

- `app/` and `lib/` are shared. Keep base types and registry merged before
  parallel work starts.
- `public/models/` ownership should stay with the AR lane.
- Build Pack content should consume `PrototypeSpec`, not duplicate product fields.

## Completion Summary

- Step 0: Scope Challenge: scope accepted as a Next.js TypeScript port of the
  existing standalone prototype.
- Architecture Review: 4 issues resolved by decisions D2-D5.
- Code Quality Review: TypeScript-only domain modules and client/server boundary
  required.
- Test Review: coverage diagram produced; 24 planned paths identified.
- Performance Review: no database or server hot path; largest risk is model asset
  weight on mobile.
- NOT in scope: written.
- What already exists: written.
- TODOS.md updates: no new TODOs required beyond the existing backup/export/phase
  2 persistence items.
- Failure modes: no silent critical gaps allowed; all known failure modes require
  either tests or visible user fallback.
- Outside voice: skipped.
- Parallelization: 5 lanes, 3 parallel after base scaffold, final E2E sequential.
- Lake Score: 6/6 decisions chose the complete-enough option for the MVP.

## References

- Next.js App Router PWA manifest: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
- Next.js PWA guide: https://nextjs.org/docs/app/guides/progressive-web-apps
- model-viewer AR examples: https://modelviewer.dev/examples/augmentedreality/
