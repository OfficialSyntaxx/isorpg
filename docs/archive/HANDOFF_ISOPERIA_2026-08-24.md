> Historical record only. Its design, branch, export and deployment instructions are superseded by the current GDD and workflow. Preserve the debugging evidence; do not execute its old next steps.

# Isoperia — Handoff

**Written:** 2026-08-24 · **Branch:** `main` @ `6637933` · **Audience:** whoever picks this
up next, human or model, working on a Mac with the Unity Editor available.

This document exists because the work so far has been split across two environments that
cannot see each other. Read the whole thing before touching anything — several of the
sections below describe traps that have already cost real time, and a few describe
guarantees that look like ordinary code but are load-bearing.

---

## 1. What Isoperia is

A mobile-first hybrid **settlement-builder + OSRS-style RPG**. Originally ~11k LOC of
TypeScript/three.js running in the browser; currently being migrated to **Unity 6, URP,
WebGL, installed as a PWA**.

The game is *mature in systems* and *immature in visuals*, and that asymmetry is the whole
reason for the migration:

- **Systems (done, authoritative):** 600 ms tick loop, OSRS combat math, 12 skills,
  62 items, buildings, farming, quests, clue scrolls, a dungeon, save/load with offline
  progression.
- **Visuals (the dead end):** nearly every mesh was procedurally assembled three.js
  primitives with Canvas-2D-painted textures. That ceiling is why we moved.

**"2D → 3D" is a misnomer and it matters.** The game was *already* 3D. What makes it read
as flat is that the camera is **orthographic and locked** at 35.264° pitch / 45° yaw and
never moves. **We are keeping that framing.** So the migration is precisely
*procedurally assembled primitives → authored low-poly models, under the same fixed
isometric camera.*

That fixed camera is not an aesthetic choice, it is a **budget** choice. Models only ever
have to look right from one angle: backfaces never show, buildings need no real backs,
interiors need no detail. Against a 256–384 MB WebGL heap that saving is what makes the
art budget survivable at all. Write this into any art decision you make.

---

## 2. The constraint that governs everything

**Unity WebGL on mobile browsers is Unity's weakest target, and it is our *primary* one.**
Every decision below is downstream of these limits:

| Limit | Consequence |
|---|---|
| **Single-threaded** | No Job System, no Burst, no `System.Threading`. All ported systems are plain single-threaded C#. |
| **Fixed heap; iOS Safari kills tabs that exceed it** | Budget 256–384 MB. Total loaded assets is the real art budget. An iOS tab reload *is* the OOM symptom. |
| **Download size is the retention cliff** | Target **< 40 MB Brotli**. Currently at **~20.72 MB (~52%)**. |
| **No Fullscreen API on iOS Safari** | This is *why* PWA install matters. A home-screen launch with `display: standalone` is chrome-less; a Safari tab never will be. The manifest is a functional requirement, not polish. |
| **Audio needs a user gesture on iOS** | First-tap unlock is mandatory and already implemented in the template. |
| **No IL2CPP native plugins, limited texture formats** | Ship **ASTC** with an uncompressed fallback. |

**Standing rule: a thing that only works in the Editor does not work.** Every phase is
validated on a real iPhone in Safari and a real mid-range Android in Chrome.

---

## 3. Where we actually are

### Done

| Phase | State |
|---|---|
| **0 — Freeze & spec** | `docs/PORTING_SPEC.md` merged, `WIKI.md` regenerated, `legacy/threejs` pushed. |
| **1 — Unity skeleton + WebGL/PWA pipeline** | **Proven end to end.** Builds, deploys, serves correct headers, installs to a phone home screen. |
| **2a — Foundation** | `Mulberry32`, `Grid` worldgen, `AStar`, `TickRunner`. Byte-identical to TypeScript. |
| **2b — State & persistence** | `GameState`, components, XP/mastery curves, save serialization, sanitizer, offline progression, `FS.syncfs` flush. |
| **2c — Combat** | Full resolution: accuracy/max-hit, three styles, Resolve, six specials, three affixes, drop tables, boss enrage/slam. Roll-for-roll identical to TS. |
| **A** | CI restored from 30+ consecutive failures to green; content data-loss trap closed. |
| **B** | World generation pinned against a committed golden; URP/Lit pinned into the build. |
| **C** | Monster models optimised — build 34.82 MB → **20.72 MB**. |
| **D — Remaining systems** | **All twelve ported.** See §5. |

