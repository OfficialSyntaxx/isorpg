# Isoperia → Unity Migration Roadmap

## Context

Isoperia today is a ~11k-LOC TypeScript/three.js browser game: a mobile-first hybrid
settlement-builder + OSRS-style RPG. It is mature and complete in *systems* — 600 ms
tick loop, OSRS combat math, 12 skills, 62 items, buildings, farming,
quests, clue scrolls, a procedural dungeon, save/load with offline progression — but its
*visuals* are a dead end: nearly every mesh is procedurally assembled three.js primitives
with Canvas-2D-painted textures. That ceiling is why we're moving to Unity.

**A note on "2D → 3D".** The game is *already* 3D — every mesh is real three.js geometry.
What makes it read as flat is that the camera is **orthographic and locked** at 35.264°/45°
and never moves off that angle. We are keeping that framing. So the visual migration is
precisely: **procedurally assembled primitives → authored low-poly models, under the same
fixed isometric camera.** It is not a projection change, and that is deliberate — a fixed
camera means models only ever have to look right from one angle, backfaces never show,
buildings need no real backs, and the tile grid, tap-to-move, A*, and the whole panel UI
keep working untouched. Against a 256–384 MB WebGL heap, that saving is not a nicety; it
is what makes the art budget survivable.

**Decisions taken:**
- **Engine:** Unity 6 LTS, URP.
- **Primary target: Unity WebGL, installed as a PWA** via iOS/Android "Add to Home Screen".
  Free, no signing, no store, installable by friends and family anywhere. Native Android
  APK is a secondary target; iOS native/TestFlight is deferred until budget allows.
- **Scope:** port the systems as-is (combat math, tick, skills, save schema stay
  authoritative); completely remodel the visuals.
- **Repo:** the Unity project **replaces** the web version. The three.js code is tagged
  and archived, not deleted from history.
- **Art:** stylized low-poly under a fixed isometric camera. **Free assets first**
  (Kenney / Quaternius / Poly Pizza / itch.io / Asset Store free tier), Higgsfield credits
  spent only where free sources can't match, Blender for gaps and re-materialing.
- **Hosting:** Netlify or Vercel now (own webhost later), with a proper landing page.
  itch.io as a discovery mirror. `WIKI.md` published as part of the site.

**Outcome:** the same game loop and balance as today, real low-poly art, playing
fullscreen from the home screen on any phone via a URL.

---

## The constraint that governs everything: Unity WebGL on mobile

This is the single most important technical fact in this plan. Unity WebGL on mobile
browsers is Unity's weakest target, and it is our *primary* one. Every art, performance,
and architecture decision below is downstream of these limits:

- **Single-threaded.** No Job System, no Burst multithreading, no `System.Threading`.
  Write all ported systems as plain single-threaded C# — which the TS port already is.
- **Fixed memory heap**, and iOS Safari kills tabs that exceed it. Budget a **256–384 MB**
  heap and treat total loaded assets as the hard ceiling. This is the real art budget.
- **Download size is the retention cliff.** Target **< 40 MB Brotli-compressed** initial
  load; stream everything else via Addressables.
- **No Fullscreen API on iOS Safari** — which is precisely *why* PWA install matters. A
  home-screen launch with `display: standalone` is chrome-less and fullscreen; a normal
  Safari tab never will be. The PWA manifest is a functional requirement, not polish.
- **Audio needs a user gesture** to start on iOS. First-tap unlock is mandatory.
- **No IL2CPP native plugins, no video, limited texture formats.** Ship **ASTC** textures
  (WEBGL_compressed_texture_astc, supported on modern iOS/Android GPUs) with an
  uncompressed fallback path.

**Rule for the whole project:** every phase is validated on a real iPhone in Safari and a
real mid-range Android in Chrome, not in the Editor. A thing that only works in the Editor
does not work.

---

## What we already own

Verified against the repo and the live Higgsfield account, 2026-08-18. This is the
starting inventory, not a wish list — several phases below are cheaper than they look
because of it.

**Higgsfield balance: 168.45 credits** (Plus plan).

**Carries into Unity essentially unchanged:**
- **62 item icons**, `public/icons/*.png` — already sliced from four generated atlas
  sheets. These drop straight into UI Toolkit and give Phase 3 real content on day one.
