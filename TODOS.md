# Collaboration Board

`AGENTS.md` is canonical. Update this board when taking ownership or handing work
off; do not use it to expand scope.

| Priority | Workstream | Owner | Status | Blocker / next smallest action |
| --- | --- | --- | --- | --- |
| P0 | Reproducible install and quality gate | Codex (pre-event) | Done | Keep `npm run verify` green |
| P0 | Static catalog schema, fixtures, and validator | Unassigned | Ready | Agree on shared catalog and dimension types before parallel work |
| P0 | WebXR three-point footprint feasibility spike | Claude (hungtruongOwolf) | Ready | `components/xr/XRMeasurementClient.tsx` implements averaged-pose hit-test capture + anchors; still needs a real Android phone test |
| P0 | Conservative fit-engine semantics and tests | Claude (hungtruongOwolf) | Done | `lib/measurement-geometry.ts` + `lib/fit-engine.ts` land with centralized clearance policy and full test matrix; not yet wired to any UI |
| P0 | Manual measurement fallback | Claude (hungtruongOwolf) | Done | `components/xr/ManualMeasurementForm.tsx`; wired as the automatic fallback in `/space/scan` when WebXR is unsupported |
| P0 | Fit and near-miss comparison UI | Unassigned | Hold for kickoff | Needs validated catalog records and fit-engine output |
| P0 | Public HTTPS deployment and device preflight | Unassigned | Ready | Confirm camera permission on deployed origin; record device/browser results |
| P1 | Hero GLB/USDZ asset set | Unassigned | Ready | `public/models/unit-box.glb` (generic 1m placeholder box) added; still need real verified hero GLB/USDZ per product |
| P1 | Cached demo query and measurement | Unassigned | Ready | Choose one awkward-space story and deterministic fallback |
| P1 | True-scale placement and product swap | Claude (hungtruongOwolf) | Ready | `lib/model-scaling.ts` + `components/xr/XRPlacementClient.tsx` + `components/fit/ProductQuickLookViewer.tsx` land; `/space/scan` now hands its measurement to `/space/place` via `lib/space-measurement-params.ts` and each candidate's fit label is computed live with `evaluateFit`. Still uses a hardcoded demo catalog seed pending the real one; needs real device test |
| P1 | 90-second demo and recovery rehearsal | Unassigned | Blocked | Run after the final deployed path and device preflight |
| Deferred | Old Build Pack export and prototype persistence | Unassigned | Superseded | Not part of the fit-first Night Hack demo |
| Deferred | Major dependency security migration | Unassigned | Post-hackathon | Evaluate Next.js 16 and Vitest 4; the current audit still reports transitive/development-tool advisories |

Status meanings: **Ready** can start as disclosed pre-event risk reduction,
**Hold for kickoff** is intentionally reserved for judged integration work,
**Blocked** needs the stated dependency, and **Done** has passed its handoff gate.
