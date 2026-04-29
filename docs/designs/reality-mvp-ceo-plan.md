---
status: ACTIVE
review: plan-ceo-review
date: 2026-04-29
branch: main
mode: SELECTIVE_EXPANSION
repo: 34wizrd/chain-broker-hackathon
---

# CEO Plan: Reality MVP

Reality MVP is not a generic sketch-to-3D wrapper. The winning version is a runnable spatial MVP compiler: a founder sketches or describes a product, Codex produces the runnable AR app layer around it, and the judge scans a QR code to place the object on a real table.

The 3D model is one ingredient. The proof is the generated route, config, callouts, docs, validation checklist, and mobile AR handoff.

## Approved Approach

Use **Hybrid fallback-first plus optional Meshy**.

The product always completes the deterministic fallback path first. Meshy runs as an enhancement and must never block the phone AR reveal. If Meshy succeeds with a loadable GLB, the app can show it as a custom model upgrade. If Meshy fails, times out, or returns a bad asset, the fallback path remains the live demo.

## Scope Decisions

| # | Proposal | Effort | Decision | Reasoning |
|---|----------|--------|----------|-----------|
| 1 | iOS-safe AR assets with USDZ/ios-src fallback | S | ACCEPTED | Protects the phone reveal on iPhone and Android instead of assuming GLB works everywhere. |
| 2 | Demo preflight checklist for exact phone, QR, asset, and network path | S | ACCEPTED | Turns live-demo failures into visible readiness checks before judging. |
| 3 | Recorded backup mode inside product UI | S | DEFERRED | A recording should exist operationally, but in-app backup UI risks making the live product feel staged. |
| 4 | Build Pack export/download bundle | M | DEFERRED | Inspectable generated artifacts are enough for the first demo; export is post-demo handoff polish. |
| 5 | Meshy progress timeline with non-blocking fallback-ready state | S | ACCEPTED | Makes the hybrid strategy legible: fallback is ready now, custom generation is an upgrade path. |
| 6 | AR compatibility banner for device/browser/asset mode | S | ACCEPTED | Prevents silent AR failure and gives presenter-friendly language when AR degrades to 3D. |

## Accepted Scope

- Add iOS-safe AR path with one validated bottle GLB + USDZ pair first.
- Add a demo preflight checklist that validates target phone, QR route, HTTPS/network path, model load, and AR/3D fallback behavior.
- Add a Meshy progress timeline where fallback readiness appears immediately and Meshy remains a non-blocking enhancement.
- Add an AR compatibility banner that explains preview, Android AR, iOS Quick Look, and graceful fallback modes.
- Feature-flag Meshy with fallback always on.
- Use static slug registry plus localStorage enhancement for cross-device QR handoff.
- Add typed error/status unions for validation, assets, Meshy, storage, and AR compatibility.
- Render Build Pack generated content as escaped text only.
- Add upload guardrails for file type, size, and zero-byte files.
- Make Generate deterministic/idempotent with disabled in-flight UI.
- Centralize `PrototypeSpec` generation and registry.
- Add focused tests plus manual phone preflight.
- Set a mobile asset performance budget and validate the final bottle asset on the target phone.
- Add lightweight preflight/debug diagnostics.
- Use Vercel preview as the primary demo URL.
- Put AR reveal first and Build Pack proof second on the result page.

## Deferred To TODOs

- Record a 20-30 second phone AR backup before judging.
- Add Build Pack export/download so generated files can be packaged after the inspectable panel is convincing.
- Document and later build Phase 2 prototype persistence for real cross-device sharing.

## Baseline Architecture

```text
Create Page (/)
  -> image upload + prompt
  -> typed analyzer
  -> PrototypeSpec
  -> static slug registry + localStorage enhancement
  -> result page (/result/[id])
       -> model preview
       -> Meshy progress timeline
       -> AR compatibility banner
       -> QR / AR CTA
       -> Build Pack link
  -> AR page (/ar/[id])
       -> model-viewer
       -> GLB preview
       -> iOS USDZ/ios-src path
       -> Android Scene Viewer/WebXR path
  -> Build Pack (/build-pack/[id])
       -> generated route/config/docs/validation artifacts as escaped text
```

