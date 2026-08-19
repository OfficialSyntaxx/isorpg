# Editor lane — dispatch runbook

**For: an agent or person on a machine with Unity installed.** Everything else in
this migration has been done and verified without the Editor; this document is
the part that genuinely requires it.

**Goal:** a Unity 6 project at `unity/` that builds to WebGL, deploys, and
installs on a phone home screen as a fullscreen PWA.

**Repo:** `OfficialSyntaxx/isorpg`, branch `claude/unity-engine-migration-roadmap-fz9w8y`

**Time:** ~30 minutes, most of it Unity importing and building.

---

## What is already in the repo — do not recreate it

| Path | Contents |
|---|---|
| `unity/Packages/manifest.json` | package dependencies, pre-declared |
| `unity/.gitignore`, `unity/.gitattributes` | Unity ignores + Git LFS routing |
| `unity/Assets/Isoperia/Core/` | ported simulation core + 167 EditMode tests |
| `unity/Assets/Isoperia/Unity/` | `GameLoop`, `IsometricCamera`, `SaveDriver`, `FileSaveStore` |
| `unity/Assets/Isoperia/Unity/Plugins/WebGL/` | `IsoperiaFS.jslib` — the IndexedDB save flush |
| `unity/Assets/Isoperia/Editor/` | `IsoperiaBuild` — settings + build, as code |
| `unity/Assets/WebGLTemplates/IsoperiaPWA/` | PWA shell, service worker, icons, host headers |

The only things missing are the ones Unity itself generates: `ProjectSettings/`,
`Library/`, and `.meta` files.

---

## Prerequisites

- **Unity 6** with the **WebGL Build Support** module. The project is currently
  on **6000.5.8f1**, which is what `unity/ProjectSettings/ProjectVersion.txt`
  records — match it, or expect a one-way project upgrade on first open.
  ```
  unityhub -- --headless install --version 6000.5.8f1 --module webgl --childModules
  ```
- A Unity account and an activated licence (Personal is fine). Batch mode still
  requires activation.
- **Git LFS**: `git lfs install` before committing anything binary.

---

## Step 1 — Create the project over the existing folder

Unity Hub refuses to create a project in a non-empty directory, and `unity/`
already has `Assets/` and `Packages/`. So create it elsewhere and merge:

```bash
cd <repo root>
UNITY=/path/to/Unity            # e.g. ~/Unity/Hub/Editor/6000.0.32f1/Editor/Unity

"$UNITY" -quit -batchmode -nographics \
  -createProject /tmp/isoperia-scaffold \
  -logFile -

# Take only what Unity generates and the repo lacks.
cp -r /tmp/isoperia-scaffold/ProjectSettings unity/
rm -rf /tmp/isoperia-scaffold
```

Do **not** copy `/tmp/isoperia-scaffold/Assets` or `Packages` over `unity/` — that
would overwrite the ported code and the pre-declared package list.

Then open the project once so Unity resolves packages and generates `.meta` files:

```bash
"$UNITY" -quit -batchmode -nographics -projectPath unity -logFile -
```

> **Steps 1–4 are already done** for the committed project (`af82dc6`) — skip to
> Step 4's re-run note, then Step 5. They remain here for rebuilding from scratch.

> **If package resolution fails** on a version in `unity/Packages/manifest.json`,
> delete the offending line and re-open; Unity resolves a compatible one. That has
> already happened once: Input System and Addressables resolved up to 1.20.0 and
> 2.11.1 on 6000.5. Required packages are URP, Input System, Addressables,
> Newtonsoft Json, Test Framework.

---

## Step 2 — Switch platform and configure

```bash
"$UNITY" -quit -batchmode -nographics -projectPath unity \
  -buildTarget WebGL \
  -executeMethod Isoperia.EditorTools.IsoperiaBuild.ConfigureWebGL \
  -logFile -
```

Expect in the log, both lines:
```
[Isoperia] render pipeline: created Assets/Isoperia/Settings/IsoperiaURP.asset, assigned to graphics defaults and all N quality levels.
[Isoperia] WebGL configured: Brotli, exceptions=None, stripping=High, heap=320MB, Linear, WebGL2 (GLES3), ASTC, URP, template=PROJECT:IsoperiaPWA
```

> **The render pipeline line is new and it matters.** The project was scaffolded
> from the plain 3D template with the URP *package* installed but no URP *asset*
> assigned — `ProjectSettings/GraphicsSettings.asset` had
> `m_CustomRenderPipeline: {fileID: 0}` and so did every quality level. Having the
> package is not the same as having the pipeline, and nothing warns you: URP
> materials just render in Unity's magenta error colour. That is what the giant
> pink shape on the third device load was. `ConfigureWebGL` now creates and
> assigns the pipeline asset before anything else, and `BuildWebGL` refuses to
> build if a material's shader and the active pipeline disagree.
>
> **`ConfigureRenderPipeline` is not enough on its own** — the scene stores the
> materials, so you must re-run Step 4 after it, or you rebuild the same magenta
> scene. Steps 2 → 4 → 5, in that order, every time.

