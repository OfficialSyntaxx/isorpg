# Isorpg — 2.5D Isometric Settlement Builder & RPG

A fully playable, single-package web RPG built on **Three.js** with an orthographic
isometric camera (`35.264°` tilt, `45°` yaw). Hybrid *Settlement Builder + RPG* in
the spirit of *Old School RuneScape*, *Townsmen* and *Melvor Idle*. Zero external
asset dependencies — every mesh, texture and UI element is generated procedurally.

**Run it:** serve the folder over HTTP (no build step) and open `index.html`.

```bash
# any static server works, e.g.
python3 -m http.server 8080
# then open http://localhost:8080
```

Three.js is loaded from a CDN via an import map; everything else is local
vanilla ES modules.

---

## Architecture

`js/` is cleanly modularized (plain ES modules, no framework):

| Module | Responsibility |
|---|---|
| `engine.js` | WebGL renderer, orthographic isometric camera, lighting + shadows, ground raycasting, resize |
| `tilemap.js` | Seeded world generation (settlement / forest / mines / lake / wilderness / dungeons) + `InstancedMesh` tile renderer |
| `pathfinding.js` | A* (8‑directional, corner‑cut prevention) on the 2D grid |
| `hero.js` | Procedural low‑poly hero, tile‑to‑tile movement with walk/bob animation |
| `entities.js` | Procedural building / node / monster meshes, HP bars, selection highlight |
| `game.js` | Central state, deterministic tick engine, skills, resources, offline / passive economy |
| `skills.js` | Gathering (woodcutting/mining/fishing), crafting recipes, node deplete/respawn |
| `combat.js` | OSRS‑style tick combat: accuracy, damage rolls, crits, auto‑eat, loot, player death |
| `data.js` | All tuning tables (skills, items, buildings, monsters, nodes, quests) |
| `save.js` | localStorage persistence + rolling backup, JSON export/import, deep sanitization with rollback |
| `ui.js` | DOM overlay UI: top bar, action dock, context panel, inventory/skills/quests, build palette, settings/save modal |
| `main.js` | Boot, input (click/pan/zoom/keys), quests, autosave, the game loop wiring |

**Ticks are deterministic.** Game logic runs on a fixed `setInterval` tick
(default 600 ms — changeable in Settings), fully independent of the `requestAnimationFrame`
render loop.

---

## Core features

- **Point‑and‑click control** — click a tile to walk (A* pathing), click a tree/rock/fish
  spot/monster to auto‑path to it and start the loop.
- **Settlement building** — build menu with cost + Construction‑level requirements,
  green/red placement validity, buildings that produce passive income, raise resource
  caps, buff skills, or extend the offline idle cap.
- **10 skills** — Woodcutting, Mining, Fishing, Carpentry, Smithing, Construction,
  Aetherurgy (alchemy), Attack, Defense, Health — each with an XP curve and crafting tree.
- **Offline idle gains** — on load, elapsed time is rewarded as passive resource income,
  hard‑capped at 8 hours (extendable with Houses / Town Hall). A modal reports your gains.
- **Tick combat** — accuracy vs. defense, damage ranges, 10% crits, monster loot tables,
  auto‑eat below a configurable HP threshold, food healing, and a soft death (respawn at home).
- **Quests** — 8 goals (gather, skill, kill, build, explore) with gold rewards.
- **Save system** — autosaves every 30 s; manual save; **Export to `.json`** or copy a
  base64 string; **Import** to restore; all loaded data is deeply sanitized and rolls
  back to the last stable autosave if a malformed/injected save is detected.

## Controls

| Input | Action |
|---|---|
| Left‑click | Walk / interact (gather, fight, inspect building) |
| Right / middle‑drag | Pan the camera |
| Mouse wheel | Zoom |
| WASD / arrows | Pan |
| Esc | Close panel / cancel placement |

## Layout notes

- World is **72×72** tiles seeded deterministically. Settlement core is centered;
  forest (N/NW), mines (E), a fishing lake (SW), wilderness ring (monsters), and
  dungeon corners (bosses) extend outward.
- Building footprint clashes, water and resource nodes are collision obstacles for A*.

## Roadmap hooks

Expansion points already stubbed in `data.js`: new buildings, monsters, recipes,
quests and zones are data‑only additions; the map scales past 100×100 behind the
existing chunked `InstancedMesh` approach.