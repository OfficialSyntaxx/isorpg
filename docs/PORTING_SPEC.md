# Isoperia Porting Spec — TypeScript/three.js → Unity C#

**Status:** authoritative **except where §0.1 says the game has deliberately moved on.**
Where this document and the Unity implementation disagree, this document wins. Where this
document and `src/` (tag `web-final`) disagree, `src/` wins and this document is a bug.

**Purpose.** The Unity migration ports game *systems* unchanged and rebuilds *visuals* from
scratch. This file pins the behaviour that must survive the port, with the exact constants
and formulas, so drift is detectable rather than discovered months later as "combat feels
different now."

Companion documents:
- `WIKI.md` — auto-generated content/balance reference (items, monsters, recipes, drops).
  Regenerate with `npm run wiki` before trusting it.
- `docs/PORTING_SPEC.md` (this file) — mechanics and contracts.

---

## 0.1 Superseded by later design decisions — READ BEFORE PORTING ANYTHING

This spec was written at Phase 0 to pin the frozen web build. Since then the Unity game has
deliberately diverged in ways that make parts of it **wrong as a target**, while the rest is
still the contract for the systems not yet ported.

It is annotated rather than rewritten, because the original numbers are still the record of
what the TypeScript did — and the remaining ports (Farm, Quest, Npc, Dungeon, Shop, Labour,
Clue, Meta, Map) are ports *of that code*.

| This spec says | The game now does | Where |
|---|---|---|
| `WORLD_SIZE = 42` | **126×126** (`Grid.WorldSize`); 42 survives as `LegacyWorldSize` for save migration | §3 |
| identical 42×42 terrain in C# and TS | **not achievable and not wanted** — the worlds differ by design | §3.1, §10.7 |
| `SAVE_VERSION = "1.1.0"` | **`"2.2.0"`**; anything older triggers the mainland migration | §8 |
| — | migration relocates the player to the new town centre, remaps buildings through `MainlandTownCoordinate`, and clears clue / discovered / explored / fastTravel | §8 |
| — | saves carry a `resources` key (resource-node depletion) that the web build never had | §8 |
| the wiki is generated from `src/data` | quests are now authored directly in the Unity JSON (`UNITY_AUTHORED` in `scripts/export-content.cjs`) and are **absent from the wiki** | §10 |

**How determinism is pinned now.** §10.7 asks for a C#-vs-TypeScript tile diff. That check is
retired. World generation is instead pinned against a committed C# golden dump —
`npm run verify:world`, `tools/parity/golden/world-126x126.txt`. That is a weaker guarantee
and the script says so: it proves the world has not *changed*, not that it is *correct*.

**What is still fully authoritative:** the 600 ms tick, the camera geometry, `mulberry32`
itself and its draw-order traps, the XP and mastery curves, and every combat formula. Those
are still verified against the TypeScript on every run (`npm run verify:parity` — XP 121
lines, Combat 1,338 lines) and have never drifted.

---

## 0. Ground rules for the port

1. **Single-threaded.** The Unity WebGL target has no threads. Every ported system is
   plain synchronous C#. No Job System, no `Task`, no `async` in game logic.
2. **Logic classes are POCOs, not MonoBehaviours.** The TS systems are already free of
   rendering concerns; keep it that way. MonoBehaviours exist only to bridge Unity's
   lifecycle into the tick runner and to drive presentation.
3. **Presentation never decides outcomes.** Animation, VFX, and camera read game state;
   they never gate it. A damage number appears because a hit was resolved on a tick, never
   the reverse.
4. **Integer/float parity matters.** The formulas below use `Math.floor` and `Math.round`
   deliberately. In C# use `Mathf.FloorToInt` / `Mathf.RoundToInt` on `double` or `float`
   consistently, and prefer `double` where TS used a plain number in a formula that
   accumulates.

---

## 1. The tick

Source: `src/core/Engine.ts`

```
TICK_MS = 600
```

- A **fixed 600 ms tick**, 100 ticks per minute, driven by an accumulator and **decoupled
  from the render frame**. Frame rate may vary; tick rate may not.
- Two separate handler lists: `TickHandler(tickIndex, dtMs)` and
  `FrameHandler(dtSeconds, elapsed)`. All gameplay is on the tick list. Interpolation,
  camera smoothing, and animation are on the frame list.
