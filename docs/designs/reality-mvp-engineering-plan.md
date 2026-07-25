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
| D4 | Fallback-first plus optional real Meshy generation | Generate a deterministic fallback prototype immediately, then run Meshy Image-to-3D/Text-to-3D as a non-blocking enhancement when configured. Meshy must never block the AR reveal. |
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

## Product Pipeline Decision

The MVP must preserve the real product promise:

```text
IMAGE + TEXT
  -> product understanding / refined 3D prompt
  -> fallback prototype immediately
  -> optional Meshy custom model generation
  -> real AR handoff through <model-viewer>
```

The implementation is still fallback-first for demo reliability. That does not
mean Meshy is fake or out of scope. It means the app must complete the AR path
before waiting for custom generation. Meshy is a product upgrade lane, not the
critical path for the judge reveal.

### Generation Priority

```text
1. Always create a fallback-ready PrototypeSpec synchronously.
2. If image input exists and Meshy is enabled, start Image-to-3D first.
3. If Image-to-3D cannot run or fails, attempt Text-to-3D from the refined prompt.
4. If Meshy is disabled, pending, failed, timed out, rate-limited, or malformed,
   preserve the fallback model and visible fallback-ready state.
5. If Meshy succeeds with a loadable GLB, promote the model source to generated
   and update the same-device PrototypeSpec.
```

### Input Semantics

```text
uploaded image/sketch  -> geometry and silhouette anchor
text prompt            -> product intent, materials, behavior, target user
refined 3D prompt      -> normalized instruction for Meshy generation
fallback registry      -> immediate validated AR-safe demo asset
```

## NOT In Scope

- Native mobile app.
- User accounts, auth, or database.
- Custom camera streaming.
- Complex 3D editor or multi-user collaboration.
- Live Codex invocation during the demo.
- Meshy as a blocking dependency for the demo.
- OpenAI vision as a required dependency for the first demo path.
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
  meshy-client.ts                 server-side Meshy API boundary
  model-generation.ts             generation state machine and fallback promotion
  prototype-registry.ts          seeded static slugs
  prototype-types.ts             shared domain types and status unions
  upload-validation.ts           image type/size/zero-byte validation

app/api/
  generate-model/route.ts         optional non-blocking Meshy generation endpoint
```

### Dependency Graph

```text
prototype-types.ts
  +--> analyzer.ts
  +--> assets.ts
  +--> model-generation.ts
  +--> prototype-registry.ts
  +--> build-pack.ts
  +--> local-prototype-store.ts

model-generation.ts
  +--> meshy-client.ts
  +--> assets.ts

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
    generationMode?: none | image-to-3d | text-to-3d
    remoteModelUrl?
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

Generation must also carry a visible reason for fallback:

```text
FallbackReason =
  none
  | meshy-disabled
  | missing-api-key
  | image-generation-failed
  | text-generation-failed
  | timeout
  | invalid-model-url
  | unsupported-category
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
  +-- fallback model is ready immediately
  +-- save same-device copy to localStorage if available
  +-- seeded slug remains source of truth for cross-device demo
  +-- optional: POST /api/generate-model with image + refined prompt
  v
/result/[id]
  |
  +-- product analysis
  +-- model preview
  +-- Meshy timeline: disabled | pending | succeeded | failed | timeout
  +-- fallback-ready state remains visible while Meshy runs
  +-- AR compatibility copy
  +-- View in AR -> /ar/[id]
  +-- Build Pack -> /build-pack/[id]
```

### Optional Meshy Flow

```text
/api/generate-model
  |
  +-- validate feature flag and MESHY_API_KEY
  +-- prefer Image-to-3D when image data is available
  +-- fall back to Text-to-3D when image generation fails
  +-- poll with timeout budget
  +-- validate returned GLB URL is present/loadable
  +-- return generated model metadata, never throw into the user flow
```

The client may update same-device localStorage with a generated model once it
arrives. The seeded static route must continue to work without that custom model.

## Route Contract

### `/`

Mobile-first creation surface:

- Upload area using `<input type="file" accept="image/*" capture="environment" />`.
- Prompt textarea with default example chips.
- Generate button.
- Inline validation errors.
- Deterministic navigation to `/result/smart-hydration-bottle` for the default
  demo prompt.
- Starts optional Meshy generation only after the fallback spec has been created
  and navigation is safe.

### `/result/[id]`

Result surface:

- Server shell resolves seeded spec by `id`.
- Client component merges same-device localStorage spec when available.
- Unknown `id` shows a typed not-found state, not a blank page.
- Real 3D preview uses the same model registry as AR.
- The page hierarchy is AR reveal first, Build Pack proof second.
- Meshy progress is honest and non-blocking: `fallback ready` must be the stable
  state, while custom generation is shown as an upgrade.

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

Generated Meshy assets are treated as same-device enhancements until a file is
validated and persisted into the deployable asset path. The MVP may use a remote
generated GLB URL for preview if it loads in `<model-viewer>`, but the fallback
asset remains the guaranteed AR route.

```text
model source         behavior
------------         --------
fallback             validated local GLB/USDZ path; demo-critical
generated-remote     optional Meshy GLB URL; same-device enhancement
generated-local      downloaded/persisted GLB path; post-MVP or if time allows
```

## Client/Server Boundary