## Data Flow

```text
IMAGE + PROMPT
  |
  | nil? empty? too large? wrong type?
  v
VALIDATION
  |
  | invalid -> inline error, no prototype
  v
TRANSFORM
  |
  | analyzer error -> deterministic fallback spec
  | unknown category -> bottle fallback
  v
PERSIST / REGISTRY
  |
  | localStorage fails -> static slug registry
  | laptop/phone mismatch -> static slug route still works
  v
OUTPUT
  |
  | result page -> model preview -> AR route -> Build Pack
  | stale/missing id -> not-found state
```

## State Machine

```text
IDLE
  -> VALIDATING_INPUT
  -> ANALYZING
  -> FALLBACK_READY
  -> BUILD_PACK_READY
  -> QR_READY
  -> PHONE_AR_VERIFIED

Optional:
FALLBACK_READY
  -> MESHY_DISABLED
  -> MESHY_PENDING
  -> MESHY_SUCCEEDED -> CUSTOM_MODEL_READY
  -> MESHY_FAILED    -> FALLBACK_READY
  -> MESHY_TIMEOUT   -> FALLBACK_READY
```

## Error & Rescue Contract

- Validation errors block submit and show inline messages.
- Unknown category defaults to the validated bottle path with visible fallback copy.
- Missing slug shows a not-found state, not a blank page.
- localStorage failures fall back to the static slug registry.
- GLB/USDZ/model-viewer failures show compatibility or model-load messages.
- Meshy disabled, timed out, failed, rate-limited, or malformed output all preserve fallback readiness.
- Build Pack generation errors show partial artifacts plus explicit missing-field warnings.

## Security Requirements

- Render Build Pack generated content as escaped text only. Do not use `dangerouslySetInnerHTML`.
- Validate upload type, size, and zero-byte files before preview or analysis.
- Treat remote Meshy model URLs as untrusted until the result has a loadable GLB URL.
- Keep prompt-derived content out of HTML rendering paths.

## Test Gate

- Unit test analyzer category classification and fallback-to-bottle behavior.
- Unit test upload validation.
- Unit test asset registry requiring GLB and iOS-safe asset for the bottle path.
- Unit test Build Pack escaping for prompt-derived content.
- Unit test static slug registry for `smart-hydration-bottle`.
- Unit test Meshy disabled, pending, succeeded, failed, and timeout states.
- Component/system test Generate disabled while pending.
- Component/system test unknown slug not-found state.
- Manual preflight: QR opens exact Vercel preview route on target phone.
- Manual preflight: model renders and AR/3D fallback works on target phone.

## Deployment Plan

Primary demo delivery is Vercel preview.

```text
1. Source validated bottle GLB + USDZ assets.
2. Build fallback-first app.
3. Deploy to Vercel preview.
4. Open QR on exact phone.
5. Run preflight checklist.
6. Record backup reveal.
7. Enable Meshy flag/key only after fallback path is verified.
```

Rollback:

```text
Bad deploy?
  |
  +-- UI bug only -> redeploy previous commit / Vercel rollback
  |
  +-- Meshy breaks -> disable Meshy flag, fallback remains
  |
  +-- asset fails -> switch registry to known-good bottle asset
  |
  +-- AR unsupported -> show 3D preview + recorded backup
```

## Result Page Hierarchy

The result page should optimize for the judge memory:

1. Generated product and model preview.
2. QR / View in AR call to action.
3. Meshy progress timeline and compatibility state.
4. Build Pack proof.
5. Preflight/debug details behind a secondary disclosure.

## Not In Scope

- Native mobile app.
- User accounts or auth.
- Database in MVP.
- Custom camera streaming.
- Complex 3D editor.
- Multi-user collaboration.
- Live Codex invocation during the demo.
- Build Pack download/export in first implementation.