### Not done — this is the actual to-do list

| Phase | What | Blocked on |
|---|---|---|
| **E** | Editor-lane cleanup round | **A Mac with the Unity Editor.** See §8 — this is the next thing to do and it is what this handoff is for. |
| **F** | Landing page, install instructions, wiki rendered from JSON, itch.io mirror | Nothing. Pure code lane. |
| **G** | Device acceptance: home-screen install, safe areas, offline relaunch, **save durability** | A phone. |
| **3** | Input & mobile UI in UI Toolkit — rebuild every panel from `src/ui/UI.ts` | Nothing. Large. |
| **4–8** | Art bible → world art → characters → audio → perf hardening | Phase 3-ish. |
| **9** | Cutover: delete `src/`, `public/`, `scripts/`, `tests/`; move `unity/` into place | Everything else. |

**Nothing is deleted or replaced until Phase 9.** The web build still works and still
passes its own tests; it is the reference implementation and the safety net.

---

## 4. The single most important architectural decision

`Isoperia.Core.asmdef` is declared **`noEngineReferences: true`**.

This means the entire ported game — every system, all the state, the save format, the
combat math — **compiles and runs with any C# compiler, with no Unity licence, in about a
second.** It is why ~378 assertions can be verified in a container that has no Editor.

**Do not add a `UnityEngine` reference to `Isoperia.Core`.** If a ported system seems to
need one, it needs an interface instead. That is what `IGridLike` and `IRandom` are for.
Everything Unity-specific lives in `unity/Assets/Isoperia/Unity/Runtime/`, which is a
separate assembly and is *not* verified outside the Editor.

### The corollary: `mcs` is a second compiler, and it disagrees silently

The container tests with Mono's `mcs`; Unity builds the same source with Roslyn. **Three
disagreements are confirmed.** Two produced no warning at all and changed behaviour:

1. **Tuple swap.** `(a[i], a[j]) = (a[j], a[i])` was miscompiled into list indexer calls,
   corrupting the A* binary heap so anything beyond an adjacent tile returned `null`.
   `AStar.Swap` is written longhand with an explicit temporary because of this.

2. **Digit separators.** `20_000` parses as `200000`. `3_600_000` as `366000000`.
   `1_787_000_000_000` as `17787000000000000`. It compiles and runs with different
   numbers. This hides *especially* well: a test comparing two mangled constants still
   passes, because they usually scale together — a 20 s interval and a 60 s window are
   both ten times too large, so "three logs per minute" held while both numbers were
   wrong. It only surfaced where a literal met real data from the content JSON, which is
   parsed at runtime and therefore correct. **`npm run verify:separators` now bans them
   from Core.**

3. **Ternaries over named-tuple arrays.** `(string Id, int C)[] x = c ? new[] {("a",1)} : …`
   is rejected with a CS0029 naming the *same type* on both sides. At least this one is
   loud. `DungeonSystem.MonsterRow` is a named struct for this reason.

**Rule: when a C# feature has a plainer equivalent, prefer the plainer one in this
assembly.** Also documented in `unity/Assets/Isoperia/README.md`.

---

## 5. What is ported, and the guarantees that hold it together

All of `src/systems/` now has a C# counterpart in
`unity/Assets/Isoperia/Core/Runtime/Systems/`:

`BuildingSystem` · `ClueSystem` · `CraftingSystem` · `DungeonSystem` · `FarmSystem` ·
`LabourSystem` · `MapSystem` · `MetaSystem` · `MovementSystem` · `NpcSystem` ·
`QuestSystem` · `ShopSystem` · `SkillSystem`

