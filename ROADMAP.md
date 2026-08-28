# Isoperia — Roadmap

## Visual reset — Phase 0 (in progress)

1. Quarantine every unreviewed runtime model and restore a stable playable
   baseline. ✅
2. Maintain an asset-admission checklist covering license, imported bounds,
   pivot, materials, collisions, animation, WebGL cost, and screenshot review. ✅
3. Create a dedicated isolated review scene for assets before any world
   integration.
4. Select and test a single free URP nature pack in that review scene; do not
   import a package into the live world until the visual and performance review
   is approved.
5. Rebuild one Hearthvale vertical slice from admitted assets only, then use
   its capture as the visual quality gate for the remaining regions.

## Visual reset — Phase 1: Hearthvale vertical slice

1. Apply the visual-direction rules in `docs/VISUAL_DIRECTION.md`.
2. Review exactly one free Unity 6 URP nature pack in `AssetReview`; record
   license, package footprint, performance, and rejected content.
3. Establish the terrain, sky, fog, water, and lighting baseline for the
   70 × 70 m Hearthvale slice.
4. Integrate only admitted foliage, rocks, roads, and one landmark building.
5. Capture a third-person screenshot and reject/rework the slice until it
   meets the screenshot gate before expanding the world.

## 3D open-world roadmap — active

> **Direction change (2026-08-23):** the fixed isometric tile view was a
> functional prototype only. Isoperia is now targeting an immersive 3D open world
> with a hybrid third-person/orbit camera, comparable in travel feel to Wizard101
> and RuneScape. Existing Core rules and saves remain valuable; their tile-bound
> presentation is being replaced.

### Phase A — 3D traversal foundation

1. Perspective third-person camera with drag/right-stick orbit and scroll/pinch zoom.
2. Player locomotion, collision, gravity, and camera-relative movement.
3. Raycast interaction contract for future resource, NPC, enemy, and door targets.
4. A terrain-scale playable test zone that demonstrates travel rather than tile tapping.

### Phase B — 3D world migration

1. Recompose the settlement, terrain, routes, and landmarks as 3D spaces.
2. Rebind existing gathering/combat/task state to world-space interactables.
3. Preserve Core save ownership while removing player-facing grid assumptions.

### Phase C — Open-world content and release

1. Connected biomes and Cinder Hollow as a real traversable 3D dungeon.
2. Free/licensed environment assets, character animation, lighting, audio, LODs.
3. WebGL/device validation, onboarding, save recovery, and tester release package.

### Completed checkpoints

- **A — traversal:** perspective third-person/orbit camera, CharacterController
  movement, and direct 3D raycast interaction are live.
- **B — terrain:** the Core grid is rendered as one continuous, collidable 3D
  biome surface while Core remains the authority for terrain and saves.
- **C.1 — playable route:** settlement NPC contacts, resource/enemy interaction,
  connected biome landmarks, and the Cinder Hollow light-pool expedition are
  playable in Bootstrap.
- **C.2 / E baseline:** a clean-session, development-only five-second diagnostic
  measured 17.89 ms average / 55.9 FPS with 239 renderers, four lights, and 169
  colliders. The latest WebGL build succeeded and the EditMode suite passed
  205/205. This is a baseline, not a performance claim or a substitute for
  device profiling.

### Phase F — 3D visual identity and world readability

**Goal:** make the existing world look intentionally authored from the hybrid
camera before expanding its content.

1. Update the art contract from fixed-isometric to hybrid third-person/orbit;
   define scale, pivot, collider, material, silhouette, and distance rules for
   every new asset.
2. Use the already imported CC0 Kenney town kit to replace the most conspicuous
   primitive settlement/route placeholders with coherent building, road, tree,
   rock, bridge, and landmark compositions. Keep one visual language across all
   four biomes; do not bulk-import unreviewed packs.
3. Give each biome a readable arrival composition and a clear return route:
   meadow/town warmth, forest canopy/ruin, highland/mining crag, mire/water
   crossing, and the Cinder Hollow approach. Buildings and functional props
   must be clustered according to `docs/WORLD_LAYOUT.md`, not scattered merely
   to fill space.
4. Record every external asset and license before use. Free/CC0/compatible
   assets only; prototype geometry stays as a fallback until its replacement
   passes visual and gameplay review.

**Exit gate:** three representative screenshots (settlement, route, expedition)
at travel zoom show no floating, intersecting, opaque-path-blocking, or visually
ambiguous functional object; interaction colliders match visible models; Console
has zero errors; a five-minute traversal/interact smoke pass, 205/205 EditMode
tests, a WebGL build, and a diagnostics comparison all pass.

### Phase G — Character motion and action readability

**Goal:** make travel, gathering, combat, and NPC contact feel like actions in a
3D world rather than state changes with static placeholders.

