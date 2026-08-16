# Isoperia — Update Log

Running changelog of shipped increments. Each entry names the phase, what changed,
the game-repo commit, and the live build (cache-bust version at
`isoperia-rpg.higgsfield.app`).

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
- Commit: _this round_ · cache-bust `v25`.

### 7.8 — Market rebalance (supply & demand)
- Sell prices now slide down as an item floods the market (40% floor — a
  veteran village's oak/shrimp output stops printing coins); shop demand and a
  swelling coin pile push buy prices up (+25% inflation cap). Counters persist.
- Commit `81799ba` · cache-bust `v23`.

## Phase 5 — Dungeons
- P5.1 entrance + procedural single-floor (rooms/corridors), own monster pool
  (cave bat / cave slasher), chest, exit portal · `0547f6f` · `v4`.
- P5.2 locked door + Iron Key (consumed on use) · `7ca1878` · `v5`.
- P5.3 Cave Brute mini-boss with telegraphed slam · `ac14a46` · `v6`.

---

> Play it: https://isoperia-rpg.higgsfield.app

*No generation credits were spent for any phase above — the procedural
zero-asset pipeline stays the art style (per the standing rule).*