> **Texture compression is a local-build problem, not a code problem.**
> `EditorUserBuildSettings.webGLBuildSubtarget` lives in `Library/`, which is not
> version-controlled. `ConfigureWebGL` assigns ASTC every time, yet **every local
> build reported `Generic`** — while the first CI build reported **`ASTC`** from
> the same code. The difference is that CI starts with no `Library/` at all, so
> the value is written and read inside one clean session; a long-lived local
> `Library/` holds the old value.
>
> So a `Generic` line means *your working copy*, not the build script.
> `ConfigureWebGL` warns when the value does not stick and `build-report.txt`
> flags it inline. If you see it, set Build Profiles → WebGL → Texture
> Compression to ASTC by hand, or delete `unity/Library/` and re-run. Do not
> treat a `Generic` line as noise: it ships uncompressed textures against a
> 320 MB heap once Phase 5 art lands.
>
> **This is the first concrete reason to prefer the CI build over a local one**
> for anything that actually ships. See `docs/CI_DEPLOY.md`.

> **If `IsoperiaBuild.cs` fails to compile**, a Unity API was renamed between
> versions. Fix the offending line — every setting has a documented manual
> equivalent in `docs/UNITY_SETUP.md` §2. Do not delete the file wholesale; a
> compile error in an Editor script blocks the whole project.

Accept the Input System backend restart prompt if it appears (batch mode applies
it automatically).

---

## Step 3 — Run the tests

```bash
"$UNITY" -runTests -batchmode -projectPath unity \
  -testPlatform EditMode \
  -testResults /tmp/results.xml \
  -logFile -
```

**Expect 167 of ours passing, 0 failing.** These same assertions already pass
outside Unity via `npm run verify:core`, so a failure here means an Editor
integration problem (assembly references, package resolution), not a logic
problem.

> The runner reports **168**, not 167, and that is correct. The extra is
> `AddressableAssets.DocExampleCode.TestStub`, a test the Addressables package
> ships inside its own doc-example assembly. It is not ours and not cruft in this
> repo — do not go looking for it, and do not "correct" the 167 to match.

---

## Step 4 — Create the bootstrap scene

> **This step is not optional and is not implied by a rebuild.** `BuildWebGL`
> uses the *committed* `Bootstrap.unity`; changing `IsoperiaBuild.cs` does not
> change the scene file. If you build without re-running this, you ship the old
> scene and nothing on screen changes — which has already happened once and
> looked like the fix failing.


> **Re-run this if your project predates commit `10ca527`.** The first version of
> `CreateBootstrapScene` omitted the `SaveDriver` object, so nothing loaded on
> startup, nothing autosaved, and the WebGL IndexedDB flush was never installed —
> every session's progress lost silently, with no error. Re-running fixes it.
> Verify afterwards that the scene contains **four** objects: `Main Camera`,
> `Sun`, `GameLoop`, and `SaveDriver`.

> **Re-run this if your project predates the shared-material fix.** The
> placeholder colours come from real `.mat` assets under
> `Assets/Isoperia/Materials/`, written by this step. Confirm four exist —
> `Ground`, `ReferenceStone`, `ReferenceAccent`, `SpawnMarker` — each with shader
> `Universal Render Pipeline/Lit`.
>
> **Then count the references, which is the check that was missed.** The scene has
> **seven** renderers (ground, five cubes, capsule) and four materials, because
> four cubes share `ReferenceStone`. So the scene must contain **seven** material
> references and **zero** `m_Materials` entries reading `{fileID: 0}`:
>
> ```bash
> grep -A2 'm_Materials:' unity/Assets/Isoperia/Scenes/Bootstrap.unity | grep -c 'fileID: 0}'   # must be 0
> ```
>
> A count of four references looks reassuring and is the bug: it means three cube
> renderers point at nothing and render magenta. `CreateBootstrapScene` and
> `BuildWebGL` both now fail outright on a null material, so this should be
> impossible — the command is here because that guard is newer than the trap.


```bash
"$UNITY" -quit -batchmode -nographics -projectPath unity \
  -executeMethod Isoperia.EditorTools.IsoperiaBuild.CreateBootstrapScene \
  -logFile -
```

Writes `Assets/Isoperia/Scenes/Bootstrap.unity` with an isometric camera, the
tick bridge, a sun and a placeholder ground plane, and registers it in Build
Settings.

**Do not hand-tune the camera.** `IsometricCamera` writes projection, orthographic
size, rotation and clip planes in `Awake`. The angle (pitch 35.264389682°, yaw 45°,
orthographic size 15) is pinned by `docs/PORTING_SPEC.md` §2 and the entire art
pipeline assumes it.

---

## Step 5 — Build

```bash
"$UNITY" -quit -batchmode -nographics -projectPath unity \
  -executeMethod Isoperia.EditorTools.IsoperiaBuild.BuildWebGL \
  -logFile -
```

Output lands in `unity/WebGLBuild/` (git-ignored). **Verify the template was
used** — this is the single most common failure:

```bash
ls unity/WebGLBuild
```