- `tickIndex` is a monotonically increasing integer and is used for scheduling
  (e.g. autosave every 20 ticks). It must not reset on pause.

**Unity contract:** a `TickRunner` accumulating `Time.deltaTime` and firing
`OnTick(int tickIndex)` zero or more times per frame. Do **not** use `FixedUpdate` — its
default step is unrelated and its interaction with WebGL frame pacing is not something we
want load-bearing under our combat math.

**Catch-up clamp:** if the accumulator exceeds several ticks (tab backgrounded, GC pause),
cap the number of ticks processed in one frame so a resumed tab doesn't run hundreds of
combat rounds instantly. Offline progress is handled separately and deliberately (§7).

---

## 2. Camera

Source: `src/core/Engine.ts`

```
PITCH   = asin(tan(30°))  = 35.264389682…°
YAW     = 45°
FRUSTUM = 30              (orthographic vertical size)
RADIUS  = 55              (camera distance from target)
```

- **Orthographic**, classic 2:1 isometric. Position is computed from the smoothed target:
  ```
  x = target.x + R·cos(PITCH)·sin(YAW)
  y = target.y + R·sin(PITCH)
  z = target.z + R·cos(PITCH)·cos(YAW)
  lookAt(target)
  ```
  Yaw 45° means the camera sits to the south-west looking north-east.
- Horizontal extents are `±(FRUSTUM · aspect)/2`, vertical `±FRUSTUM/2`, near 0.1, far 1000.
- `cameraTarget` is the logical focus; `smoothTarget` eases toward it each **frame**.
  While the player is actively dragging or pinching, `snapPan` disables smoothing so the
  camera tracks the finger 1:1; smoothing resumes on release. **Port this** — it is the
  difference between responsive and floaty touch panning.
- `addShake(amount)` accumulates, capped at `1.1`, and decays per frame.

**Unity contract:** an orthographic camera with `orthographicSize = 15` (half of FRUSTUM),
Euler rotation `(35.264389682, 225, 0)` — Unity is left-handed and Y-up, so verify the
resulting view direction against a reference screenshot from the web build rather than
trusting the number. Shadow projection must be checked at this angle specifically.

---

## 3. World generation

Source: `src/world/Grid.ts`

```
WORLD_SIZE = 42          (42×42 tiles)   ← SUPERSEDED: now 126×126, see §0.1
GRID_CHUNK = 6           (7×7 chunks)
```

### 3.1 PRNG

`mulberry32`, seeded **per tile** as `seed = x·31 + y·57 + 1337`:

```
function mulberry32(a):
  a |= 0
  a = (a + 0x6d2b79f5) | 0
  t = imul(a ^ (a >>> 15), 1 | a)
  t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
```

**This must be reproduced bit-exactly in C#.** All operations are on 32-bit signed/unsigned
integers with wrapping. Use `int`/`uint` with `unchecked{}` and implement `imul` as
`unchecked((int)((long)a * (long)b))`. `>>>` is `>>` on a `uint`.

Determinism is a hard requirement — but **no longer against the TypeScript**. The worlds are
different sizes by design (§0.1), so the same seed cannot and should not produce the same
terrain in both. `mulberry32` itself must still be bit-exact, and world generation is pinned
against a committed C# golden dump instead: `npm run verify:world`.

#### ⚠ Draw-order trap

The per-tile generator is **stateful**, and the number of draws taken before the tile's
`seed` field is read **varies by branch**:

| Tile | Draws consumed by `rollTerrain` | `seed` field uses draw # |
|---|---|---|
| map edge (→ `WATER`) | 0 — returns before any draw | 1 |
| coast (→ `SAND`) | 0 — returns before any draw | 1 |
| everything else | 1 (`const r = rnd()`, now unused by the patch-noise terrain) | 2 |

That vestigial `const r = rnd()` on `src/world/Grid.ts:137` is dead for terrain selection —
patch noise replaced it — but it **still advances the stream**, so removing it during the
port would silently reshuffle every interior tile's decoration seed. Port it as-is,
comment it as load-bearing, and cover it with the determinism test (§10.7).