### Randomness is injected, and **draw order is part of the contract**

Every system takes an `IRandom` rather than calling a global. This is what makes
roll-for-roll parity with the TypeScript possible at all (the TS calls `Math.random()`
directly and cannot be checked this way).

**Getting draw order wrong leaves every formula correct and still produces a different
game from the same seed.** It is documented per method. Examples that are already pinned:

- A **guaranteed special** skips the accuracy draw entirely.
- A **tertiary drop that misses** takes no quantity draw.
- An **affix roll** takes one value when it fails and two when it succeeds.
- `DungeonSystem.ChestLoot`: one draw per stack in table order, then the iron sword, then
  the shortbow **only if the sword missed** — so the two are mutually exclusive *and the
  second draw does not always happen*.

If you add a system, document its draw order in the XML doc comment and assert the **draw
count** in a test, not just the outcome.

### `DungeonSystem` is worth knowing about specifically

- **The layout is fixed, not generated.** Five hand-placed rooms and carved corridors,
  identical on every run and every floor. This is deliberate: the Caves quest routes the
  player key → door → brute, and a procedural layout would have to guarantee that ordering
  anyway. What varies per floor is the monster pool and the chest, not the map. The tests
  pin the route with A* directly — the exit is **unreachable** while the door is sealed and
  reachable after `Unlock()`.
- **Spawning returns *what* to spawn** (`List<DungeonSpawn>`) rather than reaching into a
  combat system the way the TS does. The dungeon is therefore testable without one, and the
  caller decides how a monster becomes an actor.
- **Placement is deterministic, no `IRandom`:** the nth monster takes spot
  `(n * 7919) % spots.Count`. 7919 is prime, so it strides rather than clusters.

### Content data flow

`src/data/*.ts` → `scripts/export-content.cjs` → JSON in
`unity/Assets/Isoperia/Resources/Content/` → C# `ContentDatabase` at runtime.

JSON rather than ScriptableObjects **on purpose**: it keeps `gen-wiki` alive, so the
website's wiki page is generated from the same source of truth the game loads and can
never drift from the build.

Two things to know:

- **`UNITY_AUTHORED`** — a set in the exporter (currently `quests.json`) of files that are
  authored on the Unity side and must not be overwritten. The exporter **refuses** on drift
  rather than clobbering. `ISOPERIA_FORCE_EXPORT=1` overrides. This exists because the
  exporter once silently deleted four quests.
- **`src/data/Shop.ts`** was extracted out of `src/systems/ShopSystem.ts` (which imports
  three.js and therefore cannot be exported from) and re-exported, so the web build is
  unchanged. If you hit "I can't export this table, it's tangled in a system file", that
  is the pattern to follow.

---

## 6. Verification — what to run and what each thing proves

Everything here runs in a plain Node + Mono container with **no Unity licence**.

```bash
npm run verify:core        # 378 assertions — every ported system, run outside Unity
npm run verify:parity      # C# vs TypeScript: world gen, XP curve, combat, byte-identical
npm run verify:json        #  72 — Core's own JSON parser vs Node's, incl. malformed input
npm run verify:sanitizer   #  84 — save sanitizer vs TS over an adversarial corpus
npm run verify:content     # TS → JSON → C# loader, 261 lines identical
npm run verify:world       # 126×126 world golden, 48,024 lines, against a committed dump
npm run verify:pwa         #  18 — the PWA template really has what it claims
npm run verify:scene       # every renderer in the scene is painted
npm run verify:shaders     # URP/Lit is pinned into Always-Included
npm run verify:models      # per-model size budget
npm run verify:separators  # bans digit separators from Core (see §4)
npm test                   # the ORIGINAL TypeScript game: 321/321 + rig + UI audit
```

**Current state: all green.** `npm test` still passes 321/321 — the reference
implementation has not been broken by any of this.

### Mutation testing is the standard here, not a nicety

