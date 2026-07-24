# Collaboration Board

`AGENTS.md` is canonical. Update this board when taking ownership or handing work
off; do not use it to expand scope.

| Priority | Workstream | Owner | Status | Blocker / next smallest action |
| --- | --- | --- | --- | --- |
| P0 | Reproducible install and quality gate | Codex (pre-event) | Done | Keep `npm run verify` green |
| P0 | Static catalog schema, fixtures, and validator | Unassigned | Ready | Agree on shared catalog and dimension types before parallel work |
| P0 | WebXR three-point footprint feasibility spike | Unassigned | Ready | Test hit-test and `local-floor` on both demo Android phones |
| P0 | Conservative fit-engine semantics and tests | Unassigned | Ready | Centralize uncertainty and clearance policy; do not couple to UI |
| P0 | Manual measurement fallback | Unassigned | Hold for kickoff | Reuse the agreed `SpaceMeasurement` contract |
| P0 | Fit and near-miss comparison UI | Unassigned | Hold for kickoff | Needs validated catalog records and fit-engine output |
| P0 | Public HTTPS deployment and device preflight | Unassigned | Ready | Confirm camera permission on deployed origin; record device/browser results |
| P1 | Hero GLB/USDZ asset set | Unassigned | Ready | Select verified products, optimize assets, and record scale metadata |
| P1 | Cached demo query and measurement | Unassigned | Ready | Choose one awkward-space story and deterministic fallback |
| P1 | True-scale placement and product swap | Unassigned | Hold for kickoff | Preserve the measurement coordinate frame; needs hero assets |
| P1 | 90-second demo and recovery rehearsal | Unassigned | Blocked | Run after the final deployed path and device preflight |
| Deferred | Old Build Pack export and prototype persistence | Unassigned | Superseded | Not part of the fit-first Night Hack demo |
| Deferred | Major dependency security migration | Unassigned | Post-hackathon | Evaluate Next.js 16 and Vitest 4; the current audit still reports transitive/development-tool advisories |

Status meanings: **Ready** can start as disclosed pre-event risk reduction,
**Hold for kickoff** is intentionally reserved for judged integration work,
**Blocked** needs the stated dependency, and **Done** has passed its handoff gate.