`isCoast` uses a **separate** generator seeded `x·31 + y·57 + 2401`, one fresh instance per
call, so it never perturbs the tile stream.

### 3.2 Terrain

Per tile, in order:
1. Map edge (`x==0 || y==0 || x==w-1 || y==h-1`) → `WATER`.
2. Coast ring → `SAND`.
3. Interior (`x>3 && y>3 && x<w-4 && y<h-4`) lake noise:
   `n = sin(x·0.9) + cos(y·0.6) + sin((x+y)·0.45)`; `n > 2.15` → `WATER`.
4. Patch noise `p = terrainPatchNoise(x,y)`: `p > 1.66` → `ROCK`, `p > 0.93` → `DIRT`.
5. Otherwise `GRASS`.

Terrain types: `GRASS | WATER | ROCK | DIRT | SAND | ROAD`.
Target distribution: ~6% rock, ~14% dirt.

**Elevation:** `clamp(0.05 + sin(x·0.55)·cos(y·0.5)·0.09 + sin((x+y)·0.37)·0.05, 0, 0.22)`,
except `WATER` which is fixed at `-0.25`.

### 3.3 Zones and biomes

Chunk-distance from the centre chunk, Chebyshev: `d = max(|r-cr|, |c-cc|)`
- `d==0` → `TOWN_CENTER`
- `d==1` → `SETTLEMENT`
- `d==2` → `WILDERNESS_LVL1`
- else → `WILDERNESS_LVL2`

**Town rule:** in `TOWN_CENTER`, any non-`ROAD` terrain is forced to `GRASS`. Do not skip
this — without it the spawn area becomes an unbuildable quarry with a lake in it.

Biomes (`MEADOW | FOREST | SNOW | SWAMP`): `TOWN_CENTER` and `SETTLEMENT` are always
`MEADOW`. Otherwise by chunk quadrant — north-east `SNOW`, south-west `SWAMP`, rest
`FOREST`.

### 3.4 Tile record

```
Tile { x, y, elevation, terrainType, walkable, buildable,
       occupant, occupantId, zoneId, biome, seed }
```
- `walkable = buildable = (terrain != WATER && terrain != ROCK)`
- `occupant ∈ NONE | BUILDING | RESOURCE_NODE | MONSTER | NPC`
- **`seed = floor(rnd() · 1e6)`** — a permanent per-tile decoration seed. All visual
  scatter (grass tufts, rocks, flowers) must derive from this so decoration is identical
  across sessions and machines. Carry this into the Unity art phase; it is what makes the
  world feel like a place rather than a re-roll.

**Region unlocking:** `regionUnlocked[row][col]` per chunk, centre chunk unlocked at start.

### 3.5 Walkability

`isWalkable(x,y)` = in bounds **and** `tile.walkable` **and** `tile.occupant == NONE`.
Note that resource nodes therefore block movement — the player paths *adjacent* and then
harvests (§4).

---

## 4. Pathfinding

Source: `src/ai/AStar.ts`

- **8-directional A***, cardinal cost `1`, diagonal cost `√2`.
- Heuristic is **octile distance**: `max(dx,dy) + (√2 − 1)·min(dx,dy)`.
- **No corner-cutting**: a diagonal step from `(x,y)` to `(x+dx, y+dy)` requires both
  `(x+dx, y)` and `(x, y+dy)` to be walkable.
- Returns the path **excluding the start tile**, first step first; `null` if unreachable.
- `allowAdjacentIfBlocked`: when the goal tile itself is blocked (a tree, an ore vein),
  path to the nearest walkable tile to the goal instead. This is how "tap a tree to go
  chop it" works and must be preserved.

The TS implementation sorts the open list every iteration. **In C#, use a binary heap /
priority queue.** At 42×42 the difference is not correctness, but WebGL has no CPU budget
to waste and this is called on every tap and every monster chase tick.

**Movement:** `PositionComponent` carries grid coords (`gx`,`gy`), interpolated world
coords (`wx`,`wz`), `facing`, and **`speed = 4` tiles/second** (default). Grid position is
authoritative; world position is interpolation for rendering and steps on the *frame*, not
the tick.

---

## 5. Progression: XP and levels

Source: `src/data/XPTable.ts`

