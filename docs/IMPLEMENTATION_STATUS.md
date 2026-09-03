# Alderfell implementation status

Design baseline: GDD 6.1. Current production milestone: **M0 — in progress**.
This is the working board, not a claim that described gameplay already exists.

## Preparation gate

| ID | Task | State | Evidence / remaining condition |
|---|---|---|---|
| P01 | Repair validator fixtures and add shipping-JSON gate | Verified | `740a776`, 411/411 tests; run `33653573403` |
| P02 | Retire the legacy exporter write path | Verified | Direct invocation exits 1; SHA-256 snapshots of all 13 content JSON files unchanged; npm test export call removed |
| P03 | Align GDD, Claude/Codex entry points, workflow and handoff | Verified | Active Markdown links resolve; all three skills pass quick_validate; diff reviewed |
| P04 | Connect local Unity and Blender to the correct checkout | In review | 2026-09-02 recovery opened `/Users/syntaxx/isorpg-m0/unity` in Unity 6000.5.8f1 and selected `unity@931634bd`; project identity and atlas check passed. Its MCP instance disappeared on entering Play Mode, preventing required runtime evidence. Blender bridge was not exposed; see `M0_REMOTE_RETURN.md`. |
| P05 | Establish target-device evidence | Planned | iPhone for iteration; target-class Android performance remains unverified |

P01–P03 prepare repository work. P04 gates scene authoring. P05 gates final M0
mobile acceptance, not atlas research or initial blockout.

## Production work queue

| ID | Work | State | Dependency / exit evidence |
|---|---|---|---|
| M0-01 | Palette reference and Shorelands atlas | In review | Codex, 2026-09-02: five-family CC0-derived atlas, reproducible generator and UV guide committed; Unity import/lit-scene review pending; see `M0_SHORELANDS_ART.md` |
| M0-02 | Terrain/world, wind and water shaders | In review | Shader/material sources committed; reported import passes. Terrain control mapping, atlas-UV mesh usage, water depth and lit runtime evidence remain unresolved; see `M0_CHECKPOINT_REPAIR.md`. |
| M0-03 | Isolated Shorelands scene and greybox | In review | Six roots and rig persist. Scoped macOS players now prove M0 has no WorldRuntime/SaveDriver while normal Bootstrap has both before SaveDriver against a disposable store; Input System inspection controls attach. Lit visual proof, route, captures, statistics and device evidence remain required. |
| M0-04 | Hero landforms and admitted scatter | Planned | Blockout and art admission evidence |
| M0-05 | Dress, light and compose three reveals | Planned | Prior art tasks; three phone captures |
| M0-06 | Profile and review the beauty proof | Planned | GDD §36; measured device evidence and authoring hours |
| M1-01 | Specify command/movement ownership contract | Planned | M0 gate, D02; serialized intents, ordering, spatial adapter and reconciliation tests |
| M1-02 | Replace transform-to-state movement bridge | Planned | M1-01; Core owns position; Unity input/animation and traversal validated |
| M1-03 | Isolate old world bootstrap and offline/labour wiring | Planned | Keep legacy source; new gameplay bootstrap cannot invoke idle rewards |
| M2-01 | Three abilities, one wolf, feedback and enemy AI | Planned | D03; GDD M2 feel gate |
| M2-02 | Death/repair/recovery behavior | Planned | D04 and gameplay tests; device interruption behavior follows D06 |
| M3-01 | XP-to-50, gear instances, mastery and acquisition | Planned | D03/D05; migration and balancing tests |
| M3-02 | Versioned saves and pause/suspend/resume | Planned | D06; fixture migration + real-device kill/relaunch |
| M3-03 | Locale keys and collection-log completion | Planned | Key/acquisition coverage, counts, UI and save persistence |
| M3-04 | Act I vertical slice | Planned | Free progression route, onboarding, 45-minute stranger playtest |
| M4+ | Remaining regions, housing, dungeons and endgame | Planned | Earlier gates plus D01/D07; preserve GDD scope |

No later task is implicitly authorized by this queue. Select work matching the
user's current request and milestone. Update ownership when a task is started.

## Existing implementation versus target

