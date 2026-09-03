# M0 controls and visual-validation session

Continue on `codex/m0-shorelands-foundation`; stop before M0-04. Read AGENTS,
the GDD, WORKFLOW and HANDOFF. Use the project-identity/reconnect safeguards in
`M0_REMOTE_SESSION.md`. This sequence supersedes the earlier empty-scene repair
sequence; preserve the reconstructed scene and existing GUIDs.

## Input lifecycle correction pending validation

Static review found two focused issues in the inspection controls: the generated
joystick canvas was marked `DontDestroyOnLoad` despite being scene-local, and pinch
measurement included the look finger itself. The correction keeps the canvas owned
by M0 and compares the two non-movement fingers only. Rebuild/re-run the scoped
player and verify scene exit leaves no canvas or duplicate joystick, while
two-finger pinch changes zoom in the expected direction. This is not phone evidence.

## Current resume point — b4d416d

Implementation `9fc7d6b` restored BeforeSceneLoad world creation. Final commit
`b4d416d6f97cb16ebd94203d5d761ab676083e2f` is published;
[CI run 33676973783](https://github.com/OfficialSyntaxx/isorpg/actions/runs/33676973783)
passed. The rig references persisted in the correct Editor. Reimport then caused
repeated MCP timeouts, so fresh compilation/Play Mode and legacy regression results
are not established. Do not repeat the already-completed scene recreation or wiring.

**First task: diagnose and recover the existing bridge, without gameplay edits.**

1. Use local process/project and Editor log evidence to distinguish active import,
   compile errors, an approval/dialog stall, a stopped Editor, and a stale MCP port
   or instance ID. Record the latest relevant log tail and exact failing tool/error;
   do not include credentials or unrelated personal log content.
2. If importing, allow it to complete and check progress in the log instead of
   repeatedly issuing authoring calls. Preserve unsaved work. Do not kill the
   Editor, clear Library, reinstall the bridge, or change packages as a workaround.
3. Once the Editor is responsive, restart/reconnect its existing CoplayDev bridge
   if needed, rediscover instances, and select the exact M0 checkout. Respect any
   local client-approval prompt. Never fall back to the unrelated Editor.
4. Require successful read-only project/scene and Console probes, followed by
   another successful probe after an import/refresh cycle completes. Only then
   resume source/scene work. If a controlled bridge reconnect still times out,
   stop and return a connection-only diagnosis: process/import status, project,
   bridge endpoint/instance (no secrets), last successful probe, failed tool,
   relevant log error and the single required human action if tools cannot do it.
   Do not produce another implementation checkpoint just to retry a disconnected
   Editor. If a modal or approval needs the user, name that specific action.

**Then validate the startup repair and close its player-build limitation.**
`M0InspectionStartup.IsInspectionPlayModeStart()` currently checks an Editor scene
under `UNITY_EDITOR` and returns false in a player. Thus M0 player startup would
still create WorldRuntime. The comment calling M0 editor-only does not change the
GDD's phone-validation requirement. Treat this as an Editor workaround until an
explicit, build-safe inspection startup mechanism preserves both normal Bootstrap
Awake ordering and M0 isolation. Do not infer safety from Editor-only tests or
ship an M0 phone build with the current exclusion. Keep normal build configuration
unchanged; any inspection build must be explicitly scoped and reproducible.

Use disposable save storage for legacy checks. Verify fresh/repeated M0 entry,
normal Bootstrap startup, domain-reload behavior and the actual play-start scene
(including Editor play-mode start-scene overrides if configured). Then proceed
through controls, materials, traversal and captures below. These remain active
implementation tasks; they are not completed features waiting only for screenshots.

## Earlier review context (historical)

## Reviewed baseline

`f5d925abddd71f34b9ea8c54d075872a8d009195` contains implementation `3913cf1`.
[CI run 33675890206](https://github.com/OfficialSyntaxx/isorpg/actions/runs/33675890206)
passed. Repository review confirms six persistent scene roots, direct Terrain
Physics dependency, source guards on legacy auto-creators, and removal of the
namespace-wide destruction loop. The connected report records one clean Play
Mode entry with no legacy world/save behaviours and a surviving TerrainCollider.
Those observations do not establish traversal, mobile controls or visual quality.

Two findings remain before visual acceptance:

- The committed M0 bootstrap player/camera fields were null. The originating
  review wires them to existing Transform `509399182` and Camera `1324392517`;
  no objects/GUIDs were regenerated. Verify these assignments after import and
  confirm the motor and orbit components attach when entering Play Mode.
- `WorldRuntime.CreateRuntime` now waits for `SceneManager.sceneLoaded`, but
  Bootstrap contains `SaveDriver`, whose Awake dereferences `WorldRuntime.Instance.Grid`.
  Unity invokes sceneLoaded after Awake/OnEnable. On a fresh legacy start, this
  creates a likely null-instance regression. The implementation must not claim
  legacy startup is unchanged without checking it. The one-shot event subscription
  also needs review for scene transitions and Play Mode reload settings.
  See [Unity's event lifecycle](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/SceneManagement.SceneManager-sceneLoaded.html).

## Execute in this order

1. **Recheck project and fix legacy initialization ordering.** Select the Editor
   for `/Users/syntaxx/isorpg-m0/unity`, Unity 6000.5.8f1. Preserve dirty work.
   Reproduce fresh Bootstrap startup only with disposable save storage, then fix
   the smallest initialization boundary so shared WorldRuntime exists before its
   consumers without creating it in M0. Do not restore post-start culling or hide
   the failure with null checks that skip gameplay initialization. Cover scene
   Awake consumers as well as runtime callbacks. Define whether mixed/additive
   legacy/M0 scene loading is supported; if not, reject it explicitly. Check
   repeated Play Mode entry with domain reload enabled and disabled, and normal
   scene reload. Use a focused Unity regression test where practical. No real-save
   modification; no M1 architecture migration.

2. **Verify rig wiring and finish inspection controls.** Confirm assigned player
   and camera fields persist after saving/reopening. Add Input System touch
   joystick movement and touch orbit/zoom while keeping desktop bindings. Handle
   simultaneous movement/look fingers, UI ownership, release/cancel, pause and
   focus loss without stuck movement. Camera-relative movement should follow the
   visible controls. Match GDD camera defaults and zoom; exclude the player's own
   collider from camera collision and test smoothing near walls. Verify spawn is
   above the terrain, collider alignment/gravity, slopes and shoreline boundaries.
   No gameplay authority, saving or UI beyond inspection controls.

3. **Finish and demonstrate M0-02.** The existing mesh COLOR shader is not a
   completed Terrain control mapping or general atlas-UV mesh material. Implement
   both required usages, including all intended atlas bands. Verify actual Terrain
   in Play Mode with a lit palette-blend example. Test anchored GPU wind on a small
   temporary test mesh, and depth-based foam against the actual shoreline. Confirm
   depth-texture availability and target API behavior. Preserve separate appropriate
   material families; do not infer batching from an atlas. No M0-04 asset admission.

4. **Complete the greybox route and capture evidence.** Six roots alone do not
   establish the route/reveals. Add missing grey placeholders for beach/wreck,
   switchback reveal and clifftop/inland landmark, without dressing the region.
   Measure at least 15m relief, walk the entire route with collision, and record
   camera behavior. Save/reopen the scene and verify committed reference integrity.
   Capture three labelled greybox viewpoints plus wind/foam/control evidence.
   Record actual render statistics with scene, resolution, graphics API and SHA;
   do not call Editor frame rates phone performance. Test touch on a connected
   phone if available; otherwise distinguish simulated touch from device proof.

## Completion and return

Run palette `--check`, relevant Unity compile/tests/Play Mode checks and pushed-SHA
CI. Preserve the previous return report in `docs/archive/` before updating it;
include the complete report, not just a pointer. Record exact implementation SHA,
final remote HEAD, scene reopen/wiring evidence, startup/save-isolation regression
results, captures, statistics, input devices and remaining limitations. Verify
the normal push reached GitHub and link its CI run. Update status and HANDOFF.

If a required capability fails, return PARTIAL/BLOCKED with the precise remaining
check. Do not stop merely because sources compile; continue through this bounded
checkpoint when the Editor is available. Do not mark M0-02/M0-03 Verified without
their evidence, and do not begin M0-04. Return the report here for review.
