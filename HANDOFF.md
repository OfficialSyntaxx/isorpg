# Alderfell — current handoff

**Current work:** M0-01 palette foundation implemented; Unity visual review pending.
**Branch:** `codex/m0-shorelands-foundation`.
**Production milestone:** M0 — Shorelands palette started; beauty-proof scene not yet built.

## Read first

1. `docs/GDD_ALDERFELL.md` — design authority; Start here, §1, §16 and §36.
2. `docs/WORKFLOW.md` — delivery, validation and evidence rules.
3. `docs/IMPLEMENTATION_STATUS.md` — task state, dependencies and checked results.

`AGENTS.md` and `CLAUDE.md` route both agents to the same documents. Earlier
isometric/WebGL/settlement plans are historical. The original handoff and debugging
lessons are preserved in `docs/archive/HANDOFF_ISOPERIA_2026-08-24.md`; its old
branch, deployment and exporter instructions must not be used as current work.

## Preparation changes

- Repair validator fixtures without weakening the loader's nonempty-table guard.
- Validate actual authored content in CI, not only synthetic fixtures; extend
  reference/shape/quantity checks and retain regression evidence.
- Retire the TypeScript exporter write path and remove it from legacy npm tests.
- Use the standalone .NET test project, select the 8.0 SDK, preserve test artifacts,
  and commit metadata for the new Unity scripts.
- Align GDD ambiguities and track remaining decisions by blocking milestone.

Core code commit `740a776` passed **411/411 tests** in GitHub run `33653573403`.
The exporter safely refuses writes, and documentation/skill checks pass.
See the status board for evidence; a configured Unity workflow is not a passed build. No Unity scene, imported model or gameplay migration is certified here.

## Next work

Latest local validation adds scoped Bootstrap disposable-save evidence and scene-local Input System touch wiring (not yet pushed). The M0 player logs `world=False save=False motor=True controller=True orbit=True touch=True collider=True`; the normal Bootstrap validation logs `world=True save=True disposableStore=True`. Four unstacked Unity internal assertion messages appeared during the Bootstrap build, so do not claim a clean Console until they are diagnosed. Visual terrain/foam/wind proof, full traversal, captures/statistics and device evidence remain open; M0-04 stays blocked.

Latest player validation is published at `6b0ffb7`; CI `33682290635` passed. The
scoped macOS player confirmed world/save isolation, rig/collider attachment and
zero project errors. Continue with visual, traversal, touch and capture evidence;
the player build alone does not complete M0. Stop before M0-04.

Static input review added a pending correction: the scene-local joystick no longer
persists across scene exit, and pinch zoom now compares the two non-movement
fingers. Rebuild/re-run the scoped player and verify no duplicate canvas after
re-entry before collecting the remaining M0 evidence.

At `5c60102`, two M0 Play Mode entries each had exactly one joystick and no persistent canvas; desktop axes remained available. MCP cannot inject a genuine multi-touch gesture, so pinch proof remains device work. URP depth texture is now enabled explicitly for ShorelandsWater, but this scene has zero TerrainLayers/control maps and no wind renderer. Bootstrap assertions reproduce in Unity BuildPlayer after its uncompiled-code warning even though the Bee build succeeds. M0-04 remains blocked.

Follow-up terrain work added five atlas-backed TerrainLayers/two alpha-control maps to the existing M0 TerrainData and a minimal scene-local `M0 Wind Test` under the existing M0 root. Explicit URP Terrain/Lit fixed a magenta implicit TerrainLit fallback; lit Play Mode now shows terrain regions and GPU wind movement. Water is visible at the real shoreline but foam is still not visibly proven. Captures remain unstaged and unlabelled; route, stats and device validation remain open. M0-04 stays blocked.

The control map now paints all five indices (sand, timber, grass, sea, slate), verified in lit Play Mode with the shared TerrainCollider data. The low-corner shoreline capture still has no discernible foam despite depth texture use, so M0 visual proof is not accepted. The four BuildPipeline assertions remain an unresolved Editor external-change condition; do not claim a clean Console. Resume with actual foam proof, route/camera traversal, labelled captures, Editor statistics clearly labelled as such, and target Android validation. M0-04 stays blocked.

The material-controlled foam-tint retry also failed to make foam discernible at the actual water edge. It preserves scene-depth handling and adds neither SSR nor reflections; investigate depth sampling/opaque-depth participation before further presentation work. M0 remains PARTIAL and M0-04 stays blocked.

Depth inspection verifies the terrain genuinely crosses the 1.8 m water plane around z=15--20 m. A URP depth-helper experiment produced magenta water and was reverted, so do not treat it as a repair. Resume by diagnosing transparent-water scene-depth availability; retain the existing BuildPipeline assertion evidence. M0-04 stays blocked.

An M0-local GPU shoreline foam ribbon now supplies successful actual-edge visual proof where transparent depth was unreliable. It is a static 8-triangle mesh under the existing M0 root, with `_Time` vertex animation and no reflections/SSR or CPU deformation. Route/camera proof, three labelled reveals, percentiles/device validation and authoring hours remain open; M0-04 stays blocked.