Standard OSRS curve, **max level 99**. XP required to *reach* level `L`:

```
cumulative[1] = 0
total = 0
for n = 1..99:
    cumulative[n] = floor(total / 4)
    total += floor(n + 300 · 2^(n/7))
```

Note the ordering: the threshold is recorded from terms accumulated **before** adding term
`n`, and the division by 4 happens once at read time, not per term. Getting this subtly
wrong produces a curve that looks right and is wrong everywhere.

`levelFromXp(xp)` scans down from 99 and returns the highest level whose threshold is met;
floor is level 1.

**Skills (12):** `attack, strength, defense, hitpoints, cooking, smithing, carpentry,
construction, farming, woodcutting, mining, fishing`.
- Combat: `attack, strength, defense, hitpoints`
- Craft panel: `cooking, smithing, carpentry` (construction uses the Build panel)

**Mastery** is tracked *per item* within a skill, on its own **triangular curve at 1 XP per
unit** gathered/crafted, max 99 — explicitly **not** the skill curve. Save version `1.1.0`
exists because of this change; do not reintroduce the skill curve here.

---

## 6. Combat

Sources: `src/systems/CombatSystem.ts`, `src/data/Combat.ts`

All combat resolves **on the 600 ms tick**.

### 6.1 Hit chance

```
hitChance(attackRoll, defenseRoll):
    if attackRoll > defenseRoll:
        return 1 − (defenseRoll + 2) / (2·(attackRoll + 1))
    else:
        return attackRoll / (2·(defenseRoll + 1))
```

### 6.2 Player attack

```
attackRoll = weapon.accuracy + attackLevel + bonus.attack
           + style.accuracyBonus + buff.accuracyBonus

hit unless (not special.guaranteedHit) and random() > hitChance(attackRoll, target.defenseRoll)
    → a miss is a "splash": zero damage, still consumes the tick

maxHit = weapon.maxHit + floor(strengthLevel / 4) + bonus.strength
       + style.maxHitBonus + buff.maxHitBonus

if special:
    executing = target below 25% HP and special.executeMult is set
    maxHit = round(maxHit · (executing ? special.executeMult : special.damageMult))

damage = 1 + floor(random() · max(1, maxHit))
```

Damage is therefore always **at least 1** on a landed hit, and never exceeds `maxHit`.

### 6.3 Monster attack

```
hit unless random() > hitChance(monster.attackRoll, 2 + playerDefenseLevel)
dmgMax = monster.maxHit + (monster.enraged ? 2 : 0)
damage = 1 + floor(random() · max(1, dmgMax))
```

### 6.4 Attack styles

Chosen per fight; persisted in settings. Default `accurate`.

| Style | Accuracy | Max hit | Defense | Trains |
|---|---|---|---|---|
| accurate | +3 | 0 | 0 | attack |
| aggressive | 0 | +3 | 0 | strength |
| defensive | 0 | 0 | +3 | defense |

Hitpoints trickles on every hit regardless of style.

### 6.5 Resolve and buffs

`RESOLVE_MAX = 100`, `RESOLVE_REGEN_PER_TICK = 3`, `RESOLVE_REGEN_RANGE = 2` tiles from a
Campfire. Regen requires resting near a Campfire.

| Buff | Accuracy | Max hit | Defense | Cost/tick |
|---|---|---|---|---|
| precision | +6 | 0 | 0 | 2 |
| power | 0 | +4 | 0 | 2 |
| warden | 0 | 0 | +6 | 2 |

### 6.6 Weapon specials

`SPECIAL_MAX = 100`, `SPECIAL_REGEN_PER_TICK = 1` — regenerates anywhere, unlike Resolve.

| Weapon | Special | Cost | Mult | Guaranteed | Execute |
|---|---|---|---|---|---|
| dagger | Puncture | 25 | 1.2 | yes | — |
| sword | Riposte | 40 | 1.3 | no | — |
| sword2h | Cleave | 100 | 1.8 | no | — |
| shortbow | Piercing Shot | 50 | 1.4 | yes | — |
| iron_sword | Execute | 60 | 1.2 | no | 2.2 under 25% HP |
| steel_sword | Onslaught | 80 | 1.9 | no | — |

