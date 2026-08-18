# Phase 1 — Unity project setup (Editor lane)

The code-lane half of Phase 1 is already in the repo: the PWA WebGL template, its
icons, the service worker, and the Netlify/Vercel headers. This document is the
half that needs the Editor, which is not available in the agent's container.

Work through it once. At the end you should have the game's icon on your phone's
home screen, launching fullscreen with no browser chrome, working offline.

---

## 1. Create the project

- **Unity 6 LTS (6000.x)** — pin it. Record the exact version; CI must match, or
  the project silently reimports on every build.
- Template: **Universal 3D** (URP). Not Built-in, not HDRP.
- Location: **`unity/`** inside this repo.

The repo already contains `unity/.gitignore`, `unity/.gitattributes`, and
`unity/Assets/WebGLTemplates/IsoperiaPWA/`. Creating the project on top of that
folder is fine — Unity will not remove them.

**Before your first commit of Unity files**, install Git LFS locally
(`git lfs install`). `.gitattributes` routes art and audio through it; if LFS is
missing those files commit as raw binaries and bloat the repo permanently.

### Packages

Window → Package Manager → add:

| Package | Why |
|---|---|
| Input System | touch: tap-to-move, drag-pan, pinch-zoom (Phase 3) |
| Addressables | per-region asset loading; the memory ceiling depends on it |
| TextMeshPro | text rendering |
| Newtonsoft Json | save serialization (`SaveSystem`, Phase 2b) |

When Unity offers to switch to the new Input System backend, accept and let it
restart.

---

## 2. Project settings

**Edit → Project Settings → Player → Web:**

| Setting | Value | Why it matters |
|---|---|---|
| Compression Format | **Brotli** | ~20% smaller than gzip. The `_headers` file already declares `Content-Encoding: br`. |
| Decompression Fallback | **off** | Only needed when the host can't set headers. Ours can, and the fallback adds a decompressor to the payload. |
| Enable Exceptions | **None** (release) | Exception support is a large, slow addition to the WASM. Use *Explicitly Thrown* while debugging, never for the shipped build. |
| Managed Stripping Level | **High** | Cuts unused IL. Watch for stripped-away reflection; add a `link.xml` if Newtonsoft complains. |
| WebGL Template | **IsoperiaPWA** | The one in this repo. If it isn't listed, the folder is misplaced — it must be exactly `Assets/WebGLTemplates/IsoperiaPWA/`. |
| Memory Size / heap | **~320 MB** | Inside the 256–384 MB budget. Too high and iOS Safari kills the tab. |
| Data Caching | **on** | IndexedDB-caches the data file, so relaunch skips the download. |
| Target WebGL version | **WebGL 2.0 only** | WebGL 1 fallback costs shader variants we never use. |
| Color Space | **Linear** | Requires WebGL 2. |
| Texture Compression | **ASTC** | Supported on modern iOS/Android GPUs. |
| Run In Background | **on** | Prevents a hard stall when the tab is backgrounded mid-tick. |

**Quality settings:** delete every level except one mobile-grade level. Shadows
→ Hard Only, shadow distance short (~30 units), no soft particles, no HDR.

**Edit → Project Settings → Graphics:** confirm the URP asset is assigned, and
strip unused shader variants — variant count is a major WASM size contributor.

---

## 3. Build

- **File → Build Settings → Web → Switch Platform** (the first switch reimports
  every asset; it takes a while).
- Uncheck **Development Build** for anything you deploy. A development build is
  far larger and slower, and its console spam is visible to players.
- Build to `unity/WebGLBuild/` — already git-ignored.

Output should look like:

```
WebGLBuild/
├── index.html              ← from our template
├── manifest.webmanifest
├── ServiceWorker.js
├── _headers                ← Netlify
├── vercel.json             ← Vercel
├── icons/
└── Build/
    ├── *.loader.js
    ├── *.framework.js.br
    ├── *.data.br
    └── *.wasm.br
```

If `_headers`, `vercel.json`, `manifest.webmanifest` or `icons/` are missing from
the output, Unity did not use our template — re-check the WebGL Template setting.

---

## 4. Deploy

Deploy the **contents of `WebGLBuild/`** as the site root.

**Netlify** — drag the folder onto the Netlify dashboard, or:
```
npx netlify-cli deploy --dir unity/WebGLBuild --prod
```

**Vercel:**
```
npx vercel --cwd unity/WebGLBuild --prod
```

### Verify the headers landed

This is the step people skip, and it is the number one cause of "works locally,
breaks when hosted":

```
curl -sI https://<your-site>/Build/<name>.wasm.br | grep -i "content-type\|content-encoding"
```

Expect exactly:
```
content-type: application/wasm
content-encoding: br
```

Anything else — `application/octet-stream`, or no encoding — and the loader will
either hang on the progress bar or throw "Unable to parse". Fix the host config
before debugging anything in Unity.

