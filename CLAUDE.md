# Alderfell — project context

A third-person high-fantasy action-RPG, **mobile-first** (iOS/Android) with PC
parity, built in Unity 6 URP by a solo dev with AI assistance and **zero cash
budget**.

**Read [`docs/GDD_ALDERFELL.md`](docs/GDD_ALDERFELL.md) before design work.** It is
the bible and it is current. This file is the operating summary.

> This repo previously held **Isoperia**, a 2.5D isometric web RPG. Its simulation
> was good; its flat procedural tile world was not. Alderfell keeps the simulation
> and replaces the world. Legacy `src/` (three.js) is reference only — do not
> develop it. Active development is `unity/`.

## The pillars — these settle arguments

1. **The world is the product.** Every zone hand-composed. If you can spin the
   camera 360° and no frame is worth a screenshot, it isn't finished.
2. **Earned, not idled.** No offline progression, no automation. Progress means
   going somewhere and doing something.
3. **Readable depth.** Deep numbers underneath, legible feedback on top.
4. **Built single-player, shaped for MMO.** The sim is written as if a server owned
   it, so multiplayer is a milestone rather than a rewrite.
5. **It has to run beautifully in your hand.** Mobile is a design constraint, not a
   port target.

## Hard rules — do not break these

- **`Isoperia.Core.asmdef` must keep `noEngineReferences: true`.** No `using
  UnityEngine` anywhere under `unity/Assets/Isoperia/Core/`. This one line is what
  makes CI free and the future server possible. If a change seems to need it, the
  change is wrong.
- **The Unity layer decides nothing.** Damage, loot, XP, gathering, growth and
  cooldowns resolve in Core against the seeded `Mulberry32` RNG. Presentation
  reads Core state and sends Core commands.
- **Player intent is a command object**, never a direct state write and never
  `transform.position = …`. Commands must serialize over a wire unchanged.
- **Content is JSON**, loaded via `ContentDatabase`'s reader delegate. Not
  ScriptableObjects — those are a UnityEngine dependency the server can't share.
- **No fallback content paths.** `ContentException` on missing or malformed content
  is deliberate; a fallback catalog once silently clamped a 2400-coin payout to 500.
- **Nothing that costs money.** No paid asset stores, no paid generation services,
  no paid plugins. If a task seems to need one, say so rather than assuming spend.
- **No monetization in v1.** No ads, no IAP, no store, no entitlement checks. The
  game ships free on itch.io (GDD §22). Cosmetics are revisited at the MMO
  milestone, where modular characters make them viable — not before.
- **Telemetry is local-only.** Balance and performance data is written to a file on
  the device and never transmitted. That is what keeps the game free of privacy
  policies, consent flows and a backend.
- **No user-facing string is a literal in code.** Every one is a key into a locale
  JSON (GDD §25.1). English is the only locale at v1; the discipline is what makes
  adding a second one a translation job rather than a refactor.

## Performance budget — art that misses this is rebuilt, not shipped

Target: mid-range Android (~Snapdragon 7-series, 3 years old) at **30 FPS locked**.

| | |
|---|---|
| Triangles on screen | ~150k |
| Draw calls | ~120 |
| Lights | 1 directional + baked lightmaps |
| Post | Fog, colour grading, light bloom only. No SSAO/SSR/volumetrics. |
| Textures | ~500 MB, ASTC, atlased |
| Build size | < 2 GB, Addressables-streamed |

The iPhone used for testing is **far** more powerful than this. The budget is the
spec; the iPhone is convenience.

## Architecture

```
Isoperia.Core  (noEngineReferences — the future server)
  tick · RNG · combat math · skills · inventory · crafting
  quests · clues · A* · save · content
        ▲ commands          │ state
Isoperia.Unity  (presentation only — decides nothing)
  rendering · animation · input · audio · UI
```

## Where things are

| Path | What |
|---|---|
| `unity/Assets/Isoperia/Core/` | The simulation + NUnit tests. Engine-agnostic. |
| `unity/Assets/Isoperia/Core/Runtime/Systems/` | Skills, crafting, quests, combat, farming… |
| `unity/Assets/Isoperia/Art/` | Models, shaders |
| `unity/Assets/Isoperia/Editor/` | Build and asset-prep tooling |
| `docs/GDD_ALDERFELL.md` | The bible |
| `docs/ASSET_ADMISSION.md` | The gate every incoming asset passes |
| `.claude/skills/` | Repeatable procedures — see below |
| `src/`, `web/`, `assets/`, `public/` | Legacy prototype + shared art. Reference only. |

## Two machines, two kinds of session

- **Remote (this repo, no Unity/Blender):** design, C# systems, content JSON,
  shaders, CI, tooling, docs.
- **Local (Mac mini, Unity MCP + Blender MCP):** editor work — terrain, prefabs,
  scenes, asset import, builds.

Skills for the jobs you'll do fifty times: `build-region`, `import-asset`,
`add-content`.

## World construction — four layers

Each owns something the others can't produce. Full detail in GDD §18.

1. **Unity Terrain** — walkable ground, collision, LOD (~25k tris)
2. **Blender hero landforms** — silhouette: cliffs, arches, plateaus (4–8/region)
3. **Modular kit** — the built world, GPU-instanced (~15 pieces)
4. **Scatter** — grass, trees, rocks, billboard LOD, fog-culled

All four map to **one shared gradient atlas** — that's what makes CC0 assets from
different sources look like one game, and the whole world resolve to 3 materials.

## Toolchain (all free)

Unity 6 Personal · Blender · Mixamo (rig + animation) · Xcode · GIMP/Krita ·
Audacity · CC0 libraries (Quaternius, Kenney, Poly Haven, ambientCG, Freesound) ·
Unity Asset Store free tier.

**Removed:** Meshy, Higgsfield, Tripo and all paid generation services.

## Commands

```bash
# Core simulation tests — no Unity licence needed
dotnet test unity/Assets/Isoperia/Core/Tests/

# Unity Editor tests and builds run on the Mac mini, or in unity-build.yml
```

## Conventions

- Match the surrounding code's comment density. This codebase explains **why**,
  often citing the bug that motivated a rule — keep that habit, it's load-bearing.
- Content and design changes go in the GDD first, then the code.
- Never commit `.blend` working files or raw source art; only game-ready assets.
  Git LFS free tier is ~1 GB.