Weapon speed is in ticks between attacks (shortbow 3 ticks / 1.8 s, 2H 6 ticks / 3.6 s).

### 6.7 Affixes

`AFFIX_CHANCE = 0.12`, rolled per spawn, uniform across the three. Bosses never get
affixes — they have slam/enrage identity already.

| Affix | Effect | Tint |
|---|---|---|
| hardened | +50% HP, +30% max hit, +30% defense | `#ff5a3a` |
| swift | ~40% faster attacks, wider aggro | `#55d6ff` |
| rich | double coin drops, doubled tertiary chance | `#ffd75a` |

**Critical invariant:** the shared `MONSTERS` definition is **never mutated**. A rolled
monster carries its own scaled copy. In C# this means a defensive clone at spawn — a
reference-shared mutation here would permanently corrupt the monster table for the session.

### 6.8 Bosses

Enrage below 50% HP (+2 max hit). Bosses with `slamChance` telegraph a slam per tick even
at full HP; damage is `slamDmg` if set, else `6 + floor(random()·5)` (i.e. 6–10).

### 6.9 Drops

- **Main table:** weighted single roll. `total = Σ weight`; `r = random()·total`; subtract
  each weight until `r <= 0`. Falls through to the last entry — port the fallthrough, it is
  the guard against float drift.
- **Tertiary:** independent `random() < chance` per entry.
- **Pet table:** independent `random() < chance` per entry.
- Quantity: `rand(min,max) = min + floor(random()·(max − min + 1))`, inclusive both ends.

### 6.10 Auto-eat and death

- Auto-eat triggers at `autoEatPct` of max HP. Steps: `0, 20, 30, 40, 50, 60, 75`;
  default **40**; `0` disables.
- **Death penalty:** 15% of bulk resources lost.

---

## 7. Persistence

Sources: `src/systems/SaveSystem.ts`, `src/utils/Sanitizer.ts`, `src/state/GameState.ts`

```
SAVE_VERSION          = "1.1.0"   ← SUPERSEDED: now "2.2.0", see §0.1
AUTOSAVE_EVERY_TICKS  = 20        (~12 s)
OFFLINE_CAP           = 8 h       (12 h with a Town Hall)
DAY_START_MINUTE      = 10·60     (new game opens at 10:00)
DEFAULT_HERO_NAME     = "Corvin"
```

### 7.1 Save shape

Top level: `version`, `timestamp`, `player`, `world`, `clock`, `town`, `collectionLog`,
`settings`.

`player`: `name`, `pos`, `health`, `skills`, `inventory`, `equipped` (per `EquipSlot`),
`map { discovered, fastTravel, explored }`, `journal` (completed quest ids), `clue`
(one active hunt or null), `resolve`, `activeBuff`, `specialEnergy`,
`meta { kills, achievements, counters }`.

`town`: `buildings`, `labour { assignments, stock, acc, worked }`,
`market { supply, demand }`, `farm { plots }`.

**The world grid is regenerated, not stored** — it is a pure function of the seed. Only
mutable world state (nodes, occupancy) persists. Keep this; it is why saves are small.

**Farming stores only the seed and the sow time (epoch ms).** Growth is a function of
`now()`. There is no accumulated progress to persist and therefore no offline catch-up pass
that could pay out twice. Do not "improve" this into a tick-accumulated system.

### 7.2 Version discipline

Bump `SAVE_VERSION` when a field **changes meaning**, not when one is added. A value
silently reinterpreted on a new scale is worse than a missing one. `1.1.0` marks mastery XP
moving off the skill curve.

### 7.3 Sanitizer

`Sanitizer.ts` (225 LOC) validates and migrates loaded saves and must be ported in full,
not approximated. It is what makes a corrupt or hand-edited save degrade instead of
crashing. Rollback recovery and sanitized JSON import/export depend on it.

### 7.4 ⚠ WebGL: IndexedDB flush

**This is the single most likely data-loss bug in the port.**

Unity WebGL maps `Application.persistentDataPath` to an in-memory Emscripten filesystem
backed by IndexedDB. Writes do **not** reach IndexedDB until `FS.syncfs` runs. A save
written and not flushed is lost when the tab closes.