**A test that passes is not evidence. A test that fails when you break the code is.**
Every system ported in Phase D was validated by deliberately breaking the production code
and confirming the suite goes red. This has repeatedly caught tests that proved nothing:

- Four weak tests were found and rewritten this way (Shop's min-coin floor, Clue's payout
  draw order, Quest's pays-once guarantee, Npc's movement cap and radius).
- On `DungeonSystem`, 11 mutants were run and 2 initially **survived**: "spawn tiles are
  distinct" did not pin the prime stride (a stride of 1 is also distinct — the placement
  is now pinned as a golden), and the entrance tests did not pin the far-corner search
  window until one gave the sweep a *nearer tile outside it* to prefer.

**Never use `Assert.Ignore` or `Assert.Pass`.** A test that ignores itself reports green
while proving nothing. This was caught and reverted twice.

### The NUnit shim

`tools/parity/NUnitShim.cs` lets the EditMode tests run outside Unity. It deliberately
lives **outside `Assets/`** — inside, Unity would compile it and it would collide with the
real NUnit from the Test Framework package.

**The tests are written against genuine NUnit and are never reworded to suit the shim.**
If a construct isn't supported, *the shim grows*. A test that has to be reworded to run
outside Unity is no longer the same test.

---

## 7. CI/CD — it is fully automatic, do not deploy by hand

Three workflows in `.github/workflows/`:

| File | Trigger | Does |
|---|---|---|
| `ci.yml` | push to **any** branch | tsc, vite build, `npm test`, audits |
| `unity-webgl.yml` | push to **`main`** + `workflow_dispatch` | preflight → GameCI WebGL build → Netlify deploy |
| `unity-activation.yml` | manual | Unity licence activation helper |

**Push to `main` and the game rebuilds and redeploys itself.** Nobody needs to run a
build locally to ship. Last known good: preflight 14s, build 15m18s, deploy 1m21s.

- **Live:** <https://inspiring-tarsier-8973d6.netlify.app>
- **Netlify is a dumb host.** It receives a finished directory. All the intelligence is in
  the workflow.
- **Secrets required:** `UNITY_LICENSE`, `UNITY_EMAIL`, `UNITY_PASSWORD`,
  `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`. All configured.
- **Headers matter more than they look.** `.br` files must be served with
  `Content-Encoding: br` and `.wasm` as `application/wasm`. Getting this wrong is the #1
  cause of "Unity WebGL works locally, fails when hosted". The deploy job `curl`s and
  verifies this on every run, and the result is committed to `unity/deploy-report.txt`.

**Evidence lives in the repo, not in chat:** `unity/build-report.txt`,
`unity/deploy-report.txt`, `unity/test-results.xml`.

### Two CI traps already paid for

- **Never put a timestamp in generated output.** `gen-wiki.cjs` embedded
  `new Date()`, which made CI red *by construction* — the committed file could never match
  a regenerated one. The first fix (derive the date from `git log`) *also* failed, because
  `actions/checkout` does a **shallow clone** and the fallback produced today's date. The
  date was removed entirely.
- **`optimize-glb.cjs` silently did nothing** because it `require`d `playwright` and the
  environment had `playwright-core`. It now tries both names and returns `null` loudly.
  This is why the models were 3× too big for weeks.

---

## 8. **Phase E — the Mac work. This is what to do next.**

These three items **cannot be compile-checked in the container** because they touch
`UnityEngine` types or need the asset importer. They are bundled into one Editor round on
purpose. Do them together, verify, commit, push to `main`, let CI redeploy.

### E1 — Refresh the stale `dire_wolf` mirror  *(size win, ~3 MB)*

```
unity/Assets/Isoperia/Resources/Art/OwnedModels/dire_wolf.glb  —  3.07 MB, STALE
```

The source was optimised; this shipped mirror was never refreshed, so **this 3.07 MB is
what the build still ships.** The container can't fix it (the `.glb` files here are Git
LFS pointers — 131 bytes — and there is no `git-lfs` in this environment).

