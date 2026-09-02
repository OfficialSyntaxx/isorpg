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
| M0-03 | Isolated Shorelands scene and greybox | Blocked | Review of `a751c69`: committed scene has no roots/objects. Recover and save hierarchy, replace namespace culling with startup prevention, restore Terrain collision; see `M0_CHECKPOINT_REPAIR.md`. |
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
