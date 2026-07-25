# TODOs

## P1 - Record AR Reveal Backup

What: Record a 20-30 second phone AR reveal backup before judging.

Why: Protects the presentation if venue Wi-Fi, QR routing, iOS Quick Look, Android Scene Viewer, or model loading fails live.

Context: Keep this as demo operations, not visible product UI. Record after the final bottle GLB/USDZ assets pass phone preflight, and store the clip somewhere the presenter can reach quickly.

Effort: S human, S with CC+gstack.

Depends on: successful phone preflight with the final bottle asset.

## P2 - Build Pack Export

What: Add export/download for generated Build Pack files.

Why: Converts the Build Pack from inspectable proof into a developer handoff artifact.

Context: First implementation should render generated route/config/docs/validation files as escaped text. Add packaging only after the Build Pack panel is convincing.

Effort: M human, S with CC+gstack.

Depends on: central `PrototypeSpec` and Build Pack generator.

## P2 - Phase 2 Prototype Persistence

What: Add server persistence for generated prototypes after the hackathon.

Why: Static slug registry works for the demo, but real users need shareable generated prototypes across devices.

Context: MVP should use static slug registry plus localStorage enhancement. Phase 2 can add persisted prototype records, custom QR links, history, sharing, and generated model handoff.

Effort: L human, M with CC+gstack.

Depends on: stable `PrototypeSpec`, route shape, and Build Pack schema.
