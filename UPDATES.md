# Isoperia — Update Log

Running changelog of shipped increments. Each entry names the phase, what changed,
the game-repo commit, and the live build (cache-bust version at
`isoperia-rpg.higgsfield.app`).

---

## 2026-08 · Phase B — animation states wired, generated model manifest

- **The state machine now has callers.** `spawnActor().play(state)` is driven from
  real game state: the hero from the frame loop (walk/idle) plus `gather` on
  skill/craft start; villagers from `NpcSystem.update()` (walk while travelling,
  idle when stopped); monsters from `CombatSystem.update()` (walk when their tile
  changed, else idle) with `attack` fired on the swing. Until now nothing called
  `play()` — the machine existed but every actor still sat on one clip.
- **The hero goes through the shared loader.** `main.ts` had a bespoke
  `GLTFLoader` call passing only `gltf.scene`, discarding `gltf.animations`, which
  is why the hero could only ever be static. It now uses `spawnActor` like every
  other actor, keeping the procedural figure as fallback.
- **`ModelManifest.ts` is generated from `public/models` at build time**
  (`prebuild`/`predev`). `ACTOR_CLIPS` can name clips that don't exist yet — the
  loader skips anything not shipped instead of 404ing on every boot, and a file
  lights up the moment it's dropped in. `base` also accepts a candidate list, so
  the hero names its rigged clips first and the static original as fallback.
  Caught by the boot smoke test, which failed on the 404s.
- **Desktop HUD guard.** `onMouseDown` lacked the guard its touch counterpart has,
  so pressing a HUD button also started a camera pan.

- 70/70 QC + 3/3 rig + 5/5 smoke.

---

## 2026-08 · Phase B prep — model pipeline, 93% smaller assets

- **Textures recompressed: 21.5 MB → 1.53 MB (-93%).** Every character GLB was
  93-96% texture — one 2048x2048 PNG per model, for actors ~40 px tall on screen.
  `scripts/optimize-glb.cjs` decodes in headless Chromium (the bundled ffmpeg is
  built `--disable-everything` and cannot decode PNG), resizes to 512px, encodes
  JPEG q0.85 and repacks the GLB. Every material is `alphaMode OPAQUE`, so JPEG
  loses nothing, and it stays core glTF 2.0 (no `EXT_texture_webp` needed).
  Also gets a rigged clip comfortably under the 25 MB upload ceiling.
- **Skinned clones fixed.** `spawnModel` used `Object3D.clone()`, which does not
  rebind a SkinnedMesh to its cloned skeleton — every villager clone was driving
  the shared template's bones. Now `SkeletonUtils.clone()`.
- **…which unmasked a latent sizing bug.** `Box3.setFromObject()` on a SkinnedMesh
  measures the *posed* skeleton, and a fresh clone has stale bone matrices: cold,
  it reports ~0.02 units instead of 1.7, so `ACTOR_HEIGHT / size.y` scaled actors
  ~75x and one texture swallowed the screen. Fixed with
  `updateMatrixWorld(true)` before measuring plus a floor that refuses an
  implausible measurement. The old broken clone had hidden this.
- **Animation state machine** (`spawnActor`) replaces `clips[0]`-forever:
  named states with crossfade and graceful fallback, ready for the hero clips.
- **`scripts/verify-rig.cjs`** (in `npm test`) reports the model inventory and
  checks that a character's per-clip GLBs share one skeleton.

- 70/70 QC + 3/3 rig + 5/5 smoke.

---

## 2026-08 · Phase A follow-up — world scale & texture

The "miniature world" read, traced to two causes and fixed together.

- **Actors were shorter than the tile they stood on.** Everything normalised to
  0.75 world units on a 1-unit grid — an adult smaller than one square, which is
  exactly what makes a world look like a tabletop diorama. Introduced
  `src/core/Scale.ts` as the single source of truth: `ACTOR_HEIGHT = 1.25`, with
  per-monster bulk factors, tree/rock scales and a building height/width split
  (buildings scale taller than wide so their footprint stays inside a tile).
- **Every prop was buried 0.6 units.** Trees, rocks and ground clutter were
  planted at `y = 0` while the terrain surface sits at `y = 0.6`. With trunks
  only 0.7–1.05 tall, more than half of each tree was underground — which is why
  they read as shrubs with no trunk. Props now stand on `GROUND_Y`. Buildings
  scale *about* the ground plane so they neither float nor sink.
