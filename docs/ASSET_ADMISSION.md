# Asset admission gate

Alderfell is built with **no cash budget**, so its art supply line is free
assets — CC0 libraries, Unity Asset Store free packs, Mixamo rigs — plus what we
author in Blender. That is a genuine advantage and it has two failure modes:

1. **Incoherence.** Assets from four sources look like four different games.
2. **Licensing.** An unlicensed asset discovered at ship is a rebuild, not a fix.

This gate exists to stop both. Nothing enters the project without passing it.
The procedural version, for agents, is `.claude/skills/import-asset/`.

---

## 1 · Licence — checked first, always

Re-UV'ing an asset you cannot legally ship is wasted work, so licence is the
first gate, not the last.

**Accepted**

| Licence | Terms we must honour |
|---|---|
| CC0 / public domain | None. Preferred. |
| CC-BY | Attribution in `ASSET_CREDITS.md` and in-game credits. |
| Unity Asset Store Free | Usable in this project; cannot be redistributed as an asset. |
| Mixamo | Free for commercial use with an Adobe account. Rigs and animations only. |

**Rejected, without exception**

- No stated licence, or a licence you cannot locate in writing
- Non-commercial clauses (`CC-BY-NC`) — this project intends to ship
- No-derivatives clauses (`CC-BY-ND`) — we re-UV everything, which is a derivative
- Share-alike where it would infect the project (`CC-BY-SA`) — case by case, default no
- Anything scraped from a game, film or another studio's work

**Record every asset** in `docs/ASSET_CREDITS.md`: name, source URL, author,
licence, date admitted, where it's used. An asset that isn't in the ledger isn't
in the project — that ledger is what makes a licence audit a five-minute job
instead of an archaeology project.

---

## 2 · Budget

Against GDD §6 (150k tris, 120 draw calls on screen) and §18's per-layer budgets.

| Asset kind | Target triangles |
|---|---|
| Prop, rock, small tree | 200 – 1,500 |
| Kit piece | 300 – 2,000 |
| Hero landform | 2,000 – 5,000 |
| Humanoid character | 3,000 – 6,000 |
| Boss | 8,000 – 10,000 |

Over budget → decimate in Blender and confirm the silhouette survived, or reject.
**Silhouette is what reads at phone size**; interior detail is not worth triangles.

---

## 3 · Re-UV to the shared gradient atlas

Every prop, kit piece, landform and terrain surface maps to the one shared
gradient palette texture (GDD §19.1).

This is the step that makes mixed-source assets look like one game, and it is the
step people skip. Assets from different authors stop clashing because they are
all sampling the same palette. Use the appropriate terrain, vegetation or water shader family;
measure passes and draw calls instead of inferring batching from a shared atlas.

- Map each surface to the palette band for its material and region.
- **Preserve original textures with editable source art.** Exclude replaced textures from runtime packaging; never delete the only source copy.

**Exception:** hero characters and bosses keep unique textures. That's where the
player actually looks.

---

## 4 · Geometry hygiene

| Check | Requirement |
|---|---|
| Scale | 1 Unity unit = 1 metre. A door is ~2m. Apply scale in Blender before export. |
| Pivot | Base for props and buildings; feet for characters; centre for anything that rotates. |
| Axis | Blender is Z-up, Unity is Y-up. Export FBX as `-Z forward, Y up`. |
| Normals | Recalculated outside. Flipped faces read as holes in the mesh. |
| LODs | LOD0/LOD1 minimum on props and vegetation; vegetation gets a far billboard. |
| Colliders | Simple primitives where needed; decorative scatter has no collision (§30.4). |
| Naming | `snake_case`, descriptive: `oak_tree_a`, `cliff_shore_arch`. |

---

## 5 · Characters — rig and animate via Mixamo

1. Export from Blender as FBX in **T-pose**.
2. Upload to Mixamo → auto-rig.
3. Download clips **"without skin"**; download the rigged mesh once **with skin**.
4. In Unity set the rig to **Humanoid** — the avatar system then retargets compatible clips after Avatar validation. Verify actual bone/skinning
   budgets; Mixamo rigs do not automatically match the existing 24-bone skeleton.

One ~12-clip set (idle, walk, run, attack ×2, hit, death, gather) serves the
player, villagers, guards and every humanoid enemy. **That retargeting is what
makes a populated world affordable solo.** Non-humanoids (wolf, imp, husk) need
their own clips — keep those few and reuse them across variants.

---

## 6 · Verify in scene

- Place it in a lit scene beside an existing asset. Compare style and scale.
- Check silhouette readability at third-person distance **on the phone**.
- Measure draw calls and shader passes before/after. Investigate mesh, material, lighting and transparency changes if the asset exceeds its budget.

---

## Reject when

- The licence is unclear, non-commercial, or no-derivatives
- Style can't be reconciled by the atlas — realistic detail, wrong proportions
- Over budget, and decimation destroys the silhouette
- It duplicates something already in the project

**Rejecting is cheap.** A bad asset costs every frame it is on screen, for the
life of the project.
