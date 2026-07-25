# Furniture test models

Source: [Kenney "Furniture Kit"](https://kenney.nl/assets/furniture-kit) (kenney.nl)
License: CC0 1.0 (public domain) — https://creativecommons.org/publicdomain/zero/1.0/
Attribution not required, credit appreciated.

Used as stand-in hero models while there is no Meshy-generated or verified
retailer GLB yet. Authored at real-world scale (1 unit = 1 metre); native
bounding boxes measured with three.js `Box3`:

| File | Width mm | Height mm | Depth mm |
| --- | --- | --- | --- |
| bookcase-open.glb | 400 | 880 | 250 |
| bookcase-closed-wide.glb | 800 | 790 | 250 |
| drawer-unit.glb | 430 | 450 | 450 |
| sideboard.glb | 534 | 384 | 222 |

The matching `.usdz` files are **not** from Kenney (the kit ships FBX/OBJ/glTF/DAE/STL,
no USDZ). They were generated locally from the `.glb` geometry with a small
pygltflib → USD Python script plus macOS's built-in `usdzip --arkitAsset`,
so iOS Quick Look has a real author-provided USDZ (auto-generated USDZ does not
honor `ar-scale="fixed"`; see `lib/model-scaling.ts`). Flat colors only, no
textures, so the conversion only needed points/normals/indices + a
UsdPreviewSurface per material — verify visually on a real iPhone before
trusting them for a live demo.