- **4 rigged character GLBs**, `public/models/` (~2.1 MB total): `hero_rigged`,
  `villager`, `forest_ogre`, `cave_brute`, each already optimised ~96% by
  `scripts/optimize-glb.cjs`.
- **3 music tracks** (`public/music/` — town / wilds / dungeon, 40 s loopable, **4.4 MB**)
  and **23 SFX** (`public/sfx/`, 296 kB). Note the ratio: the music is ~15× the size of
  every sound effect combined, and is what Phase 7 has to keep out of the initial bundle.
- **Sky panorama** `public/sky.jpg` — reusable as a skybox source.
- **Concept art PNGs** for villager, forest ogre and cave brute — the source images
  behind the meshes, useful for art-bible reference and for regenerating variants.

**The finding that matters most:** `ASSETS_PIPELINE.md` records that **every Meshy rig
uses the same 24-bone humanoid skeleton**, verified identical across villager, forest ogre
and cave brute. In three.js this was only half a win — rest poses differ per character, so
clips had to be hand-marked `retargetable()` (rotation-only) to be shared, and anything
else dragged the target into the donor's proportions.

**Unity's Humanoid avatar solves this outright.** Import each GLB as Humanoid, and Mecanim
retargets any clip onto any rig regardless of limb proportions — that is exactly what the
avatar system is for. One Animator controller and one animation set serve every character.
This deletes the `ClipLibrary` / `verify-rig.cjs` machinery rather than porting it, and it
means new characters cost a mesh, not a mesh plus an animation set.

**Established generation pipeline** (costs observed on real jobs, not list prices):
- `3d_rigging` accepts an existing GLB **URL**, so owned meshes can be rigged without
  regenerating: **5 cr to rig, 8 cr to rig + one clip** (one clip per call).
- `image_to_3d` ≈ 9–30 cr depending on model; `optimize-glb.cjs` then cuts ~96% of the
  size, which is what makes the cheap-but-enormous output usable — a character lands
  around **~15 cr all-in**.
- Images are near-free; **characters are where credits go.** 12 monsters at full price
  would consume most of the balance, which is why free-first is the standing rule.

---

## Where work happens

The Unity Editor and Blender are **not available in this container**. Each phase splits:

| Lane | Who | What |
|---|---|---|
| **Code lane** | agent, in-repo | C# scripts, data conversion, tests, PWA shell, landing page, CI, docs |
| **Editor lane** | you, locally | Unity project creation, scene/prefab wiring, asset import, Blender, device testing |

**Pin now:** Unity **6 LTS (6000.x)**, URP, Input System, Addressables, Newtonsoft Json.
Record the exact version in `unity/ProjectSettings/ProjectVersion.txt` once created.

---

## Phase 0 — Freeze & extract the spec

Lock the current game as the source of truth before anything moves.

- Tag the web build `web-final`; keep branch `legacy/threejs`.
- Regenerate `WIKI.md` (`npm run wiki`) — it is the balance/content spec *and* future site content.
- Write `docs/PORTING_SPEC.md` capturing what the C# must reproduce exactly:
  - tick = 600 ms, decoupled from frame (`src/core/Engine.ts:6`)
  - iso camera: orthographic, pitch 35.264°, yaw 45°, frustum 30 (`Engine.ts:8-10`)
  - combat rolls, styles, specials, affixes, drop tables (`src/data/Combat.ts`,
    `src/systems/CombatSystem.ts`)
  - XP curve (`src/data/XPTable.ts`), save schema v1.1.0 (`src/state/GameState.ts:42`)
  - world gen: 42×42, 6-tile chunks, mulberry32 seed (`src/world/Grid.ts:28-40`)
  - A* octile, 8-way, dynamic obstacles (`src/ai/AStar.ts`)
- **Saves:** fresh saves in Unity (no importer). Note that WebGL persists to IndexedDB via
  `Application.persistentDataPath` and **requires an explicit `FS.syncfs` flush** — a save
  that isn't flushed is lost on tab close. Add this to the spec now; it is a classic
  WebGL data-loss bug.

**Exit:** spec doc merged; tag pushed.