1. Audit the owned hero, NPC, and enemy models for Unity 6/URP import quality,
   Humanoid compatibility, triangle/texture budget, and license record. Start
   with one hero and one shared NPC/enemy path; retain the code avatar fallback.
2. Add a presentation-only animation state bridge for idle, locomotion, gather,
   attack, hurt, and defeat. It reads existing Core/Unity state and never decides
   a combat hit, resource reward, movement result, or save value.
3. Add restrained, pooled action feedback: selection highlight, gather swing,
   hit flash/damage cue, defeat/respawn cue, and an interaction prompt that
   remains readable with orbit/zoom input.
4. Test interrupted actions, target changes, death/return, reload, and missing
   asset fallback so the presentation can never strand or desynchronise a player.

**Exit gate:** a fresh save can walk, gather, defeat an early enemy, complete an
NPC task contact, die/return, reload, and repeat without a visual/state mismatch;
the fallback avatar works when a model is disabled; Console zero errors; tests,
WebGL build, screenshots, and diagnostics gate pass.

### Phase H — Cinder Hollow expedition and first guided journey

**Goal:** turn the current readable dungeon approach into a complete,
returnable early-game trip with a clear reason to travel through the world.

1. Add an explicit town-to-Cinder objective using the existing task/contact
   authority: accept, travel via visible landmarks, survive the light-pool rule,
   resolve a compact objective, collect a reward, and return to town.
2. Make the expedition spatially coherent: visible entry/exit, safe-pool
   spacing, a combat clearing, resource/landmark placement, and no invisible
   progression blocker. The hazard remains readable even when the camera orbits.
3. Add save/reload and safe-failure coverage at every stage of the trip. No new
   independent dungeon, combat, task, or inventory state may be introduced.
4. Balance the fresh-save path around a short tester session, documenting the
   expected route, reward, and recovery behavior.

**Exit gate:** a new tester can complete the journey and return without a guide;
intentional failure returns safely; reload works in town, on route, and in the
expedition; screenshots and a recorded smoke script prove the route; Console,
tests, WebGL, and diagnostics are clean.

### Phase I — sound, device hardening, and external-test readiness

**Goal:** prepare the first genuinely useful external testing build without
trading stability for polish.

1. Import only owned or clearly licensed free audio. Route music/SFX through an
   AudioMixer with volume controls and the existing first-tap WebGL unlock; music
   streams and remains outside the critical first load where practical.
2. Add low-cost environmental feedback (weather/ambient particles only when
   measured safe), onboarding/input hints, build ID, feedback instructions, and
   an accessible pause/settings path.
3. Profile representative device/browser sessions rather than relying on Editor
   numbers: cold load, memory, FPS, save flush after tab close/background, and a
   20-minute stability check. Establish a documented device budget and a 30 FPS
   option if required.
4. Publish a test checklist and release notes only after owner review; deployment
   remains an explicit approval step.

**Exit gate:** supported-browser/device matrix is documented with results; no
save loss in deliberate close/background tests; new tester completes the Phase H
journey and reports a build ID; all automated/runtime/release checks pass.

### Non-negotiable phase gate

Before moving to a subsequent phase, review the actual implementation and
screenshots against its exit gate, check the Unity Console for errors, run the
relevant Play Mode smoke pass and full EditMode suite, produce a fresh WebGL
build, compare the performance probe with its baseline, inspect the diff, and
leave `main` clean and pushed. A green compile alone is never enough.

---

## Legacy Unity roadmap — superseded

> **Current baseline (2026-08-23):** Unity 6 URP has a clean playable isometric
> settlement with mouse/touch movement, gathering, a town, resource routes, HUD,
> Core-driven state, and a cache-busted WebGL PWA export. The imported hero and
> creature GLBs remain in the project for the Humanoid import pass, but are not
> live in Bootstrap until their geometry and animations are production-ready.

### Phase 1 — Combat expedition vertical slice

**Goal:** Make the outer routes a risk/reward trip a tester can complete.

1. Define Core combat data for enemy health, damage, attack interval, spawn zones,
   drops, and respawn.
2. Add one readable enemy family per early zone using code-owned low-poly views.
3. Implement tap/click targeting, chase range, tick-driven attacks, damage
   feedback, death, respawn, and disengage behavior.
4. Add drops, combat XP, target/health HUD states, and a safe death/return flow.
5. Test damage, cooldowns, drops, respawn, and save round trips; run Editor and
   WebGL smoke passes.

**Done when:** a tester can leave town, defeat an enemy, collect a drop, return,
and retain that result after relaunch.

### Phase 2 — Quest, crafting, and progression loop

**Goal:** Give gathering and combat a clear short-term purpose.

1. Add a data-driven task system with a town NPC and three starter tasks: gather,
   craft, and defeat.
2. Connect resources to a compact recipe/upgrade set with clear requirement UI.
3. Award coins, XP, and one meaningful unlock through task completion.
4. Add tracker and turn-in feedback, including save/load coverage.
5. Balance the first 20–30 minutes in a fresh-save WebGL pass.

