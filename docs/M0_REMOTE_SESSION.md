# M0 connected-session handoff

Status: ready to start; no remote session has been launched from this chat.
Repository: `OfficialSyntaxx/isorpg`. Branch: `codex/m0-shorelands-foundation`.
Prepared 2026-09-02. Baseline: `2309e3505d2c0e8a4261cfa9a67dcfbb363ddf86`;
fetch the latest branch including this handoff before work. Do not reset to the baseline.

## Mission and authority

Complete the first connected M0 checkpoint: review M0-01, implement and verify
M0-02, then build and verify the isolated M0-03 greybox. Stop there and hand the
results back to the originating chat. This is not authorization to finish all
of M0 or begin M1.

Read `../AGENTS.md`, `../CLAUDE.md`, `GDD_ALDERFELL.md` (Start here, §§3.2, 6,
16, 18–19, 23.1, 36), `WORKFLOW.md`, `IMPLEMENTATION_STATUS.md`,
`M0_SHORELANDS_ART.md`, and `.claude/skills/build-region/SKILL.md` from the repo
root. Read the import-asset procedure for any asset admission. The GDD remains
game intent; this document bounds one execution session.

## 1. Verify the environment before editing

### Recovery from the first blocked session

The first return (`e292ec1`, `M0_REMOTE_RETURN.md`) reached Editors for
`/Users/syntaxx/isoRpg` and `/private/tmp/isorpg_work/unity`, not the intended
`/Users/syntaxx/isorpg-m0/unity`. Do not select either unrelated instance as a shortcut.

1. In `/Users/syntaxx/isorpg-m0`, inspect branch/worktree and fetch the latest
   `codex/m0-shorelands-foundation`; fast-forward only if clean. Preserve local work
   and resolve any branch divergence before opening the project.
2. Open **`/Users/syntaxx/isorpg-m0/unity`** with Unity Hub using **6000.5.8f1**.
   Existing Editors may remain open; do not discard unsaved work or terminate them.
   The connected agent may open the correct project if its tools permit; otherwise
   ask the user to do this single action.
3. Enable/start the already-installed CoplayDev bridge in that Editor. Re-discover
   instances and select the one reporting the exact project path. Do not reuse a
   cached instance ID. Canonicalize filesystem paths for comparison where needed;
   prove this is the same checkout, not merely the same repository name or version.
4. Perform the read-only probes below, then run the palette check on the fetched
   revision. The generator now uses explicitly encoded stored DEFLATE blocks;
   this removes dependence on the local zlib compressor's block splitting. PNG
   encoding changed, but decoded pixels, palette data, dimensions and GUID did not.
5. If the atlas still reports stale, **do not overwrite it to force a pass**.
   Return `git rev-parse HEAD`, `git status --short`, `python3 --version`, actual
   and freshly generated SHA-256 hashes (generate to memory or a temporary file),
   and `git check-attr filter text -- unity/Assets/Isoperia/Art/Textures/shorelands_atlas.png`.
   Inspect whether the checkout has PNG bytes or an LFS pointer. This distinguishes
   a stale checkout/modified file from generator drift. The first report did not
   contain enough byte-level evidence to establish which caused its mismatch.

Continue the original mission only after project identity and the atlas check pass.

- Fetch the branch, inspect HEAD and worktree, and preserve unrelated changes.
  Work on this branch; no force-push, PR, merge to main or deployment.
- Record the local absolute project path. The Unity project is `<checkout>/unity`,
  version **6000.5.8f1**, URP **17.5.0**. Match the running Editor to that checkout.
- The manifest already contains **CoplayDev Unity MCP**. Use that bridge; do not
  add another provider or upgrade packages as setup work.
- Probe Unity read-only: version/project path, active scene/hierarchy, Play Mode,
  dirty scenes/assets and Console. Installed packages alone are not connectivity.
- Probe Blender read-only: version, open file and unsaved state. Preserve its file.
  Blender is not needed for this shader/terrain checkpoint; if absent, record it
  and continue Unity work. Do not begin hero landforms in this session.
- Record connection results and claim ownership of M0-02/M0-03 in the status board.
  If another session owns them, coordinate before editing shared paths.
- If Unity cannot be probed, stop connected work and return the exact error and
  missing capability. Do not fabricate a scene or claim Editor validation. A cloud
  coding session without the Editor bridge is not a connected session.

## 2. Review M0-01 and implement M0-02

1. Run `python3 tools/build_shorelands_palette.py --check`. Inspect/import
   `Assets/Isoperia/Art/Textures/shorelands_atlas.png` using the documented UV
   contract. Verify 256×160, sRGB, clamp, bilinear, no mipmaps, no resizing or
   compression; inspect Android/iOS overrides. Preserve the texture GUID.
2. Create the world material and terrain shader against this atlas. Blend sampled
   colours, not V coordinates across bands. Demonstrate vertex-colour blending
   on a mesh and actual Unity Terrain compatibility; a mesh shader alone is not
   proof of Terrain support. If Terrain needs a different control representation,
   document the mapping while preserving GDD intent. Do not replace legacy materials.
3. Add GPU vertex wind with anchored roots; no per-frame CPU vertex deformation.
4. Add stylized animated water with shoreline foam. No SSR or reflections. Verify
   foam against the blockout shoreline, depth/occlusion and an above-water camera.
   Record any renderer dependency and avoid changing unrelated pipeline settings.