---

## Phase 1 — Unity project skeleton + WebGL pipeline proven

Goal: an empty-but-correct Unity project that already deploys as an installable PWA.
Do this *first*, while it's cheap — not after the game is built.

- **Editor lane:** create Unity 6 LTS project, URP Mobile template, at `unity/`.
  Add Input System, Addressables, TextMeshPro, Newtonsoft Json.
- **Code lane:** `.gitignore` (Library/, Temp/, Logs/, Build/, *.csproj) and
  `.gitattributes` with Git LFS for `*.fbx *.blend *.png *.psd *.wav *.mp3 *.glb`.
- WebGL player settings: Brotli compression, exceptions **none** in release, stripping
  **High**, no Development Build, fixed memory heap ~320 MB, ASTC textures,
  WebGL 2.0 required.
- **Custom WebGL template** (`unity/Assets/WebGLTemplates/IsoperiaPWA/`) — this is real
  work and belongs here, not at the end:
  - `manifest.webmanifest`: `display: standalone`, portrait/landscape, icons (192/512),
    theme color, start URL
  - `apple-touch-icon`, `apple-mobile-web-app-capable`, status-bar style meta
  - `viewport-fit=cover` + CSS `env(safe-area-inset-*)` so notches don't clip the game
  - service worker caching the Unity build files for offline launch and instant relaunch
  - a loading screen with a real progress bar (the download is tens of MB — a blank
    screen loses people)
  - first-tap audio unlock
- Deploy config: Netlify `_headers` / Vercel `vercel.json` serving `.br` files with
  `Content-Encoding: br` and correct `Content-Type` for `.wasm`. **Getting this wrong is
  the #1 cause of "Unity WebGL works locally, fails when hosted."**
- Prove the loop end to end: grey-box scene → build → deploy → open on an iPhone →
  Add to Home Screen → launches fullscreen offline.

**Exit:** a spinning cube, installed as an app icon on your phone, launching fullscreen
from a Netlify URL. Everything after this is content on a proven pipe.

---

## Phase 2 — Core runtime port (no art)

Goal: the *game* runs as untextured grey boxes. The biggest phase; expect to split it.

Port in dependency order, as plain single-threaded C# (no MonoBehaviour where the TS
class was pure):

- **2a — foundation:** `TickRunner` (600 ms accumulator, `OnTick(int)`), `Grid`/`Tile` +
  mulberry32 world gen, `AStar` octile pathfinder.
- **2b — state & persistence:** `GameState` + components (Position/Health/Skills/
  Inventory/Equipment) as serializable plain classes; `SaveSystem` via Newtonsoft to
  `persistentDataPath` **with the IndexedDB flush**, port `Sanitizer.ts` validation and
  the offline-progression cap (8h / 12h with Town Hall).
- **2c — combat:** `CombatSystem` + `Combat` data — accuracy/max-hit rolls, attack styles,
  Resolve buffs, specials, affixes, drop tables, respawns, death penalty.
- **2d — remaining systems:** Movement, Skill, Crafting, Build, Farm, Quest, Npc, Dungeon,
  Shop, Labour, Clue, Meta, Map — one file each, mirroring `src/systems/`.

Content data (`src/data/*.ts`, ~1,575 LOC of TS literals) converts to **JSON loaded at
runtime** rather than ScriptableObjects — JSON keeps the existing `gen-wiki` tooling
alive so the website's wiki page can stay auto-generated from the same source of truth.
Write a one-shot TS→JSON export script during this phase.

**Rendering during this phase:** one grey cube prefab per entity type, tiles as a single
quad-grid mesh. Camera orthographic at the exact pitch/yaw/frustum from Phase 0.

**Tests:** Unity Test Framework EditMode tests porting `tests/qc.test.ts` — combat
max-hit tables, XP curve, drop-rate sums, recipe validity, A* correctness, world-gen
determinism. This is how we prove the port didn't drift.

**Exit:** walk, gather, craft, build, fight, kill, save, reload — grey boxes, tests green.

---

## Phase 3 — Input & mobile UI

- Input System actions: tap-to-move, drag-pan, pinch-zoom, tap-to-target
  (port intent from `src/core/InputController.ts`).
