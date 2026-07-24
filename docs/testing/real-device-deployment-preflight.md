# Deployed HTTPS and Real-Device Preflight

Playwright protects the legacy browser workflow only. Its Pixel viewport is
emulation and does **not** prove WebXR availability, camera permission behavior,
measurement accuracy, Android AR placement, iPhone Quick Look, or true physical
scale. Run this matrix against the exact public HTTPS deployment used for the
demo.

## Test record

Complete these fields before testing:

- Deployment URL:
- Commit SHA:
- Test date and venue/network:
- Android A model / OS / Chrome version:
- Android B model / OS / Chrome version:
- iPhone model / iOS / Safari version:
- Tester:

Capture a short screen recording for each device path and link it in the
Evidence column. Record failures with reproduction steps; do not convert them
to passes because a fallback exists.

## Manual matrix

| Device/path | Scenario | Procedure | Pass condition | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| Android A, deployed Chrome | HTTPS and WebXR capability | Open the deployment from a fresh tab, start the AR measurement path, and inspect the permission and session transition | Public URL has a valid certificate; the app detects the device capability correctly; an immersive session starts without a developer machine |  | Not run |
| Android B, deployed Chrome | Independent real-device repeat | Repeat the full measurement path on the second phone without reusing local state from Android A | The second phone starts cleanly, completes the path, and never depends on state stored on Android A |  | Not run |
| Android A and B | Controlled measurement | Measure the same known-width and known-depth target three times per phone; compare confirmed dimensions with a tape measure | Each run reports its error; target is within the documented 20–30 mm range or clearly requires manual correction |  | Not run |
| Android A | Camera denied | Reset site permission, deny camera access, then choose the recovery action | Denial is explained without a dead end; manual or demo measurement remains reachable in one action |  | Not run |
| Android A | Plane/point failure | Try a low-texture or poorly lit surface, wait for the documented timeout, then recover | The UI explains the issue and offers retry, undo/restart, and manual/demo fallback |  | Not run |
| Android A | Offline/cached fallback | Load the deployment and demo data once, enable airplane mode, reload or revisit as supported, and use the cached measurement/query path | The documented cached path works without AI or catalog network calls; if full reload is not supported, that limitation is recorded before demo day |  | Not run |
| Android A | Hero model load and scale | On a known measurement, load every hero GLB, place it, and compare a known model dimension with a tape measure | Each model loads from the deployed origin, retains the intended orientation, and matches its catalog dimensions within the stated tolerance |  | Not run |
| Android A | Model-load recovery | Block or disconnect the network before loading a non-cached model, then retry after restoring it | The app shows a bounded error, preserves the measurement, and can retry or use an exact-dimension fallback without restarting |  | Not run |
| iPhone, deployed Safari | Manual fit path | Open the deployment, enter width/depth/height manually, reach results, and compare a product | Fit/search works without WebXR and without misleading unsupported-camera prompts |  | Not run |
| iPhone, deployed Safari | Quick Look hero asset | Open each hero item with a verified USDZ and launch Quick Look | Quick Look opens the intended model at fixed scale; returning to Safari preserves enough state to continue |  | Not run |
| iPhone, deployed Safari | Quick Look unavailable or failed | Use an item without a working USDZ or cancel/fail the handoff | The normal 3D or exact-dimension fallback remains available and the fit result is not lost |  | Not run |
| All three phones | Retailer exit and return | Open a retailer link in a new tab, return to the app, and continue comparison/placement | The link is current, the original flow remains usable, and no cross-device state assumption appears |  | Not run |

## Demo-day gate

Do not call the AR path demo-ready until:

- both Android phones pass the deployed session and recovery rows;
- all hero GLBs used on stage pass model load and physical-scale checks;
- the iPhone passes manual entry and at least one verified Quick Look hero;
- camera denial and model-load failure both recover without remeasurement;
- the cached demo query and measurement are rehearsed on venue-like Wi-Fi;
- the deployment URL, commit SHA, device versions, evidence, and unresolved
  limitations are recorded above.

Browser smoke tests may remain green while any of these gates fail. Real-device
failures take precedence over emulation results for the live-demo decision.