**Done when:** a player understands the loop: town task → route → reward → unlock.

### Phase 3 — World routes and first dungeon

**Goal:** Make the map a coherent world beyond the central settlement.

1. Implement landmark-led forest/highland routes, visible bridges/gates, resource
   gradients, combat clearings, and return paths from `docs/WORLD_LAYOUT.md`.
2. Create a first dungeon approach and compact interior with one readable mechanic.
3. Add transition/save handling so reloads never strand the player.
4. Validate layout from the fixed isometric camera with screenshot, mouse, and
   touch traversal passes.

**Done when:** testers can reach a dangerous destination and return without hidden
blockers or a guide.

### Phase 4 — Free asset and character integration

**Goal:** Replace temporary presentation while keeping the WebGL build lean.

1. Curate/import a licensed free environment subset and save its license in
   `docs/THIRD_PARTY_ASSETS/`.
2. Prepare the existing hero GLB as Humanoid; integrate idle, walk, gather, hit,
   and death animations while retaining the fallback avatar until device verified.
3. Establish the scale/material/collider/LOD prefab rule with one enemy and NPC.
4. Polish lighting, water, fog, particles, and audio only after silhouette clarity.
5. Check WebGL size and performance before expanding the asset set.

**Done when:** settlement, player, and first expedition read as one deliberate
low-poly world on a mobile-sized screen.

### Phase 5 — External testing release

**Goal:** Produce a reliable tester build.

1. Add onboarding, input hints, pause/settings, version display, and feedback path.
2. Harden save recovery across fresh install, upgrade, and interrupted sessions.
3. Run WebGL browser/device, memory, and load-time coverage using reproducible IDs.
4. Publish only after owner approval of host and release notes.

**Done when:** testers can finish the Phase 1–2 loop, report a build ID, and update
without a stale cached client.

### Execution order

`Combat expedition → Progression → World/dungeon → Assets/animation → Test release`

Gameplay loops come before high-volume art work; each phase supplies the acceptance
criteria for the next.

---

## Historical pre-Unity roadmap

> Phases A–E, the boot refactor, **Phase F (Combat depth), and H.1–H.2 (item
> icon atlas + sky) are shipped**; `REPAIR_PLAN.md`/`UPDATES.md` hold that
> record. Approved execution order: F → H.1–H.2 → G → H.5 → I. Next up:
> **Phase G** (second dungeon).
>
> Gates as of the last audit: 321/321 QC · 57/57 UI audit · 25/25 rig · 5/5 smoke ·
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

## Phase F — Combat depth (no credits) ✅ SHIPPED

The combat loop was thin: one weapon, one attack, auto-eat, done. All five items
below are live; see `UPDATES.md` for the full writeup of each.

1. **Attack styles** ✅ — Accurate / Aggressive / Defensive, picked per fight in the
   Combat panel; each shifts accuracy vs max hit/defense and trains a different skill.
2. **Resolve** ✅ — a 0–100 pool spent on Precision/Power/Warden, refilled resting by
   a Campfire. Gives food a rival for bag space.
3. **Weapon specials** ✅ — a charge-based special per weapon (Puncture, Riposte,
   Cleave, Piercing Shot, Execute, Onslaught), queued from the Combat panel.
4. **Monster affixes** ✅ — Hardened/Swift/Rich, 12% chance on any non-boss spawn.
5. **Death with stakes** ✅ — losing a fight now costs 15% of carried bulk resources
   (floored per stack); coins, gear, tools and quest items are always safe.

**Done when** two players at the same combat level can be built differently and it
shows in a fight. — Yes: style + buff + special + gear now all stack, and a death
mid-haul costs something real.

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

1. **Item icon atlas** — ✅ **shipped.** 4 sheets generated (~8 cr), sliced with
   `scripts/slice-atlas.cjs`, all 62 items have real icons. Emoji is still the
   fallback for anything unregistered, kept fully reversible by design.
2. **Sky** — ✅ **shipped.** Regenerated as a flat low-poly gradient backdrop
   (`nano_banana_2`, ~1 cr) matching the game's art style and the existing
   fog colours, shipped as JPEG. `public/sky.png` (1.2 MB) → `public/sky.jpg`
   (~114 kB).
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
- One known item deliberately left: `ItemType.GEM` has no members.

## Suggested order and why

```
F (combat depth)  →  H.1–H.2 (icons + sky, ~3 cr)  →  G (second dungeon)  →  H.5 (characters)  →  I
```

Mechanics first because they cost nothing and they are what makes the game worth
looking at. Then the two cheap asset wins, because icons and sky are what make it
*look* finished for three credits. The dungeon next, since it is the biggest content
hole. Characters last, because they are the only genuinely expensive thing and the
Phase G boss should be in that batch rather than generated twice.
