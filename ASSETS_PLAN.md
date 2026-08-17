# Isoperia — Asset & Credit Plan

> **Superseded in part.** The phase plan now lives in `ROADMAP.md` (Phase H). This
> file is kept for the *observed pricing*, which is the hard-won part — every number
> below was measured on a real job, not read off a price list.
>
> **Balance: 178.45 credits** (Plus plan), re-checked at the 2026-08-17 audit.
>
> **What changed since this was written:** `scripts/optimize-glb.cjs` now shrinks a
> generated mesh by ~96% (measured: 20.8 MB → 739 kB on the wizard, 790 kB → 329 kB
> on the hero). That makes Tripo's cheap-but-enormous output usable, which moves the
> practical cost of a character from ~38 credits to roughly ~15. It is the single
> biggest change to the economics of this plan.
>
> **Also:** the audit wired `animateMonster`, so the ten procedural monsters now bob,
> flash when hit and settle when killed. Modelling them is an upgrade rather than a
> rescue, so it sits behind mechanics work rather than in front of it.


Audit date: 2026-08-16 · after Phase 8.1 (SFX basic · hero 3D mesh · skybox).
Balance at audit: **~20 credits** hard pool + **$319.95** subscription pool.

## Already shipped (real, non-procedural)
| Line | Asset | Cost seen |
|---|---|---|
| Sound | chop/mine/fish/hit/hurt/levelup/coin SFX | ~2.0 cr |
| Character | hero GLB (2.6 MB low-poly) | 30 cr (meshy) |
| Environment | skybox panorama | ~1.25 cr |

Everything else is zero-asset procedural (GDD): boxes/spheres/emoji.

## Remaining — categorized
Pricing = observed job-credit units. Ranges reflect model choice (tripo ~9 cr but
~41 MB GLBs; meshy `image_to_3d` ~30 cr for a lean 2.6 MB; sam_3_3d unreliable).

### A. Audio — LOW cost, HIGH impact
- **SFX pass 2** (~20 clips): pickup, UI click, crafting (smelt/cook/carpentry),
  chest open, door unlock, monster growls ×12, quest-complete jingle, boss slam.
  → ~0.25–0.5 cr each ≈ **5–10 cr**
- **Ambient music** (town, wilderness, dungeon combat ×3 tracks, sonilo_music).
  → cost **NOT YET PRICED** — verify per-track before firing; rough guess ≈
   couple cr/track but must confirm. ≈ **3–9 cr**

### B. Characters / NPCs — MED cost, MED-HIGH impact
- **Villagers + guide + critters** (Bram, Wren, Old Tobias, Eldric, ×2 rabbits):
  ~7 figures. Key lever: hero base model exists — reuse one low-poly biped,
  re-skin per NPC → **1 base + retextures**, not 7 full meshes.
  → ~30 cr (1 mesh) + image/texture work ≈ **35–60 cr**
- **Monster models** (12 types: giant_rat, goblin, skeleton, zombie, dire_wolf,
  goblin_archer, forest_ogre, cave_bat, cave_slasher, cave_brute, frost_imp,
  bog_husk) — all box figures. Most expensive for smallest on-screen size.
  → 12 × 9–30 ≈ **120–360 cr** — the single biggest category; defer/last.

### C. Props & buildings — MED cost, MED impact
- **Equipment on hero** (axe, pick, net, dagger, sword, 2H, bow, iron sword ≈ 8):
  small held 3D. → 8 × 9–30 ≈ **70–240 cr** (or downscale to a cheap shared set)
- **Settlement buildings** (campfire, storehouse, sawmill, smelter, granary, town
  hall, market, smithy ≈ 8) → ≈ **70–240 cr**

### D. Animation / rigging — cost TBD, MED impact
- Hero GLB is static; rig idle/walk/attack via `3d_rigging` + animation action.
  → 3d_rigging **NOT YET PRICED** ≈ guess 10–30 cr, confirm first.
- Monsters/NPCs already animate procedurally (bob) — low need.

### E. UI art + environment — LOW impact, SKIP for now
- **UI icons**: items/skills use emoji (mobile-readable, intentional). Generated
  icon pack ≈ 40 × 1.25 = 50 cr — not worth it; keep emoji/web CSS.
- **Environment**: terrain/biome palettes + water are procedural and
  biome-correct (image textures fight 3D tiles); skybox done. Skip.

## Verdict vs balance (~20 cr hard pool)
- **Fits in 20 cr:** audio only — pass-2 SFX (~8 cr) + start ambient music
  (~4–9 cr, after pricing). Clearest win for the least cost.
- **Does NOT fit:** the 3D pass (characters/props/buildings) is ~**300–900 cr**
  total. 20 cr funds at most one lean mesh.
- **Realistic route for 3D:** the **$319.95 subscription pool** (with per-item
  pricing + approval each gen). Order by impact/credit:
  1. SFX pass 2 (≈8 cr) + ambient music (after pricing) — ship this first.
  2. One reusable villager/hero-base for all NPCs (≈30 cr) — biggest feel win
     for one model.
  3. Buildings next (~8 models) before monsters (12 is the ceiling).
  4. Monsters LAST — highest cost, smallest on screen.
  5. Skip UI art + environment (procedural/emoji is a feature, not a gap).