5. After each shader change, wait for import/compilation, inspect Console and test
   in a lit scene. Capture atlas shading, moving vegetation and shoreline foam.
   Check target graphics API variants where available; label desktop-only evidence.

M0-01 can become Verified only after import and lit-scene review. M0-02 needs
compile and render evidence, not just source files or green Core tests.

## 3. Build M0-03: isolated Shorelands greybox

- Create `Assets/Isoperia/Scenes/ShorelandsM0.unity` and scoped supporting assets.
  Preserve Bootstrap and existing scenes. Do not change default player builds.
- **Before entering Play Mode**, audit all `RuntimeInitializeOnLoadMethod` hooks,
  the `WorldRuntime` BeforeSceneLoad callback, `OpenWorldExperience`, legacy view
  auto-starts and `SaveDriver`. An empty scene alone does not isolate them.
  Implement the smallest explicit inspection-mode gate needed; preserve legacy
  startup outside the proof. Do not load, mutate or save the user's persistent
  game state. Broader command/offline/save migration remains M1–M3 work.
- Sculpt Unity Terrain with at least **15 m relief**, a walkable beach-to-clifftop
  switchback, tidepool/sea edge and grey placeholders framing the future wreck,
  cliff reveal and inland landmark. Terrain target is approximately 25k triangles;
  record actual rendering statistics rather than inferring them from resolution.
- Add only a scene-local inspection rig: movement plus camera at GDD §23.1
  defaults (6 m distance, 18° downward pitch, 3–9 m zoom, 60° vertical FOV,
  collision spring arm, follow smoothing 10/s, manual rotation without auto-turn).
  Touch joystick is the only permitted in-game UI. No gameplay state ownership.
- Verify the whole route is traversable, cliffs/water behave as intended for the
  proof, and camera collision works. Record any temporary traversal limits.
- Capture three labelled **greybox** viewpoints: beach/wreck approach, switchback
  reveal, clifftop/inland landmark. These are composition studies, not the final
  beauty-proof screenshots. No hero models, scatter admission or final dressing yet.

## 4. Checks and stop conditions

Check after every import/compile cycle and after each task, not only at session end.

| Check | Required evidence |
|---|---|
| Asset/scene import | Console baseline and new errors; no missing scripts, references or pink materials |
| Isolation | Fresh Play Mode hierarchy; no legacy world/HUD/save services; existing save data unchanged; repeat entry/exit |
| Legacy compatibility | Review gate default behavior; targeted test of the gate where practical, without running writes against real saves |
| Traversal | Complete beach-to-clifftop run and camera collision; screenshots/video with limitations |
| Repository | Palette `--check`, `dotnet test ci/CoreTests/CoreTests.csproj`, diff/GUID review; pushed-SHA CI result |
| Device | If available, device/build/settings and observations; otherwise explicitly not run |

Do not erase pre-existing Console failures to claim a clean baseline. Fix introduced
failures within scope; report unrelated failures with evidence. Stop early for a
wrong project, unsaved user work that would be overwritten, unsafe save isolation,
missing required capability, or a design decision outside the GDD. Preserve a
reviewable checkpoint and return a concrete blocker instead of guessing.

**Normal stop:** M0-01 reviewed, M0-02 and M0-03 verified as far as available tools
allow, changes pushed, return report complete. Do not proceed to M0-04 landforms,
scatter, final lighting/dressing, or M1. Do not label M0 complete: final art, phone
reveals, authoring cost and real target Android profiling are later gates.

## 5. Publish and return control

Commit only intended source/assets and their `.meta` files. Keep editable sources
and licensing records durable; verify new LFS payloads upload successfully. Fetch
remote HEAD before pushing and integrate advances without overwriting other work.
Run/check CI at the pushed SHA. Update `IMPLEMENTATION_STATUS.md` and `../HANDOFF.md`
with actual states, evidence and next work; do not mark unchecked work Verified.

Create `docs/M0_REMOTE_RETURN.md` with this report, then stop:

```markdown
# M0 connected-session return
- Result: READY FOR REVIEW / PARTIAL / BLOCKED
- Branch and implementation commit SHA:
- Final pushed SHA (report-only follow-up may be identified in the return message):
- Owner/session and date:
- Unity project path/version; Unity and Blender probe results:
- M0-01 / M0-02 / M0-03 states and acceptance evidence:
- Changed files and reasons (including any runtime isolation gate):
- Unity Console baseline/new errors; compile and Play Mode results:
- Save-isolation and legacy-compatibility evidence:
- CI URL, checked SHA, test totals and failures:
- Capture paths/links and the build/commit they depict:
- Device/OS/API/resolution/settings, or NOT RUN:
- Measured hands-on authoring time, or NOT RECORDED:
- Blockers, unverified assumptions and remaining work:
- Exact next task and required environment:
```

Attach or link captures in a durable location accessible to the originating chat.
Return the branch, final SHA and report URL to the user for posting back here.
Do not claim automatic cross-chat delivery unless that capability is actually
available. The originating chat will inspect the diff, CI and evidence, then
choose the next M0 checkpoint; an execution report alone does not close M0.
