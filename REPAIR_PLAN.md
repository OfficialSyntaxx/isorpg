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

## Phase D — Release confidence (~1 session, run alongside)
1. CI: build + test + smoke on every push, with a browser driver so smoke doesn't skip.
2. Visual regression on the opening frame (would have caught both Phase A defects).
3. Close the definite-assignment hole — `ui!: UI` is why the compiler stayed silent.

## Phase E — Unbuilt content
Collection log viewer (S) · building upgrades beyond Town Hall (S) · auto-eat threshold
UI (S) · smithing weapons to consume bars (M) · equipment slots (M) · farming & seeds (M)
· clue scrolls (L).

---

**Suggested order:** A → B → C, with D alongside from the start. Phase A first because
until the camera frames the hero and the water stops triangulating through terrain, no
judgement about how the models look is reliable.