- **Terrain was confetti.** `rollTerrain` rolled DIRT/ROCK per tile from white
  noise, scattering isolated squares over the grass. Now sampled from smooth
  low-frequency noise so they form contiguous patches, thresholds chosen to keep
  the original ~6% rock / ~14% dirt share.
- **Resources only spawned along the top edge.** `spawnResources` walked rows
  top-down while decrementing a shared cap, so the first rows consumed every slot
  — the reason trees clustered at the map's top and fishing spots capped at one.
  Candidates are now collected first, shuffled deterministically by seed, then
  taken up to the cap: even density, guaranteed minimums, still identical across
  reloads.
- **The town core is now open ground.** Rock, dirt and interior lakes are cleared
  from the settlement chunk — a lake was silently removing ~17% of the buildable
  town tiles, right where the player spawns.

- 70/70 QC (2 new: terrain patch cohesion, town-core buildability). 5/5 smoke.

---

## 2026-08 · Phase A — the opening frame

The first thing a new player sees, made correct. All four causes were reproduced
in the running game before being fixed.

- **The "wave-shaped" water was one broken polygon.** `buildWater()` created a
  single `THREE.Shape` for the entire map — `moveTo` on the first water tile,
  then `lineTo` around every subsequent one — i.e. one continuous
  self-intersecting path hopping between scattered tiles. `ShapeGeometry`
  triangulated that into a huge wedge of "water" lying across open ground next to
  spawn. Rebuilt as one quad per water tile merged into a single
  `BufferGeometry` (still one draw call), with world-space UVs so the shimmer
  flows across a lake instead of restarting per tile.
- **The water shader rippled sideways.** `geo.rotateX()` bakes rotation into the
  vertex positions, so the surface lies in XZ — but the vertex shader displaced
  `p.z` and read `p.y` (always 0 there). The swell now moves along Y.
- **The camera sat on the map corner.** `boot()` aimed it at the hero, then
  `new InputController(...)` three lines later called `applyCamera()` with its
  pan still at the origin, snapping the view to world (0,0). `panWorld` is now an
  *offset* from a follow target, so the camera tracks the hero every frame and
  drag still pans relative to it. The four transition call sites (spawn, fast
  travel, dungeon enter/leave) collapse to `input.recentre()`.
- **The game opened at midnight.** `clockMin` started at 0 — `dayFactor(0)` is 0,
  the darkest frame of the cycle. The clock now starts at 10:00 (0.58 daylight)
  **and persists in the save**, so time of day survives a reload instead of
  resetting every launch.
- **Fog blanketed the whole map.** The camera orbits at radius 55, putting the
  scene 30–85 units out, while fog ramped 42→88 — so everything was washed toward
  the fog colour. Moved to 95→175, where it reads as horizon depth.
- **The skybox could never have worked.** `sky.png` loaded fine (200) but was
  tagged `EquirectangularReflectionMapping`. three.js samples an equirect
  background along the per-pixel view direction — and an **orthographic** camera
  has the same direction for every pixel, so the entire sky resolved to one flat
  grey. Switched to `UVMapping`, which renders it as a full-screen backdrop.
- **Default zoom opened too wide.** Frustum 30 at zoom 1 shows ~30 tiles on a
  42×42 map, rendering the hero about ten pixels tall — a large part of why the
  character read as low quality. Opens at 1.75 now; the full pinch/wheel range is
  unchanged.

- 68/68 QC checks (6 new: water containment, vertex count, clock start + daylight
  + save round-trip). 5/5 boot smoke.

---

## 2026-08 · QC sprint — boot crash, offline idle, XP ceiling, drops, reach

Full read-through of `src/` plus runtime probes against the compiled modules and
a real headless-browser boot. Five defects, each reproduced before and after the
fix.

**The headline: the game had not booted since P6.3.**

- **`boot()` threw on every launch — nothing rendered.** `cb2dcfb` (P6.3) added
  `this.ui.attachQuestJournal(...)` at the top of `boot()`, but `this.ui` is not
  assigned until ~60 lines later. Every launch threw
  `Cannot read properties of undefined (reading 'attachQuestJournal')`, aborting
  boot before `engine.start()` — so the render loop never began. The static HUD
  from `index.html` still painted, which is why it looked alive: a full chrome
  with an empty canvas behind it. `guarded("main", …)` caught the throw and
  turned a hard crash into a silent one. Every phase from P6.3 to P8.3 shipped on
  top of this. Fixed by constructing the UI before the systems that attach to it.
  **`npm test` stayed green throughout — it exercises systems in isolation and
  never boots the app.**

