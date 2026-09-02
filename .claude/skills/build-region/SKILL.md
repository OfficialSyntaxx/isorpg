---
name: build-region
description: Build or dress an Alderfell world region to the craft checklist — terrain blockout, Blender hero landforms, modular kit, scatter, lighting, and the framed-reveal review. Use when creating a new region, dressing an existing one, or checking whether a region is finished. Requires a local session with the Unity MCP bridge.
---

# Build a region

The four-layer method from GDD §18. Each layer owns something the others cannot
produce — do not collapse them.

**This skill needs the Unity Editor** (and Blender for step 2), so it runs in a
local session with the MCP bridges. A remote session can prepare specs, palettes
and content but cannot execute it.

## Before you start

Read `docs/GDD_ALDERFELL.md` §3 (the region and its identity), §6 (budget) and
§18. Know which region you're building and what its ≤5-hue palette lock is.
Read the current status board and verify the editor project path before writes.
For M0, use an isolated inspection scene without legacy gameplay bootstrap.

## The order

Do not reorder these. Detail placed before the masses are right is detail thrown away.

### 1 — Block out the heightfield
Unity Terrain. Masses and paths only, no textures, no props.

- Vertical relief **≥ 15m** across the region. Flat ground is banned as a default.
- Paths bend around terrain that justifies the bend. No straight roads.
- Terrace the areas the built world will sit on.

**Walk it in grey.** If the shape is boring in grey, it will be boring in green.
Do not proceed until the blockout is interesting on its own.

### 2 — Sculpt and place hero landforms
Blender, 4–8 meshes at 2–5k tris each, exported and placed against the blockout.

This is where the region gets its skyline. Unity Terrain is a heightfield and can
never overhang, so cliffs, sea arches, pierced rock and cave mouths exist only
here.

- **At least one landmark must be visible from a neighbouring region.** This is
  the rule that makes navigation-by-landmark work, which is what lets the minimap
  stay off.
- UV to the shared gradient atlas. No unique textures.

### 3 — Assemble the built world
Modular kit pieces, GPU-instanced, on the terraces from step 1.

- **The landmark goes up first.** Everything else composes around it.
- Vary assembly and rotation rather than adding unique pieces — repetition is the
  risk with a kit, and rule 6 forbids visible tiling.

### 4 — Paint and scatter
Ground textures, then vegetation, then props.

- Jitter rotation and scale on **everything**. Nothing on a grid.
- Billboard-hybrid LODs on vegetation; cull into the fog at ~120m.
- Stay inside the region's ≤5-hue palette lock.

### 5 — Light, fog, and review
One directional light + baked lightmaps. Fog tinted to the region palette — it is
both the atmosphere and the thing that lets you cull aggressively.

Then stand at each of the **three framed reveals** and screenshot **on the phone,
not the monitor**.

## The finish checklist — all must pass

- [ ] Vertical relief ≥ 15m
- [ ] A silhouette landmark visible from a neighbouring region
- [ ] No straight paths
- [ ] Three framed reveals, screenshotted and worth keeping
- [ ] Foreground / midground / background layering in every major sightline
- [ ] Nothing tiles visibly
- [ ] ≤5 dominant hues, distinct from neighbouring regions
- [ ] Sky and fog carrying the atmosphere
- [ ] Composed for a 6" screen, checked there
- [ ] **Budget:** ~120k tris, ~40 draw calls, 3 material families for the dressed region
- [ ] **30 FPS on a real target-class Android device**; iPhone-only evidence is provisional
- [ ] Device, build SHA, resolution/settings, frame-time percentiles, resident memory and authoring hours recorded

If a framed-reveal screenshot isn't worth keeping, the region is not finished.
Say so plainly rather than marking it done.

## Budget reference

| Layer | Tris | Draw calls |
|---|---|---|
| Terrain | ~25k | 2–4 |
| Hero landforms | ~20k | 4–8 |
| Modular kit | ~35k | 6–12 |
| Scatter | ~40k | 8–15 |
| **Total** | **~120k** | **~20–39** |

Headroom above this is for characters, VFX and UI — don't spend it on the world.
