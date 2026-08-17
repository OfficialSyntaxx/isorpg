# Isoperia — Roadmap (Phases F onward)

> Phases A–E and the boot refactor are shipped; `REPAIR_PLAN.md` holds that record.
> This is the forward plan. **Nothing here is started** — it is for approval and
> editing first.
>
> Gates as of the last audit: 197/197 QC · 57/57 UI audit · 25/25 rig · 5/5 smoke ·
> visual baseline 0.00% drift · `npm run audit` 0 bugs.

## How to read this

- **Effort** — focused sessions, roughly. `S` ≈ under one, `M` ≈ one, `L` ≈ two-plus.
- **Credits** — Higgsfield spend. **Balance: 178.45** (Plus plan).
- **Risk** — what could actually bite, not a vibe.
- Every phase ends with the same gates green and `npm run audit` clean.

## The constraint that shapes everything

Observed costs, measured rather than guessed (earlier sessions + this one):

| Thing | Cost | Note |
|---|---:|---|
| Image (sky, icon atlas, concept art) | **~1.25 cr** | effectively free at this scale |
| SFX clip | **~0.25–0.5 cr** | ditto |
| `tripo_3d` text→3D mesh | **~9 cr** | but ~41 MB raw |
| `image_to_3d` (Meshy, textured) | **~30 cr** | lean, ~2.6 MB raw |
| `3d_rigging` | **+5 cr** | +8 with an animation clip |

So: **images cost nothing, characters cost real money.** 178 credits is about
**4 Meshy characters** — or, now that `scripts/optimize-glb.cjs` reliably shrinks a
mesh by ~96% (20.8 MB → 739 kB on the wizard), roughly **11 Tripo characters**.
That optimizer is what makes the cheap-but-huge path viable, and it is the single
biggest lever on this plan.

Two consequences worth deciding up front:
1. **Do not generate 62 item icons individually.** One image containing a grid of
   items, sliced by script, gives every icon for ~1–2 credits and — more importantly
   — in one consistent style. Per-item generation would cost more and look worse.
2. **The ten procedural monsters no longer look broken.** The audit wired
   `animateMonster`, so they bob, flash when hit and settle when killed. Modelling
   them is now an upgrade, not a rescue, which means it can wait behind mechanics.

---

## Phase F — Combat depth (no credits)

The combat loop is thin: one weapon, one attack, auto-eat, done. Everything here is
mechanics, so it costs nothing but time and is the highest value-per-credit work
available.

1. **Attack styles** — pick Accurate / Aggressive / Defensive per fight; each trains
   a different skill and shifts accuracy vs max hit. Turns three combat skills that
   currently rise together into a choice. `M` · risk LOW.
2. **Prayer-or-equivalent resource** — a limited pool spent on short buffs (accuracy,
   damage reduction, extra XP), restored at the Campfire. Gives food a rival for bag
   space. `M` · risk MED (needs balancing against auto-eat).
3. **Special attacks per weapon** — the 2H already has slow/heavy identity; give each
   weapon one charge-based special so weapon choice survives past max-hit comparison.
   `M` · risk LOW.
4. **Monster affixes** — an occasional *Hardened* / *Swift* / *Rich* prefix that
   scales stats and loot. Cheap variety across all 12 monsters without new content.
   `S` · risk LOW.
5. **Death with stakes** — currently death is soft. Lose a fraction of unbanked
   drops, respawn in town. Makes the Storehouse and banking runs matter. `S` · risk
   MED (needs to be forgiving enough not to feel punishing on mobile).

**Done when** two players at the same combat level can be built differently and it
shows in a fight.

## Phase G — A second dungeon and a boss ladder (no credits)

The Caves are the only dungeon and the Cave Brute the only real boss. This is the
biggest content hole.

1. **Second dungeon — the Sunken Vault** in the swamp biome, 3 floors, its own
   monster pool, a mechanic the Caves do not have (rising water forcing movement, or
   light/darkness). `L` · risk MED.
2. **Boss ladder** — Forest Ogre → Cave Brute → Vault boss, each with a telegraphed
   mechanic and a unique drop. The telegraph work already exists for the slam. `M`.
3. **Dungeon modifiers** — an optional per-run mutator (more monsters, less loot,
   etc.) for replay value without new geometry. `S`.
4. **Slayer-style tasks** — Eldric assigns "kill N of X" for coins and a token
   currency. Gives the 12 monsters a reason to be sought out individually. `M`.

**Done when** there are two distinct dungeons and a reason to run either twice.

## Phase H — The asset pass (credit-bound: ~40–60 cr)

Ordered by visible-impact-per-credit. Every step is verified against the visual
baseline before and after.

1. **Item icon atlas** — one generated grid image → 62 sliced PNGs, replacing emoji.
   Needs a new `scripts/slice-atlas.cjs` (the Chromium image pipeline already
   exists). **~2 cr** · `M` · risk LOW, and reversible: emoji stay as the fallback.
2. **Sky** — regenerate as a proper panorama and ship as JPEG. Replaces a 1.2 MB PNG
   with ~120 kB and stops it looking like a placeholder. **~1.25 cr** · `S`.
3. **UI/brand pass** — a real logo, panel iconography, a title screen. **~5 cr** ·
   `M`.
4. **SFX gap-fill** — farming, digging, clue completion, tonic brewing, the new
   specials. **~5 cr** · `S`.
5. **Characters, priced by screen time.** Before committing, **measure one Tripo
   generation end-to-end** (generate → optimize → verify) and record the real numbers
   — I have been wrong guessing at this before. Then, in order:
   - Eldric the quest giver (constant screen time, currently a procedural figure)
   - The three commonest monsters: giant rat, goblin, skeleton
   - The Vault boss from Phase G
   **~15 cr each rigged** if Tripo works out, ~38 cr each via Meshy. `L`.

**Done when** nothing on screen reads as a placeholder at play zoom.

## Phase I — Economy and endgame (no credits)

1. **Equipment tiers past bronze/iron/steel** — the ladder stops early; add a tier
   gated behind boss drops rather than smithing. `M`.
2. **Villager progression** — villagers gain their own levels and unlock a second
   job slot. The veteran tiers already exist to build on. `M`.
3. **Player-set market orders** — sell at a price and have it fill over time, so the
   market is somewhere you plan around rather than a vending machine. `M`.
4. **Prestige / ascension** — a reset that carries a permanent bonus, for players who
   hit the ceiling. `L` · risk HIGH (easy to make the game feel pointless before it).

## Standing work (not a phase)

- `npm run audit` before every phase boundary. Shipped this session: data integrity,
  save round-trip, dead code and assets, producer/consumer wiring, an 8-panel × 2-viewport
  layout sweep, and a 35s stability run. `--quick` skips the browser passes.
- Two known items deliberately left: `ItemType.GEM` has no members, and `sky.png` is
  the 1.2 MB PNG Phase H.2 replaces.

## Suggested order and why

```
F (combat depth)  →  H.1–H.2 (icons + sky, ~3 cr)  →  G (second dungeon)  →  H.5 (characters)  →  I
```

Mechanics first because they cost nothing and they are what makes the game worth
looking at. Then the two cheap asset wins, because icons and sky are what make it
*look* finished for three credits. The dungeon next, since it is the biggest content
hole. Characters last, because they are the only genuinely expensive thing and the
Phase G boss should be in that batch rather than generated twice.
