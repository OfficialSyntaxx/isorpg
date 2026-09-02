> Historical reference: the current design and delivery rules are in `GDD_ALDERFELL.md` and `WORKFLOW.md`. Older camera, paid asset, exporter, branch and deployment instructions below are superseded. Use the implementation status board for current work.

# Isoperia Unity Art Bible

## Visual contract

Isoperia is an immersive low-poly 3D world viewed through a hybrid
third-person/orbit camera. It retains readable shapes and restrained colours:
muted natural terrain, warm settlement accents, simple silhouettes, and one
directional sun. Art must read while the player travels, orbits, and zooms on a
mobile/WebGL-sized screen before it earns detail.

## Hybrid-camera placement contract

- Functional objects must have a visible silhouette and an interaction collider
  that agrees with the visible model. Do not make players guess whether a prop
  is decorative, blocking, or usable.
- Ground props sit on sampled terrain elevation. No floating, buried, or
  transform-scaled colliders; keep paths visibly clear around buildings, pools,
  bridges, and landmark entrances.
- Place compositions, not isolated props: a route needs a readable arrival
  landmark, a forward cue, and a visible return direction. Settlement services
  cluster around their purpose (market/campfire, farm/water, quarry/forge).
- Use travel-scale landmarks as a hierarchy: broad mass seen at distance,
  recognizable mid-range silhouette, and only then close-range detail. Do not
  model invisible backs or interiors.
- New imported assets require an owner, source, license record, URP material
  review, scale/pivot check, and a WebGL budget check before replacing a live
  fallback.

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
- Hybrid-camera rule: model all player-visible sides, but omit interior and
  underside detail that cannot be reached or seen during normal travel.

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
