# Collaboration Board

`AGENTS.md` is canonical. Update this board when taking ownership or handing work
off; do not use it to expand scope.

| Priority | Workstream | Owner | Status | Blocker / next smallest action |
| --- | --- | --- | --- | --- |
| P0 | Reproducible install and quality gate | Codex (pre-event) | Done | Keep `npm run verify` green |
| P0 | Bundled catalog snapshot | DATA RESCUE | In progress | Publish validated records to an offline-first snapshot |
| P0 | WebXR three-point footprint and manual fallback | XR lane | Done | Real Android phone test remains |
| P0 | Conservative fit-engine semantics and tests | Shared | Done | Search and XR call the same conservative policy |
| P0 | Fit and near-miss comparison UI | Shared | Done | `/fit` separates passing, access-failing, and space near-miss products |
| P0 | Public HTTPS deployment and device preflight | DEMO PROOF | In progress | Verify deployed Pixel 5 flow and offline behavior |
| P1 | Cached demo query and measurement | Shared | Done | Three deterministic queries use the 900 × 1800 × 350 mm / 820 mm fallback |
| P1 | True-scale placement and product swap | XR lane | Ready | Needs real device test |
| P1 | 90-second demo and recovery rehearsal | Unassigned | Blocked | Run after the final deployed path and device preflight |
| Deferred | Old Build Pack export and prototype persistence | Unassigned | Superseded | Not part of the fit-first Night Hack demo |
| Deferred | Major dependency security migration | Unassigned | Post-hackathon | Evaluate Next.js 16 and Vitest 4; the current audit still reports transitive/development-tool advisories |

Status meanings: **Ready** can start as disclosed pre-event risk reduction,
**Hold for kickoff** is intentionally reserved for judged integration work,
**Blocked** needs the stated dependency, and **Done** has passed its handoff gate.
