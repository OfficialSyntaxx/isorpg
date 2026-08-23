# Isoperia Asset Credits and License Inventory

This file is the acceptance record for art that is actually shipped in the
Unity mainland build. Do not add an asset to `Resources/` or a live scene until
there is a row here with a clear owner/source and license status.

| Asset | Live use | Owner/source | License status | Technical review |
| --- | --- | --- | --- | --- |
| Kenney Fantasy Town Kit 2.0 subset | Hearthvale roads, buildings, market and props | Kenney / curated project subset | CC0; bundled `LICENSE.txt` retained beside the asset | FBX imports, URP Lit materials, static use only |
| `villager.glb` | Hearthvale service NPCs | Isoperia owned model bundle | Owned project asset; no third-party purchase or attribution requirement recorded | glTFast import verified; child-renderer model, root interaction capsule, WebGL build validation pending M6 |

## Intake checklist

1. Record the source URL or owned-art provenance, license, and any attribution
   requirement before importing.
2. Keep the source license text with the asset when it supplies one.
3. Verify URP materials, scale, pivot, interaction collider, and a WebGL build
   before replacing a fallback in a live district.
4. Reject paid, trial-only, or license-unclear assets. Blender-created glue art
   is recorded as `Isoperia original` with its source `.blend` path.