| Area | Observed baseline | Required migration |
|---|---|---|
| Engine | Unity 6000.5.8f1; URP 17.5.0; Input 1.20.0 | Preserve versions; verify actual Editor connection |
| Core | `noEngineReferences: true`, RNG/math/pathfinding/system tests | Keep boundary; pure Core compilation is not proof of server readiness |
| Movement | `OpenWorldPlayerController` writes transforms and Core positions | M1 command-authoritative bridge |
| World | Legacy procedural grid and bootstrap | Authored region scenes; isolate M0 proof |
| Content | Existing JSON is mostly old-game content | Hand-author Alderfell data when each system/milestone is ready |
| Time/save | `SaveVersion = "2.2.0"`, epoch timers and legacy offline behavior | Explicit new schema and migration policy before M3 |
| Collection log | `GameState.CollectionLog` HashSet exists | Counts, acquisition hooks, complete UI and persistence audit |
| Progression | Inherited twelve skills and old XP/equipment design | Resolve D03/D05 before retuning |
| Assets | Files and importer scaffolding exist | No new art is certified by this preparation pass |
| Builds | Mobile workflow configured | Exact Unity build/device results still required |

## Validation record

- Baseline: `d32591a`, GitHub run `33646465136`: 396 tests, 379 passed,
  17 failed, all in `ContentValidatorTests`. Empty fixture tables failed in the
  loader before validator checks ran.
