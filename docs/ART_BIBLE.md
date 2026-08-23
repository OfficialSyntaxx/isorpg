# Isoperia Unity Art Bible

## Visual contract

Isoperia uses a fixed 35.264° isometric camera and a restrained low-poly look:
muted natural terrain, warm settlement accents, simple silhouettes, and one
directional sun. Art must read at mobile/WebGL scale before it earns detail.

## Palette and materials

- Meadow foliage: `#2E612B`; trunks: `#452914`; rock: `#5C5E61`.
- Terrain follows the Core palette used by `WorldEnvironmentView`: grass,
  water, rock, dirt, sand, and road each retain a distinct readable value.
- Use URP Lit or Simple Lit with opaque surfaces. No transparent foliage,
  normal maps, or per-prop material variants in the first mobile pass.
- New external props are rematerialed to this palette/material family before
  entering the project.

## WebGL budgets

- Static props: ≤300 triangles each; characters: ≤2,000 triangles each.
- One 1024–2048 atlas per category; ASTC on mobile targets.
- Combine deterministic decoration into chunk/region meshes. Avoid one
  GameObject, renderer, or material instance per tree/rock.
- Fixed-camera rule: model visible tops/sides only; omit undersides, backs, and
  interior detail that the camera can never see.

## Current owned inventory

- Imported Unity models: hero, villager, forest ogre, cave brute, dire wolf,
  frost imp, cave slasher, and bog husk under `Assets/Isoperia/Art/Models/`.
- Item icons and their JSON manifests remain in `public/icons/`; the UI uses
  exported emoji identifiers until the PNG atlas is imported for UI Toolkit.
- Music and SFX remain source assets for the later audio phase.

## Environment implementation order

1. Deterministic combined-mesh scatter for prototype trees and rocks.
2. Replace prototype geometry with licensed low-poly tree, rock, ore, and
   fishing props that meet the above budgets.
3. Bake 6×6 terrain chunks, then add harvested/depleted resource states.
4. Add building meshes and baked lighting after the prop kit is stable.