**Latest checkpoint: `6baaf7f`**. The explicit `ISOPERIA_M0_INSPECTION` build
path is committed, and normal Bootstrap still creates `WorldRuntime` before
scene `Awake`. The remote Editor persisted and verified the six-root scene and
clean M0 Play Mode, but reimport restarted MCP before remaining evidence was
collected. Follow `docs/M0_VALIDATION_SESSION.md`: build/run the scoped
inspection player, then finish touch controls, visual proofs, traversal,
statistics and captures. Stop before M0-04.

**Latest resume point: `b4d416d`** — CI `33676973783` passed. Follow the
**Current resume point** in [`docs/M0_VALIDATION_SESSION.md`](docs/M0_VALIDATION_SESSION.md):
diagnose the existing MCP bridge during reimport, establish stable read-only
probes, then validate the startup fix. The M0 exclusion currently works only
under UNITY_EDITOR; a build-safe inspection path is required before phone tests.
Rig fields are already wired. No scene recreation or further blind source edits
while disconnected. Controls/materials/traversal/captures remain unfinished.

**Current checkpoint after `f5d925a`:** execute
[`docs/M0_VALIDATION_SESSION.md`](docs/M0_VALIDATION_SESSION.md). Six scene roots,
Terrain Physics and source-level guards are committed; CI run `33675890206` passed.
The originating review wired the null player/camera references. Validate legacy
startup ordering first, then finish controls, route, material proofs and captures.
This supersedes the earlier repair sequences below; stop before M0-04.

### Earlier checkpoint history (not the current task)

**Priority after partial checkpoint `a751c69`:** execute
[`docs/M0_CHECKPOINT_REPAIR.md`](docs/M0_CHECKPOINT_REPAIR.md) before continuing the
original M0 sequence. The committed scene has an empty root list despite the
reported Editor hierarchy. Recover/save the scene, replace after-start culling
with real startup isolation, restore Terrain collision, and complete rendering,
controls and evidence. CI passed; M0-02/M0-03 are not accepted as complete.

Recovery session: Unity 6000.5.8f1 was opened at the correct
`/Users/syntaxx/isorpg-m0/unity` checkout and the atlas check passed. M0-02/M0-03
now have a scoped checkpoint, but their Editor MCP instance disappeared after
Play Mode started (the bridge fell back from port 6400 to 6403). Read
`docs/M0_REMOTE_RETURN.md`; reconnect the exact project and complete runtime
isolation, render, traversal and capture checks before beginning any M0-04 work.

Resume via **Recovery from the first blocked session** in
[`docs/M0_REMOTE_SESSION.md`](docs/M0_REMOTE_SESSION.md). Open the intended
`/Users/syntaxx/isorpg-m0/unity` checkout, rediscover/select its MCP instance,
and re-run the read-only probes and atlas check. The first return's CI run
`33663010899` passed; its wrong-project stop was correct. The PNG generator now
fixes stored-block boundaries for portability without changing any pixels.
macOS/Linux CI checks were added; the original Mac mismatch still needs the
updated-checkout recheck. Preserve the original return report as evidence.

The 2026-09-02 connected-session attempt stopped before M0 work because the
reachable Unity Editors belonged to `/Users/syntaxx/isoRpg` and
`/private/tmp/isorpg_work`, not this checkout's `unity/` directory. No Unity
assets or scenes were changed. Read `docs/M0_REMOTE_RETURN.md`, then open
`<this-checkout>/unity` in Unity 6000.5.8f1 and select that instance in the
CoplayDev bridge before resuming.

For a connected Unity/Blender session, execute
[`docs/M0_REMOTE_SESSION.md`](docs/M0_REMOTE_SESSION.md). It defines the startup
probes, M0-01 review, M0-02 shaders, M0-03 isolated greybox, validation and return
report. Stop before M0-04 and return the branch/SHA/evidence to the originating
chat. This handoff is prepared; no external session has been launched here.

Review **M0-01** in `docs/M0_SHORELANDS_ART.md`, then begin **M0-02: atlas shaders**.
The five-family atlas, editable JSON, generator and UV guide are committed.
Checkpoint `0de6470` passed the palette consistency check and **411/411 Core tests**
in [CI run 33661510739](https://github.com/OfficialSyntaxx/isorpg/actions/runs/33661510739).
Run `python3 tools/build_shorelands_palette.py --check`; do not paint over its generated PNG.
Before scene authoring, connect Unity/Blender to this checkout and verify project
identity and dirty state. Then create the isolated inspection scene and greybox
specified by GDD §36. Do not let the old runtime bootstrap populate the proof.

The inspection rig may move a camera or preview character locally; it does not
save state or establish M1 command ownership. No combat, inventory, enemies,
quests or persistence belongs in M0.

## Known boundaries

- Core must retain `noEngineReferences: true`; presentation never becomes new
  gameplay authority. The old controller's direct writes are tracked M1 debt.
- JSON in `unity/Assets/Isoperia/Resources/Content/` is authored source.
- Use `dotnet test ci/CoreTests/CoreTests.csproj` from repository root.
- Only branch CI has been executed for C# validation here. Editor, native builds,
  asset payloads and target-phone performance need their own evidence.
- No main merge or PR is requested. Main builds artifacts; the retired web
  deployment workflows are not the release process.
- Leave incidental LFS changes and legacy assets untouched. Preserve GUIDs.
