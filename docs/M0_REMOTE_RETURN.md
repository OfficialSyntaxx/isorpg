# M0 checkpoint-repair return

## Follow-up validation (2026-09-02)

- Result: PARTIAL — startup isolation and scoped player paths are now evidenced; visual proof, full traversal, labelled captures, statistics and real-device validation remain open. Stopped before M0-04.
- Unity / MCP: `/Users/syntaxx/isorpg-m0/unity`, Unity `6000.5.8f1`, sole selected CoplayDev instance `unity@931634bd`. Active M0 scene was clean and saved with six roots.
- Startup isolation: rebuilt scoped inspection player launched on macOS Metal/PhysX at 1920×1080. Fresh Player.log: `M0_INSPECTION_PLAYER world=False save=False motor=True controller=True orbit=True touch=True collider=True`; no player errors/exceptions were present.
- Normal Bootstrap regression: a separate macOS validation player used `ISOPERIA_BOOTSTRAP_VALIDATION` plus `ISOPERIA_DISPOSABLE_SAVE`. Fresh Player.log: `[Isoperia] save loaded from: Fresh` and `M0_BOOTSTRAP_VALIDATION world=True save=True disposableStore=True`. Its FileSaveStore root is under `Application.temporaryCachePath`; no real save was read or written.
- Touch controls: M0-only Input System component creates an inspection joystick and handles independent movement/look ownership, release/focus/pause reset, pinch zoom, desktop input preservation and player-collider exclusion in camera collision. Editor Play Mode found touch and joystick attached. This is not phone interaction evidence.
- Rendering/traversal/device: NOT RUN to acceptance. Terrain control blend, mesh atlas bands, visible foam/wind, full route, statistics, three labelled captures and target Android validation remain unclaimed. Authoring hours: NOT RECORDED.
- Console: no C# compile errors after refresh. Unity emitted four unstacked internal `Assertion failed on expression: 'false'` messages during the Bootstrap player build and MCP port-reload warnings; neither appeared in fresh Player logs. Diagnose before a clean-Console claim.
- Checks: palette `--check` and `git diff --check` passed. Local `dotnet` is unavailable (`command not found`), so Core tests require CI after push.
- Exact next task: diagnose Bootstrap-build assertions, then complete actual lit terrain/atlas/wind/foam, route/camera proof, captures/statistics and target-class Android evidence. Keep M0-04 blocked.