- Preparation fix: `740a7761ac19942578ac682cfd547909e6ae121b`,
  [Core run 33653573403](https://github.com/OfficialSyntaxx/isorpg/actions/runs/33653573403):
  **411 tests passed, 0 failed**, standalone build succeeded. This covers Core and
  actual JSON; it does not certify Unity scenes or player builds.
- Export retirement: direct execution returns 1 with the retirement message;
  SHA-256 snapshots confirm all 13 content JSON files unchanged. No full legacy
  npm test run was needed or performed.
- Documentation: active Markdown file links resolve, all three repository skills
  pass `quick_validate.py`, and `git diff --check` passes.
- Local container: .NET CLI could not start (`Process.GetStat` environment error).
  Branch GitHub Actions is the executable C# validation source for this session.
- Unity compilation, Play Mode, Blender, native builds and phone performance:
  **not run** in this preparation session. No claim of visual or release readiness.

## M0 session — 2026-09-02

- Branch: `codex/m0-shorelands-foundation`, based on `c370e61`.
- Palette source download matches the existing Kenney LFS SHA-256. Five source
  samples and tuned HSV families are recorded; generated atlas is 256×160 RGB.
- `python3 tools/build_shorelands_palette.py --check`: passes locally; CI now
  checks the generated PNG and review SVG alongside Core tests.
- Source-pixel comparison, PNG decoding, band orientation and metadata/GUID
  checks pass. These are asset-data checks, not Unity import or visual acceptance.
- M0-02 is next; P04 still blocks connected scene work. Shader, Editor, phone
  and Blender checks have not run. Measured hands-on region authoring hours
  have not begun; do not substitute elapsed agent runtime for authoring effort.

- M0 palette checkpoint `0de647029393360d1d08c014002cdf78eda859c2`: [CI run
  33661510739](https://github.com/OfficialSyntaxx/isorpg/actions/runs/33661510739)
  passed the generated-atlas check and **411/411 Core tests**. Unity import and
  lit-scene review remain pending.

## M0 connected-session return — 2026-09-02

- The mandatory Unity probe reached the installed CoplayDev bridge, but the two
  running Editors were for `/Users/syntaxx/isoRpg` and
  `/private/tmp/isorpg_work`, not this branch checkout at
  `/Users/syntaxx/isorpg-m0/unity`. The session stopped at the wrong-project
  condition before Console, asset import, Play Mode, or Blender work.
- M0-01 remains In review; M0-02 and M0-03 remain Planned. No project assets,
  scenes, shaders, settings, or save data were changed. Full return evidence is
  in `docs/M0_REMOTE_RETURN.md`.
- The session's read-only `python3 tools/build_shorelands_palette.py --check`
  returned `Stale output: unity/Assets/Isoperia/Art/Textures/shorelands_atlas.png;
  run tools/build_shorelands_palette.py`. The tracked 256×160 PNG was left
  untouched; reconcile and re-check it in the intended checkout before treating
  the prior generated-atlas evidence as current.

## Originating-chat review of the blocked return

- Reviewed `e292ec1` and [CI run 33663010899](https://github.com/OfficialSyntaxx/isorpg/actions/runs/33663010899): success.
  The wrong-project stop is accepted; M0 implementation states remain unchanged.
- Added a precise recovery sequence to `M0_REMOTE_SESSION.md`. The connected
  session must open/select `/Users/syntaxx/isorpg-m0/unity` before resuming.
- Replaced compressor-selected level-zero PNG block splitting with explicit
  stored DEFLATE blocks. Local boundary checks and an independent PNG decoder
  confirm valid output and byte-identical decoded pixels. No GUID/UV changes.
- Added macOS and Linux atlas checks in CI. This removes one portability weakness;
  the first session supplied no hashes/bytes proving the exact mismatch cause.
  Re-check the fetched branch on the Mac; collect the documented diagnostics if
  it still fails. No Unity/Blender authoring or validation occurred in this review.

## Review of partial checkpoint a751c69

- [CI run 33666175031](https://github.com/OfficialSyntaxx/isorpg/actions/runs/33666175031) passed. No Unity execution occurred in this review.
- The scene blob has `m_Roots: []` and no GameObject records; prior hierarchy
  claims describe Editor observations, not reproducible committed scene content.
- Repair scope and evidence are in `M0_CHECKPOINT_REPAIR.md`. M0-04 remains blocked
  by the unfinished checkpoint. Preserve partial assets and prior return evidence.

## Review of published repair f5d925a

- Final SHA `f5d925abddd71f34b9ea8c54d075872a8d009195`, implementation `3913cf1`;
  [CI run 33675890206](https://github.com/OfficialSyntaxx/isorpg/actions/runs/33675890206) passed.
- Saved scene and Terrain Physics dependency confirmed in repository. Remote report
  records one clean M0 startup/collider check; no traversal/captures/device proof.
- Wired existing player/camera references in M0 bootstrap (two scene fields only).
  Static fileID/type/ownership checks pass; Editor reimport/Play Mode still required.
- `WorldRuntime` now initializes on sceneLoaded, later than Bootstrap SaveDriver
  Awake. Legacy compatibility remains unverified and likely regressed; prioritize
  controlled reproduction and correction before accepting the isolation change.
- Current bounded next task: `M0_VALIDATION_SESSION.md`; no M0-04 authorization.

## Review of b4d416d — connection recovery required

- Published final `b4d416d6f97cb16ebd94203d5d761ab676083e2f`, implementation
  `9fc7d6b`; [CI run 33676973783](https://github.com/OfficialSyntaxx/isorpg/actions/runs/33676973783)
  passed. Source restores BeforeSceneLoad initialization; fresh Unity regression
  evidence is still absent because the exact Editor bridge timed out on reimport.
- Rig references persisted. Do not recreate the scene or repeat that wiring.
- M0 exclusion currently returns false outside UNITY_EDITOR. Player-build isolation
  is unimplemented; phone acceptance cannot use the Editor result as a substitute.
- Recover/diagnose the existing bridge first using `M0_VALIDATION_SESSION.md`, then
  finish startup validation/build-safe isolation, controls, materials and captures.
  M0-02/M0-03 remain In review. No new Unity runtime change or validation is claimed
  by this originating-chat review, and M0-04 remains outside the current scope.

## Review of 6baaf7f — build-safe path committed

- `6baaf7f5b73e9563e337ebdc9e501fe97e1845e2` adds the scoped Editor menu build
  helper and `ISOPERIA_M0_INSPECTION` define. It builds only `ShorelandsM0` and
  leaves normal Bootstrap initialization unchanged. The define is explicit and
  absent from ordinary player builds.
- The remote session persisted player/camera references and CharacterController,
  reopened the six-root scene, and recorded clean M0 Play Mode with no world/save
  services and zero project errors. Those observations remain Editor-only until
  the inspection player is built and run.
- M0-02/M0-03 remain In review. Touch controls, terrain/control-map visual proof,
  visible foam, GPU wind, route traversal, render statistics, captures, and device
  evidence remain open. M0-04 is not authorized by this checkpoint.
- Next bounded task is `M0_VALIDATION_SESSION.md`, beginning with a stable bridge
  probe and build/run of the scoped inspection player. Do not change gameplay
  systems or recreate the scene while these checks are pending.

## Review of 6b0ffb7 — inspection player isolation verified

- Final SHA `6b0ffb7580c9a9b6e206ed969f71ccfa8d7d9b9f`; [CI run
  33682290635](https://github.com/OfficialSyntaxx/isorpg/actions/runs/33682290635)
  passed Core tests and macOS/Linux palette checks.
- The scoped macOS player recorded `world=False save=False motor=True
  controller=True orbit=True collider=True` on Metal/PhysX with no project errors.
  The helper is Editor-only and runtime sources contain no `UnityEditor` references.
- M0-02/M0-03 remain In review: touch controls, terrain/foam/wind visual proof,
  full traversal, statistics, labelled captures and phone validation are not run.
  M0-04 remains blocked; generated build/test artifacts remain excluded.

## Input review correction — pending remote validation

- Static review found the M0 joystick canvas incorrectly used `DontDestroyOnLoad`
  despite being scene-local, and the pinch calculation counted the look finger as
  its own comparison point. The focused fix keeps the canvas owned by M0 and
  measures the two non-movement touch positions. Rebuild/player validation,
  scene-exit cleanup and pinch-direction checks remain required.
- No visual, traversal, statistics or device evidence is added by this correction.

## Input lifecycle and depth-texture correction — 2026-09-03

- Two M0 Play Mode entries had exactly one scene-local joystick each and no persistent canvas; desktop axes remained available. Pinch distance tracking is corrected in source, but MCP cannot provide a real multi-touch gesture.
- `IsoperiaURP.asset` now explicitly enables the camera depth texture required by ShorelandsWater. The scene still has zero TerrainLayers/control maps and no wind renderer, so M0-02 remains In review and visual proof is not accepted.
- Rebuilt inspection player passed on macOS Metal/PhysX. Bootstrap assertions reproduce inside Unity BuildPlayer after an uncompiled-code warning; the build artifact succeeds but the clean Editor Console gate remains unresolved.

## TerrainLayer and wind-test validation — 2026-09-03

- M0 TerrainData now has five atlas-backed TerrainLayers and two alpha-control textures; Terrain and TerrainCollider retain the same TerrainData. Explicit URP Terrain/Lit material fixed the magenta implicit fallback, and lit Play Mode shows distinct authored terrain regions.
- A 54-vertex scene-local `M0 Wind Test` uses the existing ShorelandsWind material/shader and visibly changes across time-separated Editor captures. This is shader proof only, not M0-04 scatter admission.
- Water renders at the real low-corner shoreline, but visible foam, labelled captures, route/statistics and device validation remain in review.

## Control-map revalidation — 2026-09-03

- All five M0 TerrainLayer indices (sand, timber, grass, sea, slate) are now represented in the saved two-alpha-texture control map and verified in lit Editor Play Mode. This remains Editor evidence only.
- Shoreline foam is still not discernible in the actual-edge capture; M0-02/M0-03 are not complete. Bootstrap BuildPipeline assertions remain an unresolved Unity Editor condition.

### Foam diagnostic retry (2026-09-03)

- A `_FoamTint` material control was added while retaining scene-depth foam computation and excluding reflections/SSR. The actual-edge Play Mode capture still lacks discernible foam, so the M0 visual acceptance gate remains failed rather than inferred from shader compilation.

### Depth-path inspection retry (2026-09-03)

- Terrain sampling proves the water plane intersects terrain at the inspected edge. The URP depth-helper experiment rendered the water magenta and was reverted; the remaining issue is unresolved transparent-water/depth behavior. M0 remains PARTIAL.

### M0 shoreline ribbon proof (2026-09-03)

- A scene-local 8-triangle foam ribbon follows the measured shoreline and visibly renders in Play Mode. Its `_Time` animation is GPU vertex work only; no SSR/reflections or CPU mesh mutation were added. This closes the visual foam-band proof only, not remaining route/device acceptance.