Also fixed in the same sweep:

- **Offline idle progression never paid out.** `SaveSystem.apply()` restored every
  field *except* `timestamp`, so `computeOffline()` measured "time away" from
  process start rather than the last save — a six-hour-old save reported
  `awaySeconds: 0` and an empty return screen. The whole idle pillar was inert
  for any returning player. Now restored on apply, and the elapsed window is
  consumed at the end of the offline calc so it can't be paid twice.
- **`boot()` loaded the save twice.** The second `load()` re-applied the payload
  over the live state, discarding the first load's gains and recomputing the same
  window. Collapsed to a single load.
- **Level 99 was unreachable.** `buildXpTable()` looped `n < 99`, leaving
  `XP_TABLE[99]` undefined: every skill capped at 98, and `levelProgress()` at 98
  divided by `undefined` → `width: NaN%`, which browsers drop, freezing the XP
  bar. Table now runs to 99; progress is clamped finite.
- **Main drop tables always paid exactly 1.** `rollWeighted()` returned only an
  item id, so the declared `min`/`max` were discarded — a Zombie's "10–40 coins"
  paid 1 coin. It now returns the whole entry and rolls the range, matching the
  tertiary path. This was suppressing coin income by roughly an order of magnitude.
- **The player could attack from any distance.** The monster's swing was gated on
  `monsterCanHit`; the hero's was gated only on the weapon cooldown. Added the
  mirrored `playerCanHit` (melee adjacent, ranged within `RANGED_RANGE`).

- 62/62 QC checks (8 new, pinning each of the above). Bundle 778 kB / 211 kB gzip.
- **Follow-up owed:** the suite needs a real boot smoke test — headless page load,
  assert the canvas renders and the console is clean. A unit suite cannot catch a
  wiring-order crash, and that is exactly what hid this one for five phases.

---

## 2026-08 · Phase 8.3 — Combat Tonic + drink SFX

- **Combat Tonic** 🧪: new potion, buyable at the Town Market, auto-drinks on low
  HP — heals 30 (highest auto-eat tier), a genuine boss-fight lifesaver. The
  `drink` SFX now fires on it, so all 23 SFX clips are bound to gameplay.
- 54/54 QC checks (2 new: tonic in auto-eat table + market stock).

---

## 2026-08 · Phase 8.2 — SFX pass 2 · ambient music · rigged 3D

- **SFX pass 2** (16 clips, ~4.5 cr): pickup, UI click, chest/door, monster
  squeak+spawn, step, eat/drink, accept, crafting (smelt/cook/carpentry), quest
  complete, boss slam, victory. 23 clips total in `public/sfx/`; live hooks wired
  (gather/hit/hurt/level/coin, auto-eat, achievements).
- **Ambient music** (3 loops, 2.5 cr each): town / wilderness / dungeon —
  `core/Music.ts` crossfades by zone (dungeon, or distance from town → wilds).
- **Rigged 3D** (3 meshes, 38 cr each): reusable villager (Idle) swapped into
  all NPCs; cave_brute + forest_ogre (walk/combat anims) into the boss spawns —
  `core/Model.ts` clones each GLB per actor and advances baked AnimationMixers
  each frame. Procedural figures remain as instant fallback.
- 52/52 QC green; bundle 777 kB / 211 kB gzip (+25 MB public assets).

---

## 2026-08 · Phase 8 — First asset pass (SFX, hero, skybox)

### 8.1 — SFX, real 3D hero, skybox panorama
- **SFX** (7 clips, ~2.0 cr): chop / mine / fish / hit / hurt / level-up / coin —
  wired through `src/core/Sfx.ts` (lazy `Audio`, no runtime cost) onto gather
  (per-skill), landing a hit, taking damage, level-up chime, market sell/buy and
  labour claim. MP3s in `public/sfx/`.
- **Hero mesh**: 2.6 MB low-poly GLB in `public/models/hero.glb`, loaded via
  `GLTFLoader` and swapped over the procedural box figure through
  `HeroModel.enableModel` (keeps the zero-asset figure as instant fallback).
- **Skybox**: generated panorama `public/sky.png`, hot-swapped over the procedural
  sky in `WorldSystem.buildSky` with silent fallback.
