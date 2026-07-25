# Collaboration Board

`AGENTS.md` is canonical. Update this board when taking ownership or handing work
off; do not use it to expand scope.

| Priority | Workstream | Owner | Status | Blocker / next smallest action |
| --- | --- | --- | --- | --- |
| P0 | Reproducible install and quality gate | Codex (pre-event) | Done | Keep `npm run verify` green |
| P0 | Legacy catalog fixture and validator tests | Codex | Done | Fixture remains test-only and never renders as a runtime fallback |
| P0 | Supabase online catalog and scheduled ingestion | Codex | In progress | Dry run passed 36 IKEA / 56 Target / 35 Wayfair; add `SUPABASE_SECRET_KEY`, publish, and run the 100-product live gate |
| P0 | WebXR three-point footprint feasibility spike | Unassigned | Ready | Test hit-test and `local-floor` on both demo Android phones |
| P0 | Conservative fit-engine semantics and tests | Codex | Done | Space and advisory access predicates are pure and covered by unit tests |
| P0 | Manual measurement fallback | Unassigned | Hold for kickoff | Reuse the agreed `SpaceMeasurement` contract |
| P0 | Fit and near-miss comparison UI | Codex | Done | `/fit` separates passing, access-failing, and space near-miss products |
| P0 | Public HTTPS deployment and device preflight | Unassigned | Ready | Confirm camera permission on deployed origin; record device/browser results |
| P1 | Hero GLB/USDZ asset set | Codex | Done | Six cached GLB references and three USDZ references use scale-verified procedural assets |
| P1 | Cached demo query and measurement | Codex | Done | Three deterministic queries use the 900 × 1800 × 350 mm / 820 mm fallback |
| P1 | True-scale placement and product swap | Unassigned | Hold for kickoff | Preserve the measurement coordinate frame; needs hero assets |
| P1 | 90-second demo and recovery rehearsal | Unassigned | Blocked | Run after the final deployed path and device preflight |
| Deferred | Old Build Pack export and prototype persistence | Unassigned | Superseded | Not part of the fit-first Night Hack demo |
| Deferred | Major dependency security migration | Unassigned | Post-hackathon | Evaluate Next.js 16 and Vitest 4; the current audit still reports transitive/development-tool advisories |

Status meanings: **Ready** can start as disclosed pre-event risk reduction,
**Hold for kickoff** is intentionally reserved for judged integration work,
**Blocked** needs the stated dependency, and **Done** has passed its handoff gate.