---

## 5. Install on device (the actual Phase 1 exit criterion)

**iOS — Safari only.** Chrome and Firefox on iOS cannot add to the home screen.
1. Open the URL in **Safari**.
2. Share → **Add to Home Screen**.
3. Launch from the new icon. It must open **fullscreen with no address bar** — a
   Safari tab never will, which is the whole reason the PWA manifest exists.

**Android — Chrome.** The install prompt appears automatically, or menu →
*Install app* / *Add to Home screen*.

### Acceptance checklist

- [ ] Installs to the home screen on iOS and on Android
- [ ] Launches fullscreen, no browser chrome
- [ ] Loading bar advances (not a blank screen) on a cold load
- [ ] "Tap to play" appears, and **sound works after that tap** on iOS
- [ ] Safe areas correct on a notched iPhone — nothing under the notch or the
      home indicator
- [ ] Airplane mode → relaunch from the icon still boots
- [ ] `curl -I` shows the two headers above

---

## 6. What is already written

The repo already contains, verified and passing:

| Path | What |
|---|---|
| `unity/Packages/manifest.json` | the four required packages, pre-declared |
| `unity/Assets/Isoperia/Core/` | the ported simulation core (Phases 2a-2b) + its tests |
| `unity/Assets/Isoperia/Unity/` | `GameLoop`, `IsometricCamera`, `SaveDriver`, `FileSaveStore` |
| `unity/Assets/Isoperia/Unity/Plugins/WebGL/` | `IsoperiaFS.jslib` — the IndexedDB flush |
| `unity/Assets/WebGLTemplates/IsoperiaPWA/` | the PWA shell |

Read `unity/Assets/Isoperia/README.md` for why `Isoperia.Core` is barred from
referencing UnityEngine — it is what lets the whole port be tested without the
Editor.

**If Package Manager rejects a version** in `manifest.json`, delete that line and
add the package through the UI; the pinned versions target Unity 6000.0 LTS and
your exact patch release may differ.

### Scene wiring (a few minutes, once)

1. New scene. Delete the default `Main Camera`'s skybox settings later if needed.
2. Add an empty GameObject `GameLoop`, attach `Isoperia.Unity.GameLoop`.
3. Select the camera, attach `Isoperia.Unity.IsometricCamera`. It sets projection,
   size, rotation and clip planes itself in `Awake` — do not hand-tune them in the
   inspector, the values are pinned by `docs/PORTING_SPEC.md` §2.
4. Open Window → General → Test Runner → EditMode → Run All. Expect 167 passing.

---

## 7. Shell changes without a Unity build

The template shell is plain web code, so iterate on it with:

```
npm run verify:pwa
```

It stubs `createUnityInstance`, emulates Unity's macro processor, and drives the
whole load → ready → tap-to-play → offline-relaunch cycle in headless Chromium in
about a second. Run it after any edit to `index.html`, `ServiceWorker.js`, or the
manifest — it has already caught one bug that would have failed a real build.

Regenerate the app icons with `npm run icons:app`.

The C# core has the same property. `npm run verify:unity` runs all three suites —
PWA shell, core unit tests, and TypeScript parity — in a couple of seconds with no
Editor involved:

```
npm run verify:pwa         #  18 assertions: PWA shell behaviour
npm run verify:core        # 167 assertions: the EditMode tests, run outside Unity
npm run verify:json        #  72 assertions: Core's JSON parser vs Node's
npm run verify:parity      #  10 assertions: world gen, pathfinding, XP curve and combat vs TypeScript
npm run verify:sanitizer   #  84 assertions: the save sanitizer vs TypeScript, on adversarial input
npm run verify:unity       # all of the above
```

These need a C# toolchain (`apt-get install -y mono-mcs mono-runtime`) and skip
cleanly without one.

> The current icons are **placeholders** — a generated isometric tile in the app
> palette. They are correct in shape, size and purpose (including a maskable
> variant) so the install flow is testable now. Replace the artwork before you
> share the link widely; the generator re-exports every required size.

---

## 8. Known gotchas

- **Template macros are not comment-aware.** Writing the triple-brace macro
  syntax inside an HTML or JS comment in the template is a build error, because
  the processor substitutes it anyway. `verify:pwa` catches this.
- **The service worker caches by product version.** Ship a new build and clients
  keep the old one? Bump Player Settings → Version. `CACHE_VERSION` is stamped
  from it.
- **Unity WebGL is single-threaded.** No Job System, no `System.Threading`, no
  `async` in game logic. Everything ported in Phase 2 is plain synchronous C#.
- **Saves need an explicit IndexedDB flush.** `Application.persistentDataPath`
  writes land in memory only until `FS.syncfs` runs; without it progress is lost
  on tab close. See `docs/PORTING_SPEC.md` §7.4 — this is Phase 2b work, but it
  is the single most likely data-loss bug in the whole port.
