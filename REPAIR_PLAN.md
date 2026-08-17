# Isoperia — Repair Plan (5 phases)

> Companion to `ROADMAP.md`. Where ROADMAP.md plans *new* content, this plans the
> repair of what's already built. Every item is anchored to something reproduced in
> the running game — a console probe, a GLB header dump, or a screenshot.
> Hosted version: https://claude.ai/code/artifact/40775a21-e9b0-4791-9ffb-2ea1ecc29b32

## Shipped already (this sprint)

Boot crash (game had not rendered since P6.3) · offline idle progression (a 6h save
paid nothing) · level 99 reachable + XP bar NaN · drop tables honouring min/max ·
player attack range gate · QC harness (static boot-order check, headless smoke test,
fail-loud boot errors, portable `npm test`).

## Verified causes behind the visual complaints

| Symptom | Cause | Where |
|---|---|---|
| "Random wave-looking water" | `buildWater()` builds ONE self-intersecting `THREE.Shape` across every water tile (`moveTo` once, then `lineTo` per tile). `ShapeGeometry` triangulates it into a giant wedge. | `systems/WorldSystem.ts` |
| World off-centre, grey void | Boot aims the camera at the hero, then `new InputController(...)` 3 lines later calls `applyCamera()` with pan at origin — snapping to world (0,0), the map corner. | `main.ts:216` → `main.ts:219` |
| Character looks static/poor | `hero.glb` contains **zero animation clips** (villager + both bosses have one each). | GLB header dump |
| Hero worse than the placeholder | Hero loads via a bespoke `GLTFLoader` that passes only `gltf.scene`, discarding animations and bypassing `core/Model.ts`. `enableModel()` then hides the procedural boxes that `MovementSystem` actually animates. | `main.ts`, `generators/Character.ts` |
| Villagers/bosses animate wrongly | `spawnModel()` plays `clips[0]` forever — villagers Idle while walking, bosses Walk while standing. Each GLB ships only one clip. | `core/Model.ts` |
| Opens at midnight | `clockMin = 0` → `dayFactor(0) === 0`, full night on a fresh save. | `main.ts` |

## Phase A — First impression ✅ SHIPPED
1. Rebuild water as per-tile quads merged into one `BufferGeometry` (keep the shader).
2. Seed `InputController` pan from the hero; follow the hero on movement.
3. Start the clock at ~08:00 and persist it in the save.
4. Verify the skybox reaches the background; re-check fog range (42→88) on a 42×42 map.

**Done when:** a fresh save opens in daylight, centred on the hero, with water only on water tiles. ✅

Shipped: per-tile water geometry (+ shader displacing Y not Z), camera follow with
drag-as-offset, clock starting 10:00 and persisted in the save, fog moved to
95→175, skybox switched off equirect mapping (incompatible with an ortho camera),
default zoom 1.75. 68/68 QC + 5/5 smoke.

## Phase B — Model & animation pipeline (~2 sessions + asset regen)
1. Route the hero through `spawnModel()` — one loader for all GLBs. *(prerequisite for 2)*
2. Regenerate `hero.glb` **with a rig**: Idle + Walk minimum, ideally Attack + Gather.
   Match the existing naming convention (`Armature|Name|baselayer`).
3. Replace `clips[0]` with a clip state machine (`play(name)` + crossfade), driven by
   the action state the game already computes (`setAction()`, NPC movement flags).
4. Add a second clip to villager (Walk) and both bosses (Idle, ideally Attack).
5. Audit scale/triangle budget: hero is 2.6 MB normalised to 0.75 units at frustum 30;
   22 MB of GLB is the build's largest cost. Set a per-actor budget; verify silhouettes
   read at default zoom.

**Done when:** every actor has ≥2 clips and visibly changes state; one GLB code path.

## Phase C — Correctness debt ✅ SHIPPED
1. Enforce `storageCap` inside `addItem()` (offline currently grants 3× cap — verified). ✅
2. Per-item mastery for the speed bonus (mirror `CraftingSystem`). ✅
3. Retune mastery: 4 xp/action puts mastery 20 at ~2.8h of chopping. ✅
4. One weapon selector honouring `requiredAttack`; UI calls it instead of reimplementing. ✅

Shipped: the cap became an invariant inside `addItem`, scoped to bulk resources so
currency/keys/quest items/gear are never blocked. Gathering speed reads mastery for
the resource being gathered, not the sum of every mastery in the skill. Mastery got
its own triangular curve at 1 XP/unit — level 99 is now 9.7–25.9 h per resource
instead of 8,146 h — with a save migration (`1.1.0`) that rescales stored XP by 4 so
existing players keep the actions they actually performed. `selectWeapon()` in
`data/Combat.ts` is the single answer to "what is the hero swinging?", enforcing
`requiredAttack`; combat and the stats panel both call it. 98/98 QC.

## Phase D — Release confidence
1. CI: build + test + smoke on every push, with a browser driver so smoke doesn't skip. ✅
2. Visual regression on the opening frame (would have caught both Phase A defects). ✅
3. Close the definite-assignment hole — `ui!: UI` is why the compiler stayed silent. ✅