Must contain `index.html`, `manifest.webmanifest`, `ServiceWorker.js`, `_headers`,
`vercel.json`, `icons/`, and `Build/`. If `_headers` and `icons/` are missing,
Unity fell back to its default template: confirm
`Assets/WebGLTemplates/IsoperiaPWA/` is at exactly that path and re-run Step 2.

---

## Step 6 — Deploy

> **Every build gets a new cache id, automatically.** `BuildWebGL` stamps
> `ServiceWorker.js` with a unique `BUILD_ID`, which is what makes a redeploy
> visible to a browser that has been here before. A browser only installs a new
> service worker when the worker file's bytes change; the cache used to be keyed
> on the Unity product version, which stayed at 1.0 forever, so several correct
> deploys were invisible on devices that had already loaded the site. Check
> `build_id` and `service worker stamped: yes` in `unity/build-report.txt`.
>
> **If you are testing a device that loaded an older build,** the new worker takes
> over on the *second* load — the first request still comes from the old one. Load
> twice, or use a private tab, before concluding anything is wrong.


```bash
npx netlify-cli deploy --dir unity/WebGLBuild --prod
```
(or `npx vercel --cwd unity/WebGLBuild --prod`)

**Then verify the headers actually landed.** Skipping this is the number one
cause of "works locally, fails when hosted":

```bash
curl -sI https://<site>/Build/$(ls unity/WebGLBuild/Build | grep '\.wasm\.br$') \
  | grep -i 'content-type\|content-encoding'
```

Required, exactly:
```
content-type: application/wasm
content-encoding: br
```

Anything else and the loader hangs on the progress bar or throws "Unable to
parse". Fix the host config before touching Unity.

---

## Step 7 — Report back

Post the following, which is what the next phase depends on:

1. Exact Unity version used.
2. Any `manifest.json` versions changed, and to what.
3. Any line of `IsoperiaBuild.cs` changed for API differences.
4. EditMode result (expect 167/167).
5. The deployed URL.
6. Build size: `du -sh unity/WebGLBuild` and the compressed `Build/` total.
7. The `curl -I` output from Step 6.

Commit `unity/ProjectSettings/`, `unity/Assets/Isoperia/Settings/`,
`unity/Assets/Isoperia/Materials/` and all generated `.meta` files to the branch —
the URP asset and the materials are project state, not build output. Without them
without the `.meta` files, every other clone re-imports with different GUIDs and
the scene loses its component references and its materials.

```bash
git add unity/ProjectSettings unity/Assets
git commit -m "Phase 1 (Editor lane): Unity 6 project settings, meta files, bootstrap scene"
git push -u origin claude/unity-engine-migration-roadmap-fz9w8y
```

---

## Step 8 — Device acceptance (needs a human with a phone)

- [ ] **iOS, Safari only** (Chrome on iOS cannot install): Share → Add to Home Screen
- [ ] **Android, Chrome**: install prompt, or menu → Install app
- [ ] Launches **fullscreen, no address bar**, from the home-screen icon
- [ ] Loading bar advances on a cold load — not a blank screen
- [ ] "Tap to play" appears, and **sound works after that tap** on iOS
- [ ] Nothing clipped by the notch or the home indicator
- [ ] Airplane mode → relaunch from the icon still boots
- [ ] The scene shows a muted green ground with **five reference cubes** running
      diagonally (the middle one gold) and a pale capsule at the spawn tile
- [ ] **Nothing on screen is magenta.** Magenta anywhere means the render pipeline
      is not assigned — go back to Step 2, then Step 4, then rebuild

**How to actually judge the isometric angle:** look at a cube's top face. Under a
true 2:1 isometric view it is a diamond exactly **twice as wide as it is tall**,
and the two visible side faces are mirror images of each other. A flat plane
cannot tell you this — it looks identical at any pitch, which is why the cubes
are there.

**Save durability — the one thing that cannot be verified without a device.**
Everything else in the port is proven by the suites that run outside Unity, but
the WebGL `FS.syncfs` flush only exists at runtime in a browser. Without it every
save is lost when the tab closes, silently, with no error. Test it deliberately:

- [ ] Play briefly, then **close the tab** and relaunch — progress is still there
- [ ] Play, **switch apps** for a few minutes on iOS so the tab is reclaimed,
      then relaunch — progress is still there
- [ ] Play, then **force-reload** — progress is still there

If any of these lose progress, the flush is not firing. Check the browser console
for `[isoperia] FS.syncfs failed`, and confirm `IsoperiaFS.jslib` was included in
the build (`Assets/Isoperia/Unity/Plugins/WebGL/`).

---

## Do not

- Hand-edit camera transform values — see Step 4.
- Commit `unity/Library/`, `unity/Temp/`, or `unity/WebGLBuild/` (already ignored).
- Enable Development Build for anything deployed.
- Add gameplay logic to `Isoperia.Core` that references UnityEngine — the assembly
  is declared `noEngineReferences` on purpose, and that is what lets the whole port
  be tested without a licence. See `unity/Assets/Isoperia/README.md`.
- "Fix" the unused `rnd.Next()` call in `Grid.RollTerrain`. It is dead for terrain
  selection but still advances the PRNG stream; deleting it silently reshuffles
  every tile's decoration seed. It is pinned by a test.