- UI in **UI Toolkit** (UXML/USS) — closest mental model to the existing HTML/CSS and the
  right choice for a data-heavy panel game. Rebuild every panel from `src/ui/UI.ts`:
  inventory, equipment, combat, craft, build, map, quests, meta, village, shop, settings,
  clues, plus toasts.
- Reuse the existing 62 item icon PNGs from `public/icons/` as-is — real content on day one.
- Safe-area handling wired to the `env(safe-area-inset-*)` values from the PWA shell;
  test on a notched iPhone specifically.

**Exit:** fully playable by touch on a phone, grey-box world, no missing panels.

---

## Phase 4 — Art bible & asset pipeline

Decide the look *before* downloading 40 mismatched packs.

- `docs/ART_BIBLE.md`: palette (lift the existing procedural palette from
  `src/generators/Materials.ts` — already coherent), **WebGL-driven budgets**:
  props ≤ 300 tris, characters ≤ 2k, **one shared 1024–2048 ASTC atlas per category**,
  flat/gradient shading, a single URP unlit-or-simple-lit material family.
  These are tighter than a native mobile game would need — that's the WebGL tax.
- **Fixed-camera dividend.** Because the camera never leaves 35.264°/45°, budgets buy more
  than they look like they should: model only what the camera sees, delete backfaces and
  undersides, skip interior detail, and bake the lighting direction that the one sun
  actually uses. Write this into the bible as an explicit modelling rule — it is the main
  reason these tight numbers are achievable at all.
- **Consistency rule:** every downloaded asset is re-materialed onto our atlas. This is
  what makes mixed free sources look like one game. Non-negotiable, and it applies equally
  to Higgsfield output and to CC0 packs.

**Sourcing order — free first, credits last.** The rule is not thrift for its own sake:
168 credits against 12 monsters, 7 NPCs, 8 buildings and 8 weapons does not close at
~15 cr a character, so credits have to go where nothing free will do.

1. **Already owned** (see inventory above) — the 4 rigged GLBs, 62 icons, music, SFX, sky.
   Zero cost. Start here and see what's actually still missing on screen.
2. **CC0 / permissive packs** — Kenney (nature, tools, props, UI), Quaternius (low-poly
   rigged humanoids, Mixamo-compatible), Poly Pizza, itch.io low-poly packs, Asset Store
   free tier. This should cover trees, rocks, ore, crops, generic villagers and most
   props outright.
3. **Blender** — buildings that must match exact grid footprints, kitbashing pack pieces
   into something specific, and every re-material pass.
4. **Higgsfield credits** — only for what the above genuinely can't produce: named bosses
   with a specific identity, hero variants, and any remaining monster with no free
   equivalent. Preflight every job with `get_cost: true`, and run new meshes through
   `scripts/optimize-glb.cjs` (or its Unity-side equivalent) before import.

Log **every** asset's source and license in `docs/ASSET_CREDITS.md`, including the
Higgsfield generations — the itch.io page and landing page will need the attributions,
and reconstructing them later from memory is miserable.
- Addressables groups per region/category + one import preset per category.
  **Set a hard MB budget per group and track it** — this is the memory ceiling made visible.

**Exit:** art bible merged; 3–5 sample props imported, looking like a family, within budget.

---

## Phase 5 — World & environment art

- 6 terrain types × 4 biomes (MEADOW/FOREST/SNOW/SWAMP) as a modular tile set,
  **baked into one mesh per 6×6 chunk** (42×42 is small; chunk-baking beats instancing
  for draw calls on WebGL).
- Resource nodes (trees, rocks, ore, fishing) with harvested/depleted states.
- Decoration scatter driven by the existing per-tile `seed` field — deterministic and
  survives reloads, same guarantee as today.
- One low-poly model per `BuildingType`, per upgrade level where visually distinct.
- Lighting: port the day/night ramp to a directional light + gradient skybox.
  **Baked lightmaps for static geo, one realtime shadow-casting sun, short shadow
  distance** — realtime shadows are expensive on WebGL.

**Exit:** the overworld looks finished and holds frame rate on your test iPhone.

---

## Phase 6 — Characters, animation & combat feel

