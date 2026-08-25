# Isoperia Asset Credits and License Inventory

This file is the acceptance record for art that is actually shipped in the
Unity mainland build. Do not add an asset to `Resources/` or a live scene until
there is a row here with a clear owner/source and license status.

| Asset | Live use | Owner/source | License status | Technical review |
| --- | --- | --- | --- | --- |
| `forrest_ground_01_diff_1k.jpg` | Restrained world-space terrain detail | [Poly Haven — Forest Ground 01](https://polyhaven.com/a/forrest_ground_01) | CC0 | Imported at 1K only for the browser/WebGL budget; vertex colours remain the gameplay-facing biome authority. |
| Kenney Fantasy Town Kit 2.0 subset | Hearthvale roads, buildings, market and props | Kenney / curated project subset | CC0; bundled `LICENSE.txt` retained beside the asset | FBX imports, URP Lit materials, static use only |
| `villager.glb` | Hearthvale service NPCs | Isoperia owned model bundle | Owned project asset; no third-party purchase or attribution requirement recorded | glTFast import verified; child-renderer model, root interaction capsule, WebGL build validation pending M6 |
| `hero_animated.fbx` (from `hero_rigged.glb`) | Player avatar, idle/walk/gather/attack/hit | Isoperia-owned mesh and Blender-authored rig-native clips (`tools/author_hero_animations.py`) | Original project art; no paid or third-party animation content is shipped | Imported Generic rig with `HeroController`; live Play Mode hierarchy and Animator verified, WebGL validation remains in the next release pass |
| `wayfinder_sign.fbx` | Sunmere and Ember Road route landmarks | Isoperia original Blender asset (`tools/create_wayfinder_sign.py`) | Original project art; no external source or paid content | FBX import verified; two live Play Mode landmark instances grounded to the mainland terrain |
| `campfire.fbx` | Hearthvale plaza hearth and player-built campfires | Isoperia original Blender asset (`tools/create_campfire_prop.py`) | Original project art; no external source or paid content | FBX imported, assigned URP materials at runtime, and verified in a fresh Play Mode session |
| `hearthvale_forge.fbx` | Hearthvale north-west work yard landmark | Isoperia original Blender asset (`tools/create_hearthvale_forge.py`) | Original project art; no external source or paid content | Y-up FBX import, runtime material palette, and live town placement verified; replaces the former house/watermill workshop composition with an actual forge silhouette |
| `wildwood_shrine.fbx` | Wildwood woodcutting-route shrine/ruin landmark | Isoperia original Blender asset (`tools/create_wildwood_shrine.py`) | Original project art; no external source or paid content | Y-up FBX import and live route placement verified; runtime palette preserves moss stone, timber, and emissive rune materials |
| `frostwatch_mine.fbx` | Frostwatch mining progression route entrance | Isoperia original Blender asset (`tools/create_frostwatch_mine.py`) | Original project art; no external source or paid content | Y-up FBX import; runtime palette supplies highland rock, timber supports, darkness, and emissive lanterns |
| `ore_vein.fbx` | Streamed mining nodes across the mainland; copper/tin/iron/coal palette comes from the authoritative resource definition | Isoperia original Blender asset (`tools/create_ore_vein_prop.py`) | Original project art; no external source or paid content | FBX import, live third-person copper-vein review, resource interaction collider, and EditMode validation verified; current WebGL release validation remains in M6 |
| `cinder_gate.fbx` | Cinder Hollow combat-route destination threshold | Isoperia original Blender asset (`tools/create_cinder_gate_prop.py`) | Original project art; no external source or paid content | Y-up FBX import reviewed in the live route scene; runtime basalt/rune palette and original kit fallback verified, EditMode validation passed; current WebGL release validation remains in M6 |
| `local_prop_trial.fbx` | Hearthvale east-road lantern and travel crate | Isoperia original Blender asset (`tools/blender/create_local_prop_trial.py`) | Original project art; generated entirely from local Blender geometry and materials, with no model/texture service | Blender review render and Unity reimport verified; runtime uses the shared URP palette. This is the first local asset-pipeline trial. |
| `forest_ogre.glb` | Mainland goblin combat silhouette | Isoperia owned model bundle | Owned project asset; no third-party purchase or attribution requirement recorded | glTFast import verified; root interaction capsule; WebGL build validation pending M6 |
| `dire_wolf.glb` | Mainland dire-wolf combat silhouette | Isoperia owned model bundle | Owned project asset; no third-party purchase or attribution requirement recorded | glTFast import verified; root interaction capsule; WebGL build validation pending M6 |

## Intake checklist

1. Record the source URL or owned-art provenance, license, and any attribution
   requirement before importing.
2. Keep the source license text with the asset when it supplies one.
3. Verify URP materials, scale, pivot, interaction collider, and a WebGL build
   before replacing a fallback in a live district.
4. Reject paid, trial-only, or license-unclear assets. Blender-created glue art
   is recorded as `Isoperia original` with its source `.blend` path.
