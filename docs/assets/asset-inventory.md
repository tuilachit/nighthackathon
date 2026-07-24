# Demo Asset Inventory

This inventory covers the public assets retained after removing the unused
Next.js starter SVGs. An asset being loadable does not make it accurate,
licensed for external use, or ready for a true-scale furniture demo.

| Public path | Current purpose | Demo readiness | Scale status | Source and license status | Required action |
| --- | --- | --- | --- | --- | --- |
| `/window.svg` | Manifest icon referenced by `app/manifest.ts` | Usable as a temporary app icon; not product-branded | Not applicable | Inherited starter asset; no separate source or license record in this repository | Replace with a product-owned icon before public launch and record its provenance |
| `/models/bottle.glb` | Legacy model-generation fallback referenced by application code and browser smoke coverage | **Placeholder only.** It must not represent a real product or hero furniture asset | Unknown real-world scale. Its embedded bounds are `0.9 × 1.0 × 0` in unlabeled glTF units, so it also has no usable depth | Embedded generator is `Reality MVP placeholder`; no source URL or explicit license record is present | Keep only for legacy fallback coverage; do not claim true scale. Replace hero assets with measured, licensed GLB/USDZ files and record dimensions, scale, source, and license |

## Removed starter assets

The following public files had no references outside their own files and were
removed:

- `/file.svg`
- `/globe.svg`
- `/next.svg`
- `/vercel.svg`

Before adding a product model to the demo catalog, record:

- source URL or creator;
- license and redistribution permission;
- physical width, height, and depth in millimetres;
- the conversion between model units and metres;
- orientation and origin assumptions;
- matching GLB/USDZ paths, if both formats are offered;
- a tested device/browser and the date tested.