**Run in the Editor:**
`Isoperia.EditorTools.IsoperiaOwnedModelPreparation.SyncEncounterActors`

`CopyIfStale` already replaces a mirror whose size differs from its source, so this should
just work. Confirm with `npm run verify:models` — the WARN should disappear.

### E2 — `EnsureUrpLitIsAlwaysIncluded`

Verify this actually runs in the build path and that URP/Lit survives shader stripping.
`npm run verify:shaders` checks the *pinning*; only a real build proves the *stripping*.

### E3 — The misleading `Shader.Find` fallback (12 sites)

12 call sites across `unity/Assets/Isoperia/Unity/Runtime/*View.cs` use:

```csharp
Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard")
```

**This fallback is unreachable and the pattern is a lie.** `Shader.Find` returns the
shader if the *shader* exists, regardless of which render pipeline is *active*. It never
tested the pipeline, so the "safety net" never fired — which is exactly how the magenta
bug shipped (see §9). Either make it genuinely test
`GraphicsSettings.currentRenderPipeline`, or delete the fallback and let it fail loudly.
**Do not leave it as-is.** Files: `WorldBuildingView`, `WorldTownView`,
`WorldPlayerAvatarView`, `OpenWorldHorizonView`, `WorldDecorationView`,
`OpenWorldTerrainView`, `WorldEnvironmentView`, `WorldDungeonView`,
`WorldActionFeedbackView`, `WorldCombatView`, `WorldBiomeLandmarkView`, plus
`IsoperiaBuild.cs`.

### E4 — Commit the missing `.meta` files ⚠️

**This one will bite you if you don't expect it.** 19 `.cs` files written in the container
have **no `.meta` file**, because generating one requires the Editor:

```
unity/Assets/Isoperia/Core/Runtime/Systems/  ClueSystem  DungeonSystem  FarmSystem
                                             LabourSystem  MapSystem  MetaSystem
                                             NpcSystem  QuestSystem  ShopSystem
unity/Assets/Isoperia/Core/Tests/            ClueSystemTests  DungeonSystemTests
                                             FarmSystemTests  LabourSystemTests
                                             MapSystemTests  MetaSystemTests
                                             NpcSystemTests  QuestSystemTests
                                             ShopSystemTests  TestContent
```

Unity generates these on first open. **`git add` them and commit** — uncommitted `.meta`
files cause GUID churn and broken references for the next person to open the project.

---

## 9. Bugs already fixed — read this before you "fix" them again

- **Magenta octagon on device.** `m_CustomRenderPipeline: {fileID: 0}` — the URP *package*
  was installed but the *pipeline asset was never assigned*. Fixed by creating and
  assigning a URP asset to graphics defaults **and all 6 quality levels**. Both halves
  matter.
- **3 of 5 cubes magenta.** `Paint()` did `DeleteAsset` + `CreateAsset` on every call,
  orphaning shared references. Now creates each named material **at most once**.
  *Worth noting how this was missed:* an earlier verification recorded "each material GUID
  referenced exactly once" as a pass — the proof was in the output and was misread;
  `ReferenceStone` had 4 users. **Read your own verification output adversarially.**
- **Exporter deleting 4 quests** → `UNITY_AUTHORED` + drift refusal (§5).
- **Invented building-type list** in the sanitizer would have deleted every storage bin
  and farm plot on load.
- **Fallback item catalog** clamped the player's coins at the resource cap.
- **JSON grammar too loose** — accepted `01` and `.5`.
- **Array-vs-map shape assumptions, twice.** `RECIPES`/`QUESTS` are arrays; so are
  `VILLAGERS`/`CRITTERS`. A `Members.Keys` spawn loop would have spawned nobody. **Check
  the actual shape in `src/data/`; don't assume.**
- **Budget arithmetic.** A report of "68.5 MB against a 40 MB budget — 171%" was wrong:
  that is Unity's *uncompressed* total. The **compressed download** was 35.06 MB = 88%,
  *under* budget. Always compare the compressed number.

---

## 10. Repo layout and conventions