**Start from what's owned.** `hero_rigged`, `villager`, `forest_ogre` and `cave_brute` are
already rigged and optimised. Import each as **Unity Humanoid** — all four share the same
24-bone Meshy skeleton, so they map onto the avatar cleanly. Remaining cast (4 critters,
the other 8 monsters) comes from Quaternius CC0 rigged humanoids first, Higgsfield only
where nothing free fits.

**The retargeting win, stated plainly.** Under three.js, clips animated *translation* on
all 24 bones, so a clip authored for one actor visibly dragged another into the donor's
limb proportions — hence the hand-maintained `retargetable()` rotation-only marking in
`ACTOR_CLIPS[...].borrowed`. Unity's Humanoid avatar retargets by muscle space and is
proportion-independent by construction, so **one Animator controller and one clip set drive
every character**, and `ClipLibrary` / `verify-rig.cjs` are deleted rather than ported.
Practical consequence for the budget: a new character costs a mesh, not a mesh plus an
animation set — which is why the per-character Higgsfield estimate is a rig, not 5 clips.

- Clips: idle, walk, attack (per weapon class), hurt, die, gather, craft. Author or source
  **once**, retarget to all. Mixamo is free and Humanoid-compatible if the CC0 packs come
  up short.
- Verify retargeting on the *worst* pair — hero against `forest_ogre`, the most extreme
  proportion gap in the cast. If it holds there it holds everywhere.
- **Critical:** animation is *presentation only*. Combat outcomes stay on the 600 ms tick;
  blend clip length to the tick, never gate damage on animation events.
- Feel: hit VFX, damage-number popups, screen shake (port `addShake`), death dissolve,
  special-attack telegraph. All pooled — no runtime instantiation.

---

## Phase 7 — Audio & polish

- Port the owned audio onto an audio mixer with music/sfx volume settings:
  **3 music tracks** (`public/music/` — town, wilds, dungeon; 40 s loopable, **4.4 MB**)
  and **23 SFX** (`public/sfx/`, 296 kB total).
- **Music is the download problem, not SFX.** Three tracks are 4.4 MB against a
  < 40 MB initial-load budget, while all 23 SFX together are under 300 kB. So: SFX import
  as **Decompress On Load** (tiny, must fire instantly on the tick — a decode stall on a
  hit sound is audible); music imports as **Streaming**, lives in an Addressables group,
  and is **excluded from the initial bundle** so the first load doesn't pay for it.
- First-tap audio unlock from the PWA shell (Phase 1) gates all of this on iOS — verify
  music actually starts after the unlock, not just that it's loaded.
- Footsteps per terrain, UI clicks, gather/craft/level-up stings.
- Particles: biome weather, campfire, forge smoke, level-up burst — all pooled, low count.
- Dungeon ambience and lighting mood.

---

## Phase 8 — WebGL performance & device hardening

The phase where the constraint gets paid off. Profile **on device via remote Safari/Chrome
devtools**, not in the Editor.

- **Frame rate:** target a stable 30 fps on a mid-range phone browser; 60 if it comes free.
  Levers in order: draw-call reduction (chunk baking, atlas consolidation), shadow
  distance, LODs, object pooling.
- **Memory:** stay under the heap budget with headroom. Addressables groups loaded per
  region and unloaded on region change. Watch for iOS tab reloads — that *is* the
  out-of-memory symptom.
- **Load time:** measure cold load on 4G. Cut the initial bundle until it's tolerable;
  push everything possible behind the loading screen and Addressables.
- **Battery/thermal:** 20-minute session check; ship a 30 fps cap option.
- **Save durability:** verify IndexedDB flush survives tab close, backgrounding, and an
  iOS memory kill. Test this deliberately — it is the failure that loses player progress.

**Exit:** a documented perf budget in `docs/PERF_BUDGET.md`, all targets met on device.

---

## Phase 9 — Site, distribution & cutover