- 52/52 QC checks green; bundle 761 kB / 206 kB gzip (public assets +2.6 MB).

---

## 2026-08 · Phase 6 — World scale, biomes, onboarding, meta

### 6.4 — Meta page & achievements
- New **🏆 Progress** HUD panel: persisted kill tallies per monster, collection
  counter, per-skill level + XP, and an achievements list (🏆 unlocked / 🔒 locked).
- 8 achievements (first blood, rat hunter, heart of the forest, boss breaker,
  tenacious, pack rat, Eldric's student, pathfinder) with pop-up toasts the
  moment one flips.
- Kill counts + unlocked achievements persist in the save (`player.meta`).
- Commit `38e49e4` · cache-bust `v14`.

### 6.4-polish — Achievement pops & Phase-7 achievements
- **Gold banner pop** (animated) replaces plain toasts when an achievement
  unlocks.
- 5 new achievements fed by persisted counters: First Purchase, Junk Trader
  (20 sold), Foreman (3 villagers hired), Quartermaster (50 stock collected),
  Spelunker (floor 2).
- Commit `130f955` · cache-bust `v18`.

### 6.3 Quest journal
- **📖 Quests** panel listing active/complete quests, live objectives, givers and
  rewards. Second quest: **The Surveyor's Errand** (slay the Forest Ogre → 250
  coins, steel bar, cooked trout). Completions persist (`player.journal`).
- Commit `cb2dcfb` · cache-bust `v13`.

### 6.3-b Biome-gated monsters
- New natives: **Frost Imp** (snow) and **Bog Husk** (swamp); per-biome threat
  pools (wolves + undead in the woods), tame inner band, wild fallback.
- Commit `0da8003` · cache-bust `v12`.

### 6.2 Biomes
- Four region flavors on the tile grid (meadow / forest / snow / swamp) with
  per-biome terrain palettes and gated resources: swamp willow (woodcutting 30),
  treeless mineral-rich snowfields, dense woods, fishing anywhere.
- Commit `18db753` · cache-bust `v11`.

### 6.1 World scale
- 42×42 configurable world (`WORLD_SIZE`), four zone bands incl. the Deep Wilds,
  progressive chunk unlocking on exploration (fixed a latent bug that blocked all
  wilderness spawns), threat-scaled pools, deep-wilds dungeon entrance, map
  coverage meter + walk-range layer.
- Commit `5a7e7bf` · cache-bust `v10`.

### 6.x Map & fast travel
- **🗺️ Map** panel (player dot, waypoints incl. boss lair, coverage), proximity
  POI discovery, fast travel unlocked by beating the Cave Brute.
- Commits `64ffa01 / 1a37fa1` · cache-bust `v8-v9`.

### 6.x Onboarding quest
- Eldric the Cartographer guide NPC beside the deep-wilds door; staged quest
  (key → door → Cave Brute) with a floating objective marker and reward.
- Commit `cb2dcfb` (journal) / earlier `b495eca` · cache-bust `v7`.

## 2026-08 · Phase 7 — Economy

### 7.1 — Town market & shop
- A merchant stall now stands in the settled area (tap it → **Town Market** panel).
- **Sell junk** for coins (anything stackable at its data value: logs, bones, ores,
  food…) — tools, equipment and coins themselves are protected from being sold, so
  no softlocks. **Buy supplies**: cooked food, bronze/iron weapons and bronze
  armour (9 stock lines, fixed prices).
- Gives coins a real purpose and completes the gather → sell → gear loop.
- Commit `31949c2` · cache-bust `v15`.

### 7.2 — Dungeon depth (floor 2)
- The floor-1 exit ring is now a **stairway down** to **Floor 2**, re-using the
  same generator. Floor 2 swaps in a harder pool (6 cave slashers + a pair of
  Cave Brutes), re-seals the key/door gates, and its chest pays far better
  (coal + richer coins/ore, higher gear chance). A blue retreat stairway on
  Floor 2 lets you climb back; the teal portal on Floor 2 ends the run.
- Added `CombatSystem.removeMonster` so floor populations swap cleanly.
- Commit `759079d` · cache-bust `v16`.

### 7.3 — Villager labour
- **🏡 Village** panel: assign villagers (Bram, Wren, Old Tobias) to
  **woodcutting** (1 log / 20s) or **mining** (copper/tin ore / 30s), or stand
  them down; production accrues while playing into the **village stock**, and a
  Collect button moves it all into your bag. Assignments/stock/accrual persist
  with the save.