Requirements:
1. A JSLib plugin exposing an explicit sync, invoked after every save.
2. Flush on autosave, on manual save, on `pagehide`/`visibilitychange`, and before any
   scene teardown.
3. Treat a save as *not* durable until the sync callback returns.
4. Test deliberately: save → close tab → reopen → progress intact. Also test backgrounding
   and an iOS memory kill.

Native builds do not need this, but the code path should be shared and simply no-op off
WebGL.

### 7.5 Offline progression

On load, elapsed wall-clock time since `timestamp`, capped at 8 h (12 h with a Town Hall),
drives offline labour output and Town Hall gold tax. Farming is excluded by construction
(§7.1). The cap is a design decision, not a safety valve — preserve it exactly.

---

## 8. Content data

`src/data/` holds ~1,575 LOC of TypeScript literals: 62 items, 12 monsters, 7 weapons,
31 recipes, 8 buildings, 5 villagers/critters, quests, clue scrolls, farming crops,
19 achievements, the XP table. (Counts as of `web-final`; `WIKI.md` is authoritative.)

**Port target: runtime JSON, not ScriptableObjects.** Rationale — JSON keeps
`scripts/gen-wiki.cjs` alive, so the website's wiki page regenerates from the exact data
the game loads and can never drift from the build. ScriptableObjects would sever that.

A one-shot TS→JSON export script is written during Phase 2. After the cutover, the JSON
files are the source of truth and the TS literals are gone.

`WIKI.md` is the human-readable rendering of all of this. Regenerate it before using it as
a reference.

---

## 9. What is deliberately **not** ported

- **Procedural geometry** (`src/generators/`, ~777 LOC) — replaced entirely by low-poly
  art assets. Its **palette** is worth lifting into the art bible; its meshes are not.
- **`ClipLibrary` / `verify-rig.cjs`** — replaced by Unity's Animator with retargeted
  humanoid clips.
- **DOM UI** (`src/ui/UI.ts`, 969 LOC) — rebuilt in UI Toolkit. The panel inventory,
  information architecture, and the 62 item icon PNGs carry over; the implementation does not.
- **The custom QC harness** (`scripts/*.cjs`, ~2,601 LOC) — replaced by Unity Test
  Framework. `tests/qc.test.ts`'s **assertions** carry over (§10); its runner does not.
- **Save import from the web version** — Unity starts with fresh saves. The schema stays
  structurally similar so the sanitizer logic ports cleanly, but no importer is maintained.

---

## 10. Port fidelity tests

These are the acceptance criteria for Phase 2. They are direct translations of
`tests/qc.test.ts` (321 assertions) and must expect the **same numbers**, not
"reasonable" ones. Any divergence is a port bug until proven otherwise.

1. **XP table** — full 99-entry cumulative table matches value for value;
   `levelFromXp` boundaries at every level.
2. **Hit chance** — both branches of the formula at representative rolls, including
   `attackRoll == defenseRoll`.
3. **Max hit** — per weapon × style × buff × special combination.
4. **Drop tables** — weights sum as expected; the weighted roll is unbiased over many
   samples; the fallthrough returns the last entry.
5. **Recipes** — every recipe's inputs and outputs reference real item ids.
6. **A\*** — known paths on a fixture grid, no corner-cutting, `allowAdjacentIfBlocked`
   reaches the adjacent tile, unreachable returns null.
7. **World-gen determinism** — ~~dump the 42×42 terrain grid from the TS build and from C#
   for the same seed and diff them~~. **Retired** (§0.1): the worlds differ by design. Now a
   committed C# golden dump of the 126×126 world, `npm run verify:world`, mutation-tested
   against a removed PRNG draw, a 1e-9 coefficient change, and a reordered stream.
8. **Save round-trip** — serialize → deserialize → deep-equal; sanitizer handles a
   truncated save, an unknown-version save, and a save with an out-of-range value.
9. **Offline progression** — 0 h, 4 h, 8 h, and 30 h elapsed produce the expected capped
   output, with and without a Town Hall.

**Feel parity (manual):** a side-by-side session, web build vs. Unity build, comparing tick
cadence, movement speed, hit frequency, and XP rates. Numbers passing while the game feels
different means something outside these tests is wrong.
