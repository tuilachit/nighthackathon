# Teammate Handoff Guide

Use this guide when changing lanes, stopping work, or asking a teammate or coding
agent to continue a task. `AGENTS.md` remains the source of truth.

## Before Starting

1. Read `AGENTS.md` and the current row in `TODOS.md`.
2. Confirm whether the work is disclosed pre-event preparation or Night Hack
   implementation.
3. Check the working tree and preserve changes you do not own.
4. Announce edits to shared contracts before changing catalog types, measurement
   state, the fit engine, or the top-level flow.
5. Start from the smallest unblocked outcome and avoid unrelated baseline debt.

## Before Handing Off

1. Run the narrowest relevant tests, then `npm run verify` when practical.
2. Record real device, browser, and deployed-origin checks separately; do not
   imply automated tests cover AR hardware.
3. Leave the branch in a reviewable state with no credentials or private event
   information.
4. Update the owner/status/blocker in `TODOS.md` if responsibility changed.
5. Paste the template below into the pull request, issue, or teammate message.

## Handoff Template

```md
### Outcome
<!-- What now works or what decision was reached? -->

### Event classification
- [ ] Disclosed pre-event preparation
- [ ] Night Hack implementation
- Starting commit/tag:

### Files changed
- `path/to/file` — reason

### Contracts changed
<!-- Shared types/state/fit semantics, or "None". -->

### Validation
- Automated:
- Device/browser:
- Deployed URL:

### Known failures or assumptions
-

### Next smallest unblocked task
-
```

Keep claims observable. “Unit tests pass” is different from “measurement works
on both Android demo phones,” and both are different from “the public deployment
works on venue-like Wi-Fi.”