```
src/            TypeScript game — STILL THE REFERENCE IMPLEMENTATION, still passing
                321/321. Do not delete until Phase 9.
  data/         content tables → exported to JSON
  systems/      the TS originals every C# port is checked against
public/         icons (62), models (4 rigged GLB), music (3), sfx (23), sky.jpg
scripts/        *.cjs — export, verification, wiki, deploy reporting
tests/          qc.test.ts, the 321 assertions
tools/parity/   NUnitShim.cs + the parity harnesses (outside Assets/ on purpose)
unity/
  Assets/Isoperia/
    Core/       noEngineReferences — the port. Runtime/ + Tests/
    Unity/      MonoBehaviours, views, the Unity-only half
    Editor/     IsoperiaBuild.cs, IsoperiaOwnedModelPreparation.cs
    Resources/  Content/ (exported JSON), Art/OwnedModels/
    WebGLTemplates/IsoperiaPWA/   manifest, service worker, loading screen, audio unlock
docs/           PORTING_SPEC · EDITOR_LANE · CI_DEPLOY · ART_BIBLE · ASSET_CREDITS
                UNITY_MIGRATION · WORLD_LAYOUT · MAINLAND_*
```

### Conventions that are not negotiable

- **Branch:** develop on `claude/unity-engine-migration-roadmap-fz9w8y`, merge to `main`
  regularly. **No PRs unless explicitly asked.**
- **Comments explain *why*, never *what*.** Every non-obvious decision in the ported code
  carries a comment saying what would go wrong otherwise. Match that density.
- **Evidence gets committed**, not pasted into a chat message.
- **The container cannot push tags or delete remote refs** — the git proxy rejects both
  (403 / hang-up). `web-final` exists locally only; it is the same commit as
  `origin/legacy/threejs`. Push it from a real machine if you want it on the remote.

### Current world/save facts

- Mainland is **126×126** (migrated up from 42×42). Note `docs/PORTING_SPEC.md` still says
  42×42 in places and is marked as stale there.
- Save version **2.2.0**; saves below that get a mainland migration.
- **`FS.syncfs` is mandatory.** WebGL persists to IndexedDB via `persistentDataPath`, and
  **a save that isn't explicitly flushed is lost on tab close.** This is a classic WebGL
  data-loss bug, it is implemented, and **it is the one thing no test suite can prove** —
  it needs a real device, backgrounded, killed, and relaunched. That is Phase G.

---

## 11. Loose ends

- 5 merged remote branches could be deleted (cosmetic).
- `web-final` tag is local-only (see above).
- `docs/PORTING_SPEC.md` has sections marked stale re: world size.
- Higgsfield balance was **168.45 credits**. Standing rule is **free assets first** —
  Kenney, Quaternius, Poly Pizza, CC0 packs — with credits spent only where nothing free
  fits. 168 credits does not cover 12 monsters + 7 NPCs + 8 buildings + 8 weapons at
  ~15 cr/character, so they must go where they're irreplaceable.
- **The Humanoid retargeting win:** all four owned rigs share the same 24-bone Meshy
  skeleton. Import as Unity **Humanoid** and Mecanim retargets any clip onto any rig
  regardless of proportions. This *deletes* the `ClipLibrary` / `verify-rig.cjs` machinery
  rather than porting it, and means a new character costs a mesh, not a mesh plus an
  animation set. Verify on the worst pair — hero vs `forest_ogre` — since if it holds
  there it holds everywhere.

---

## 12. If you only remember five things

1. **`Isoperia.Core` has no engine references.** Keep it that way; that is what makes any
   of this verifiable without a licence.
2. **`mcs` disagrees with Roslyn silently.** Prefer plain C# in Core. Run
   `npm run verify:separators`.
3. **Draw order is a contract.** Assert draw *counts*, not just outcomes.
4. **Mutation-test.** Break the code on purpose; if the suite stays green, the test is
   worthless. Never `Assert.Ignore`.
5. **Push to `main` and it ships itself.** Don't deploy by hand.