- Result: PARTIAL — repair blockers are closed, but M0-02/M0-03 acceptance remains open pending visual traversal/captures and mobile-input implementation. Stopped before M0-04.
- Final pushed SHA: `6b0ffb7580c9a9b6e206ed969f71ccfa8d7d9b9f`.
- Final CI: [run 33682290635](https://github.com/OfficialSyntaxx/isorpg/actions/runs/33682290635) passed Core tests and both palette portability jobs.
- Implementation commit: `3913cf16773f0190ee0ea39d57d20f11ebe0f67a`.
- Branch / Unity: `codex/m0-shorelands-foundation`; `/Users/syntaxx/isorpg-m0/unity`; Unity `6000.5.8f1`; explicitly selected MCP instance `unity@931634bd`.
- Persistence: the previous Editor cache could not be recovered safely (the actual active scene was `SampleScene`, while the committed M0 scene had `m_Roots: []`). Recreated in Edit Mode, explicitly saved and reopened `Assets/Isoperia/Scenes/ShorelandsM0.unity`. Reopen proof: `roots=6`, with `Shorelands Terrain`, `Shorelands Water`, `Inspection Player`, `Inspection Camera`, `Sun`, and `M0 Inspection Mode`; Terrain, TerrainCollider, and bootstrap all present. On-disk YAML contains those roots and references.
- Isolation repair: removed namespace-wide/deferred destruction from `M0InspectionBootstrap`. Added `M0InspectionStartup`; gated every legacy AfterSceneLoad auto-creator and made `WorldRuntime` defer creation until scene-loaded identity is known. `WorldOwnedAssetLibraryView` is already a no-op. This keeps non-M0 Bootstrap startup unchanged while preventing M0 legacy world/HUD/player/camera/save creation at source.
- Play Mode evidence: controlled entry showed `scene=Assets/Isoperia/Scenes/ShorelandsM0.unity roots=6 world=False save=False legacy=0 collider=True`. This establishes the actual hierarchy immediately after startup without touching a real save. Play Mode then exited cleanly.
- Package/collision: added direct built-in `com.unity.modules.terrainphysics` `1.0.0`; Unity regenerated the lock entry with Physics and Terrain dependencies. The TerrainCollider remained assigned to the authored TerrainData in Play Mode.
- Rendering: water now passes vertex-derived view eye depth to the fragment, rather than treating fragment `SV_POSITION` as original clip position. Console after compile/Play contained no project errors; only MCP bridge port-reload warnings. Terrain atlas/control-map visual proof, shoreline foam visibility, GPU wind proof, and touch joystick/camera controls are still open.
- Validation: `git diff --check` passed. `python3 tools/build_shorelands_palette.py --check` was previously green at `c6075f97cf21ef97416002c164191d303500acfc`; `dotnet` is unavailable locally. CI reference: https://github.com/OfficialSyntaxx/isorpg/actions/runs/33666175031 (Core/palette only; not Unity proof).
- Captures/traversal/device: NOT RUN after repair. Required next task: perform camera-collision route traversal, labelled captures, visual material/foam/wind checks, and Input System mobile controls in this exact Editor; do not start M0-04.

## Validation-session update (2026-09-02)

- Result: PARTIAL. Latest implementation commit: `9fc7d6b54ff7c06265226f03846e6ac0c771b0c5`.
- The validation runbook found the old `WorldRuntime` sceneLoaded deferral unsafe: Bootstrap `SaveDriver.Awake` consumes `WorldRuntime.Instance.Grid` before `sceneLoaded`. The repair restores normal `BeforeSceneLoad` construction and uses an explicit editor-only M0 play-start predicate to suppress it only for the isolated inspection scene. This preserves legacy Awake ordering without restoring post-start culling.
- Correct Editor identity was reverified: `/Users/syntaxx/isorpg-m0/unity`, Unity `6000.5.8f1`, MCP `unity@931634bd`; M0 had six saved roots and the serialized player/camera bootstrap references persisted (`509399182`, `1324392517`).
- Palette check passed. Unity began the import/recompile, but the correct Editor's MCP bridge timed out repeatedly before it could return Console/Play Mode state. No other Unity instance was used. Therefore fresh M0 rig attachment, normal Bootstrap disposable-save regression, touch controls, traversal, Terrain/control-map/wind/foam proof, render statistics, and captures remain NOT RUN. No real save storage was accessed.
- Remote branch was pushed normally and verified at `9fc7d6b54ff7c06265226f03846e6ac0c771b0c5`. Stop before M0-04. Resume by reconnecting the exact Editor after its import/bridge recovery and continue at fresh controlled Play Mode validation.

## Scoped inspection-player validation update

- A dedicated macOS inspection player was built from only `ShorelandsM0.unity` with the explicit `ISOPERIA_M0_INSPECTION` define. Its `Player.log` recorded: `M0_INSPECTION_PLAYER world=False save=False motor=True controller=True orbit=True collider=True`.
- This is player evidence for M0 startup isolation and rig/collider attachment. The player launched on Metal with PhysX and its new log section contained no project errors or exceptions.
- The build helper is Editor-only and the runtime source has no `UnityEditor` references. Normal Bootstrap/disposable-save regression, touch interaction, terrain palette/foam/wind visuals, full-route traversal, render statistics, labelled captures, and phone validation remain NOT RUN. M0-04 remains blocked.