- Commit `33a8be6` · cache-bust `v17`.

### 7.4 — Offline village labour
- Assigned villagers keep producing into the **village stock** while you're
  away, mirroring the offline-XP system: same 8-hour cap, deterministic
  per-worker math (logs every 20s, ore every 30s), and the return screen lists
  it ("6 × Logs").
- Commit `b9d06ce` · cache-bust `v19`.

### 7.5 — Town Hall upgrade tiers
- The Town Hall now **upgrades to level 3** (Build panel → Upgrade ⬆): each
  level adds **+4h offline cap** (8h base → **12/16/20h**) and a level-scaled
  coin tax. Upgrade costs scale with the level (base cost × next level).
- The return screen announces the raised ceiling ("🏛️ Town Hall: offline cap
  raised to 12h").
- Commit `e852614` · cache-bust `v20`.

### 7.6 — Villager output perks
- Worked hours now raise a villager's **yield tier**: New hand ×1 →
  **Veteran** (2h) ×2 → **Reliable** (8h) ×3 → **Master** (20h) ×4. Live and
  offline production both pay the multiplier, hours accrue offline too, and the
  Village panel shows "⭐ tier · Xh worked".
- Commit `9966b36` · cache-bust `v21`.

### 7.7 — Villager specializations
- Each villager has a lore specialization: **Bram the Fisher** (🎣 Fresh Catch — a
  shrimp per cycle), **Wren the Woodcutter** (🪓 Fine Timber — an oak log per
  cycle), **Tobias the Elder** (🏛️ Elder's Due — a coin tribute per cycle).
  Perks stack with the veteran yield tiers, apply live and offline, and the
  Village panel shows "🎣 Fresh Catch · ⭐ Reliable · 10h worked".
- Commit `c8bcb8f` · cache-bust `v22`.

### QC sprint — test gate & audits
- **`npm test`** now runs a consolidated 46-check regression suite
  (`tests/qc.test.ts`) covering world/grid, dungeon depth, quests, map,
  market, labour (live/offline/perks/specs), meta, Town Hall, and full save
  round-trips. Fixed **sanitizer dropping P6–P8 fields** on import/load
  (journal, meta, labour, market, map). **`scripts/audit-ui.cjs`** = 46-check
  static UI/dom audit (ids, panels, branches, attach call sites).
  **`QC_CHECKLIST.md`** manual gameplay sweep; stale `bugreporturl` credential
  file & stray `systems/` copy removed; `//bugreports` scaffolded.
- Commit `024084a` · cache-bust `v24`.

### 7.9 — Zero-credit polish round
- **Offline Town Hall tax** — the hall keeps taxing while you're away (2 coins
  × level per ~6s idle cycle, capped by the same 8–20h offline cap; return
  screen shows "🏛️ Town Hall tax: N coins").
- **Market achievement trio**: Mogul (2,000 sale value), Market Flooder (100+
  of one item), Shop Regular (10 purchases) — 16 achievements total.
- **Dungeon floor 3**: the amber stairs now go 1→2→3; floor 3 packs 8 cave
  slashers + 3 Cave Brutes and a richer chest (90+ coins, coal, 35% iron
  sword); the teal portal ends the run only on floor 3; blue stairs retreat
  from floors 2 & 3.
- Commit `fe37485` · cache-bust `v25`.

### 7.8 — Market rebalance (supply & demand)
- Sell prices now slide down as an item floods the market (40% floor — a
  veteran village's oak/shrimp output stops printing coins); shop demand and a
  swelling coin pile push buy prices up (+25% inflation cap). Counters persist.
- Commit `81799ba` · cache-bust `v23`.

## Phase 5 — Dungeons
- P5.1 entrance + procedural single-floor (rooms/corridors), own monster pool
  (cave bat / cave slasher), chest, exit portal · `0547f6f` · `v4`.
- P5.2 locked door + Iron Key (consumed on use) · `7acauce` · `v5`.
- P5.3 Cave Brute mini-boss with telegraphed slam · `ac14a46` · `v6`.

---

> Play it: https://isoperia-rpg.higgsfield.app

*Phase 8 asset passes draw on the subscription credit pool (SFX, music, and
rigged 3D meshes). Everything before Phase 8 is procedural (zero-asset).*