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
