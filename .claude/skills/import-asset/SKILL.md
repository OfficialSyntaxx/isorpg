---
name: import-asset
description: Admit a new 3D asset, texture or audio file into Alderfell — licence check, triangle budget, atlas re-UV, LODs, scale and pivot correction, and the licence ledger entry. Use when bringing in a CC0 model, Unity Asset Store pack, Mixamo character or any external art.
---

# Admit an asset

Free assets are the project's supply line, and unchecked they are also how it ends
up looking like four different games stitched together with a licensing problem.
Everything entering the project passes this gate.

Reference: `docs/ASSET_ADMISSION.md` (the gate and the ledger), GDD §19.

## 1 — Licence, before anything else

**Do this first.** Re-UV'ing an asset you can't legally ship is wasted work.

- Record the **exact** licence (CC0, CC-BY, Unity Asset Store Free, Mixamo).
- CC-BY and similar require attribution — record what the notice must say.
- **Reject** anything without a clear licence, anything non-commercial, and
  anything with a no-derivatives clause (we re-UV everything, which is a derivative).
- Add a row to the ledger in `docs/ASSET_CREDITS.md`: asset, source URL, author,
  licence, date, where it's used.

An asset with no recorded licence does not enter the project, however good it looks.

## 2 — Budget

Check against GDD §6 and the per-layer budgets in §18.

| Asset kind | Target |
|---|---|
| Prop / rock / tree | 200–1,500 tris |
| Kit piece | 300–2,000 tris |
| Hero landform | 2,000–5,000 tris |
| Humanoid character | 3,000–6,000 tris |
| Boss | 8,000–10,000 tris |

Over budget → decimate in Blender (and check the silhouette survived), or reject.
Silhouette is what reads at phone size; interior detail is not worth triangles.

## 3 — Re-UV to the shared gradient atlas

**This is the step that makes mixed-source assets look like one game.** Skipping it
is how the world ends up incoherent.

- Map every surface to the palette band for its material and region.
- Keep source textures with the editable source archive; exclude them from the runtime asset if replaced by the atlas.
- Reuse the appropriate shader/material family. An atlas does not guarantee batching; inspect actual draw calls and passes.

**Exception:** hero characters and bosses keep unique textures. That's where the
player looks.

## 4 — Geometry hygiene

- **Scale:** 1 Unity unit = 1 metre. A door is ~2m. Apply scale in Blender before export.
- **Pivot:** at the base for props and buildings, at the feet for characters,
  centred for anything that spins.
- **Rotation:** Blender is Z-up, Unity is Y-up. Apply rotation on export (FBX
  `-Z forward, Y up`) so the asset doesn't arrive lying on its back.
- **Normals:** recalculate outside. Flipped faces read as holes.
- **LODs:** props and vegetation need at least LOD0/LOD1. Vegetation gets a
  billboard at the far LOD.
- **Colliders:** simple primitives where interaction/collision is required; decorative scatter has no collision per GDD §30.4.

## 5 — Characters: rig and animate via Mixamo

1. Export from Blender as FBX in **T-pose**.
2. Upload to Mixamo → auto-rig (free, commercial use permitted).
3. Download animations **"without skin"**; download the rigged mesh once **with skin**.
4. In Unity, set the rig to **Humanoid** — the avatar system then retargets every
   clip across every humanoid after the Avatar mapping is verified. Validate bone/skin influence budgets; a Mixamo skeleton is not automatically the existing 24-bone rig.

One ~12-clip set (idle, walk, run, attack ×2, hit, death, gather) serves the
player, villagers, guards and every humanoid enemy. Non-humanoids need their own
clips — keep those few and reuse across variants.

## 6 — Verify in scene

- Drop it in a lit scene next to an existing asset and compare style and scale.
- Check silhouette readability at third-person distance **on the phone**.
- Confirm it batches — draw calls should not jump.

## Reject when

- Licence is unclear, non-commercial, or no-derivatives
- Style can't be reconciled by the atlas (wrong proportions, realistic detail)
- Over budget and decimation destroys the silhouette
- It's a duplicate of something already in the project

Rejecting is cheap. A bad asset costs every frame it's on screen, forever.
