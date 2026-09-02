# Alderfell

> *You wash up on the coast of a fallen realm with nothing, and you climb —
> through its forests, its ruins and its guilds — until the realm knows your name.*

A **third-person high-fantasy action-RPG** with deep skill progression, built
**mobile-first** in Unity 6 (URP) and shipping to PC from the same build.
Single-player at launch, architected from day one to become an MMO.

**Status:** pre-production. Design is locked; see **[the GDD](docs/GDD_ALDERFELL.md)**.

---

## What this is

Hand-authored, seamless regions with real elevation and composed sightlines —
the opposite of a procedural tile plane. A stylized painterly art direction that
runs at 30 FPS on a mid-range phone. OSRS-style skill and combat math underneath,
modern tab-target combat with abilities on top.

**The five pillars** (these settle every argument):

1. **The world is the product.** Every zone is hand-composed. If you can spin the
   camera 360° and no frame is worth a screenshot, the zone isn't finished.
2. **Earned, not idled.** Progress comes from going somewhere and doing something.
   No offline progression, no automation.
3. **Readable depth.** Deep numbers underneath, legible feedback on the surface.
4. **Built single-player, shaped for MMO.** The simulation is written as if a
   server owned it, so multiplayer is a milestone rather than a rewrite.
5. **It has to run beautifully in your hand.** Mobile is a design constraint, not
   a port target.

## The game

| | |
|---|---|
| **World** | 5 hand-authored seamless regions (~1.5km²): the Shorelands, Hearth's Landing, Thornwood, Kingsmoor Ruins, Coldreach Pass |
| **Character** | Custom avatar, no classes — your build comes from skills and gear |
| **Progression** | 12 skills to level 50, per-item mastery, a five-act rise from castaway to legend |
| **Combat** | Tap-target with abilities over a 600ms tick sim. Melee / Ranged / Arcane |
| **Loot** | Drops are bases and components; crafting refines and enchants them |
| **Death** | Tiered by region — from no penalty in town to full item drop in the deep wilds |
| **Content** | 5 main quests, ~20 side quests, 3 clue-trail tiers, 2 dungeons, 3 bosses |
| **Housing** | A personal instanced home with functional rooms — workshop, forge, kitchen, garden |
| **Controls** | Virtual joystick + tap-to-move for long travel, contextual interact, minimal HUD that fades out of combat |

## Where this came from

This repository previously held **Isoperia**, a 2.5D isometric web RPG and
settlement builder. Its simulation was solid and well-tested; its world — a flat
procedurally-generated tile plane at a fixed isometric angle — was not something
anyone wanted to look at.

Alderfell keeps the simulation and replaces the world. Roughly **80% of the
systems carry over**:

- `unity/Assets/Isoperia/Core/` — an engine-agnostic C# assembly with **no
  UnityEngine dependency** and a full NUnit suite. Tick engine, deterministic RNG,
  combat math, A* pathfinding, skills, crafting, quests, clue scrolls, shops,
  inventory, save/sanitize. This is also the shape a future authoritative server
  needs, which is why P4 above is affordable.
- **Art:** 8 rigged/static GLBs, ~80 item icons, 8 music tracks, SFX, and a
  vertex-color terrain shader.
- **Pipeline:** a verified character pipeline (concept → mesh → rig → animation →
  Unity import) with rotation-only retargeting, so one animation set serves every
  humanoid. See `ASSETS_PIPELINE.md`.

Cut deliberately: offline/idle progression, villager labour automation, the
settlement management sim, the isometric camera, and procedural terrain.

The `src/` three.js prototype and its docs remain for reference; active
development is in `unity/`.

## Repository layout

```
unity/                  Unity 6 URP project — the game
  Assets/Isoperia/Core/   engine-agnostic simulation + tests (carries over)
  Assets/Isoperia/Art/    models, shaders
  Assets/Isoperia/Editor/ build and asset-preparation tooling
docs/
  GDD_ALDERFELL.md        the design document — start here
  ART_BIBLE.md            visual direction (being revised against the GDD)
  ASSET_PIPELINE.md       character/asset production pipeline
assets/ · public/       models, icons, music, SFX
src/                    legacy three.js prototype (reference only)
```

## Roadmap

Milestones gate on demonstrable quality, not feature counts.

| | Milestone | Gate |
|---|---|---|
| **M0** | Beauty proof — the Shorelands, no systems | Does it look beautiful **on a real phone** at 30 FPS? |
| **M1** | Character in world — movement, camera, navigation | Movement feels good for 5 minutes straight |
| **M2** | Combat feel — tap-target, abilities, feedback | Killing one wolf is satisfying 20 times |
| **M3** | Vertical slice — Act I end to end | A stranger plays 45 minutes without guidance |
| **M4–M6** | Remaining regions, housing, dungeons, endgame | Each region passes the craft checklist |
| **M7** | Ship v1 — iOS, Android, PC | Shippable |
| **M8+** | MMO conversion | — |

M0 is the most important milestone in the plan. The previous project's failure was
building systems on top of a world nobody wanted to look at.

## Legacy prototype

The original three.js build still runs:

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
```