**The website** (`site/` in-repo, deployed to Netlify or Vercel; portable to your own
webhost later since it's static):

- **Landing page**: what the game is, screenshots/GIF, and a prominent **Play** button
  loading the WebGL build.
- **Install instructions**, per platform, illustrated — this is how people actually get
  the app, so it can't be a footnote:
  - iOS: Safari → Share → Add to Home Screen (note: **Safari only**, Chrome on iOS can't)
  - Android: Chrome → the install prompt, or menu → Install app
- **Wiki page**: `WIKI.md` rendered into the site, regenerated from the same JSON data the
  game loads (Phase 2), so it can never drift from the build.
- **Downloads** section: the native Android APK as an optional higher-performance
  install — served with `Content-Type: application/vnd.android.package-archive`, with a
  SHA-256 checksum and an "unknown sources" walkthrough.
- Changelog/roadmap page fed from `UPDATES.md`.

**Mirrors:** upload the WebGL build to **itch.io** for discovery and easy sharing. Note
that itch pages can't be PWA-installed under your own identity — your Netlify/Vercel
domain is the canonical install home, itch is a shop window.

**iOS native, later:** when budget allows, $99/yr Apple Developer → TestFlight public
link, no UDIDs and no 7-day cycle. Nothing in this plan blocks that upgrade; the Unity
project already builds to iOS. Revisit once the game is worth charging for.

**CI:** replace `.github/workflows/ci.yml` with a Unity CI job (GameCI — EditMode tests +
WebGL build, needs a Unity license secret). On a tagged release, deploy the site + WebGL
build to the host and attach the APK to a GitHub Release.

**Cutover:** delete `src/`, `public/`, `scripts/`, `tests/`, `index.html`,
`vite.config.ts`, `package.json` from `main`; move `unity/` and `site/` into place.
Rewrite `README.md`. Keep `WIKI.md`, `docs/PORTING_SPEC.md`, `ROADMAP.md`. History and the
`web-final` tag preserve the old game.

---

## Sequencing notes

- **Phases 0–3 are the critical path** and are mostly agent-doable code work.
  Phase 1's WebGL/PWA pipeline is deliberately front-loaded: discovering a hosting or
  memory problem after the art is built would be expensive.
- Do **not** start art before Phase 4. Mixed free assets without a consistency rule is the
  most common way this kind of migration ends up looking bad.
- Phase 2 splits into 2a–2d as marked; we'll tackle them one at a time.
- The landing page (Phase 9) can be stubbed early — as soon as Phase 1 deploys, there's a
  URL worth putting a page in front of.

---

## Verification

- **Per phase:** EditMode/PlayMode tests green, plus a **device check on real iPhone
  Safari and real Android Chrome** — Editor-only validation doesn't count on this project.
- **Port fidelity (Phase 2):** the ported EditMode tests are direct translations of
  `tests/qc.test.ts`'s 321 assertions, same expected numbers — any divergence is a port
  bug. Plus world-gen determinism: the same seed must produce the same 42×42 terrain in C#
  as in TS (dump and diff a tile-type grid from both).
- **Feel parity:** side-by-side session, web build vs. Unity build, checking tick cadence,
  movement speed, hit frequency, XP rates.
- **PWA acceptance:** installs to home screen on iOS and Android; launches fullscreen with
  no browser chrome; launches offline after first load; safe areas correct on a notched
  device; audio works after first tap.
- **Save durability:** progress survives tab close, backgrounding, and a forced reload.
- **Final:** full playthrough on device from new save → first dungeon boss kill, with
  save/reload and offline progression exercised.

---

## Progress

- **Phase 0 — done** (commit `97a26c4`). `docs/PORTING_SPEC.md` written and merged;
  `WIKI.md` regenerated; `legacy/threejs` pushed at `18f3ddc` with a clean build and
  321/321 QC assertions passing. The `web-final` tag exists locally but this environment's
  git proxy rejects tag refs — push it from your own machine if you want it on the remote.
  Two traps documented there before they could cost a week: the stateful per-tile PRNG
  draw ordering in `Grid.generate()`, and the Unity WebGL `FS.syncfs` flush without which
  saves vanish on tab close.

**Next: Phase 1** — Unity project skeleton and the WebGL/PWA delivery pipeline proven end
to end. Creating the project is Editor-lane (yours); the WebGL template, manifest, service
worker, loading screen, audio unlock, and Netlify/Vercel headers are code-lane and can be
written ahead of time so they are waiting when you open the Editor.

Nothing is deleted or replaced until Phase 9.