```text
SERVER-SAFE
  app/*/page.tsx
  app/api/generate-model/route.ts
  lib/analyzer.ts
  lib/assets.ts
  lib/build-pack.ts
  lib/meshy-client.ts
  lib/model-generation.ts
  lib/prototype-registry.ts
  lib/prototype-types.ts
  lib/upload-validation.ts

BROWSER-ONLY CLIENT ISLANDS
  file input and preview
  localStorage reads/writes
  navigator/browser capability checks
  model-viewer web component registration
  optional model generation progress polling
```

Do not call `window`, `document`, `localStorage`, `FileReader`, or custom element
APIs outside client components or guarded browser helpers.

## Build Pack Security

- Never use `dangerouslySetInnerHTML` for generated artifact content.
- Render code and markdown as text nodes.
- Escape prompt-derived content in generated JSON/code strings.
- Validate generated artifact shape before display so missing fields show explicit
  warnings instead of broken panels.
- Treat Meshy URLs and prompt-derived fields as untrusted data. Never render them
  as HTML; store/display them as escaped text or validated URL strings.

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

[+] lib/model-generation.ts
  +-- [GAP] fallback spec returns immediately
  +-- [GAP] Meshy disabled -> disabled state
  +-- [GAP] Image-to-3D preferred when image exists
  +-- [GAP] Text-to-3D fallback after image failure
  +-- [GAP] failed/timeout/malformed output preserves fallback

COVERAGE NOW: 0/29 planned paths tested (0%)
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
- `lib/model-generation.test.ts`
  - fallback-ready spec is returned before Meshy resolution.
  - Meshy disabled/missing key returns disabled state.
  - Image-to-3D is preferred when an image is available.
  - Text-to-3D is attempted after Image-to-3D failure.
  - failed, timed out, or malformed Meshy output preserves fallback GLB.
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
| Meshy generation | API disabled, slow, failed, rate-limited, or malformed output | Unit tests for generation state machine | Preserve fallback; show custom generation as optional upgrade |

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
8. Only after the fallback reveal works, enable Meshy and verify that failure or
   timeout does not block the AR route.
```

## Implementation Order

```text
1. Scaffold Next.js, TypeScript, Tailwind, ESLint, Vitest, Playwright.
2. Add typed domain modules and seeded `smart-hydration-bottle` registry.
3. Add upload validation and create-screen client island.
4. Add result route and model preview component.
5. Add AR route and `<model-viewer>` client component.
6. Add Build Pack generator and viewer.
7. Add optional Meshy generation endpoint/state machine behind feature flag.
8. Add PWA manifest metadata.
9. Add tests and Playwright smoke flow.
10. Deploy to Vercel preview and run manual phone preflight.
11. Enable Meshy only after fallback AR is verified.
```

## Worktree Parallelization Strategy

This can be split after the base scaffold and shared domain types exist.

| Step | Modules touched | Depends on |
|---|---|---|
| Base scaffold and types | app/, lib/, config files | - |
| Create/result flow | components/create/, components/result/, app/, lib/ | Base scaffold and types |
| AR viewer | components/ar/, app/ar/, public/models/, lib/ | Base scaffold and types, bottle asset |
| Optional Meshy generation | app/api/generate-model/, lib/meshy-client.ts, lib/model-generation.ts | Base scaffold and types |
| Build Pack | components/build-pack/, app/build-pack/, lib/ | Base scaffold and types |
| Tests and E2E | tests/e2e/config | Feature modules |

Parallel lanes:

```text
Lane A: Base scaffold and types
Lane B: Create/result flow after Lane A
Lane C: AR viewer after Lane A, in parallel with Lane B if asset is ready
Lane D: Build Pack after Lane A, in parallel with Lane B and C
Lane E: Optional Meshy generation after Lane A, never blocking B/C/D
Lane F: Tests after each feature lands, final E2E after B+C+D
```

Conflict flags:

- `app/` and `lib/` are shared. Keep base types and registry merged before
  parallel work starts.
- `public/models/` ownership should stay with the AR lane.
- `lib/model-generation.ts` owns the Meshy/fallback state machine. UI should
  consume its statuses, not invent separate generation states.
- Build Pack content should consume `PrototypeSpec`, not duplicate product fields.

## Completion Summary

- Step 0: Scope Challenge: scope accepted as a Next.js TypeScript port of the
  existing standalone prototype.
- Architecture Review: 5 issues resolved by decisions D2-D5 and the non-blocking
  Meshy generation amendment.
- Code Quality Review: TypeScript-only domain modules and client/server boundary
  required.
- Test Review: coverage diagram produced; 29 planned paths identified.
- Performance Review: no database or server hot path; largest risk is model asset
  weight on mobile.
- NOT in scope: written and narrowed so Meshy is optional, not removed.
- What already exists: written.
- TODOS.md updates: no new TODOs required beyond the existing backup/export/phase
  2 persistence items.
- Failure modes: no silent critical gaps allowed; all known failure modes require
  either tests or visible user fallback.
- Outside voice: skipped.
- Parallelization: 6 lanes, 4 parallel after base scaffold, final E2E sequential.
- Lake Score: 6/6 decisions chose the complete-enough option for the MVP while
  preserving the real image/text-to-3D differentiator.

## References

- Next.js App Router PWA manifest: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
- Next.js PWA guide: https://nextjs.org/docs/app/guides/progressive-web-apps
- model-viewer AR examples: https://modelviewer.dev/examples/augmentedreality/