Shipped: `.github/workflows/ci.yml` runs build + audit + QC + rig + wiki + smoke +
visual regression on every push and PR, installing Chromium so nothing skips, and
failing if a generated file (wiki, model manifest) is stale. `scripts/visual-regress.cjs`
compares the opening frame to `tests/baseline/opening-frame.png`; determinism comes
from `?canonicalFrame=0`, which boots the game, waits for rigged meshes, clears
toasts, pins animation time and draws one frame without ever starting the loop.
Measured: 0.00% drift across repeated runs; 73% on a camera that stops following the
hero (Phase A defect #2), 7.3% on a 20% tree-scale change.

**Item 3, done properly.** Every system in `boot()` is now a `const` local, published
to the instance as soon as its statement completes. Locals get TypeScript's temporal
dead zone, so re-injecting the original bug —
`ui.attachQuestJournal(...)` above `const ui = new UI(...)` — is now a **compile
error**: `TS2448 Block-scoped variable 'ui' used before its declaration`. The `!`
assertions remain (they must, given async construction) but can no longer hide
anything, because nothing in boot reads a system back off `this`.

Publishing has to be per-statement, not one block at the end: `new InputController`
synchronously calls its own `getFollowTarget`, which reaches `this.heroWorldPos()` and
reads `this.state`. The first attempt deferred all publishing and broke the opening
frame — **the smoke test caught it, 2/5**. Three `audit-ui.cjs` checks now assert the
shape (built as locals, never read off `this`, every local published), each verified
by injecting its regression.

## Phase E — Unbuilt content

**Done this session.**
- **Collection log viewer** ✅ — the log was already recorded and persisted; the Menu
  printed a bare count, so there was no way to see *what* was in it or what was
  missing. Now a tab in Progress: every item grouped by type, per-group counts, and
  undiscovered entries as dimmed `? ???` cells — the gap is the information.
- **Building upgrades beyond Town Hall** ✅ — this was a live defect, not missing
  content. Upgrading cost 2× then 3× the materials and changed nothing but a 12%
  larger mesh, because every passive effect read `count()` (how many buildings) and
  only the Town Hall ever read its level. New `levels()` sums levels across
  instances, so one level-3 Sawmill works like three level-1 ones. Upgrading also
  now recomputes the storage cap, which was previously invisible until a reload.
- **Auto-eat threshold UI** ✅ — was a hardcoded 40%. Now a Menu setting
  (Off/20/30/40/50/60/75%), persisted, with off-grid stored values snapped to a
  selectable step so a hand-edited save cannot leave it unrepresentable.
- **Smithing weapons to consume bars** ✅ — smithing dead-ended at tools and armour:
  not one weapon had a recipe, so the only way to hold a sword was a monster drop or
  the market, and steel bars fed nothing but an axe and a pickaxe. Added forge
  recipes for the bronze dagger/sword/2H and the iron sword, a carpentry recipe for
  the shortbow, and a new **Steel Sword** (13 max hit, Attack 20) to give steel a
  weapon tier. A QC check now fails if any weapon lacks a recipe or any bar lacks a
  consumer.
- **Equipment slots** ✅ *already shipped* — the plan item was stale. `equipItem` /
  `unequipItem` / `armorBonuses` and the Bag's equip/unequip rows were all in place;
  `selectWeapon` reads the weapon slot. Verified, not rebuilt.

**Fixed along the way** (both surfaced by looking at the panel rather than the tests):
- `.inv-name` had no `flex`, so any row whose only child was the name got shoved to
  the right edge by `space-between` — the Levels and achievement lists read as
  `StrengthLv 1 · 0 XP`, right-aligned and unspaced.
- `.panel-body` had `max-height: calc(62vh - 70px)` while the desktop side panel sets
  `max-height: none` and stands ~850 px tall, so lists were clipped at 488 px with
  360 px of dead panel below. Now `flex: 1; min-height: 0`.

- **Farming & seeds** ✅ — a new skill that advances on **wall-clock time** rather than
  on actions, which is why it needs no offline pass at all: a bed stores the seed and
  the epoch ms it was sown, so growth is a function of `Date.now()` and cannot drift
  or be paid twice. Beds come from **Farm Plot** levels (Construction 3), matching
  every other passive effect. Three seeds (potato 5 min, cabbage 12 min, redberry
  30 min) stocked by the merchant, and every crop closes a loop: potatoes and
  cabbages feed new Cooking recipes, redberries brew the **Combat Tonic**, which was
  previously shop-only. Farmed in Village → Farm.

**Fixed along the way.** `.btn { width: 100% }` is declared *after* `.btn-mini`, and
every row control is written `class="btn btn-mini"` — so the mini button took the
whole row and, being `flex-shrink: 0`, squeezed the row's label to **zero width**.
This affected Bag equip/unequip, village labour, map travel and shop buy/sell, and had
been shipped for some time. Found by measuring the DOM after the farm rows looked
wrong, not by reading the CSS.

- **Clue scrolls** ✅ — a multi-step treasure hunt. Reading a scroll consumes it and
  writes one hunt onto the player: inventory stacks hold only an id and a count, so
  per-scroll state could never live on the item. Each dig site is marked on the map
  one at a time; tapping the tile walks there and digs. Sites are drawn from a stored
  seed, so a hunt is reproducible and survives a reload unchanged, and the sanitizer
  clamps a hand-edited step into the site list so a save cannot strand the player on
  an unfinishable hunt. Two tiers (2 and 3 digs) as tertiary drops from goblins and
  skeletons. **The rewards are the first `offhand` items in the game** — that slot had
  been declared and empty since equipment shipped.

## Phase E — complete

Remaining ideas, not planned: the `GEM` item type still has no members.

---

**Suggested order:** A → B → C, with D alongside from the start. Phase A first because
until the camera frames the hero and the water stops triangulating through terrain, no
judgement about how the models look is reliable.
