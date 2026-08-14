# isorpg — 2.5D Isometric RPG & Settlement Builder

A hybrid **Settlement Builder + Character-Centric RPG** web game inspired by OSRS,
Melvor Idle, Townsmen and OldSchoolBot — built **mobile-first** with three.js and
vanilla TypeScript (no UI framework), fully **offline-capable**.

## The spec we're building to (GDD `<isorpg>`)

- **2.5D isometric**, orthographic camera (pitch `35.264°`, yaw `45°`), 600ms tick
  engine decoupled from `requestAnimationFrame`.
- **Zero external assets** — every mesh/texture is generated at runtime from
  Three.js primitives + Canvas 2D textures.
- **Decoupled ECS** — `components/` hold data, `systems/` hold logic.
- **Persistent state** — `localStorage` primary save + `IndexedDB` backup, sanitized
  JSON import/export, rollback recovery, offline idle progression.
- **A\* pathfinding** (8-way, diagonal, dynamic obstacles).

## Current milestone (M3 — artisan skills & settlement building)

- Isometric render, camera pan/zoom (touch-drag + pinch on mobile; mouse/wheel + WASD on desktop).
- 20×20 procedural world: terrain (grass/dirt/sand/rock/water), zones, occupancy.
- Tap-to-walk with A\* routing (trees/rocks are approached then harvested).
- **Woodcutting, Mining, Fishing** with OSRS XP curve, per-item mastery (double-drop
  and speed bonuses), weighted drops, depleting & respawning nodes.
- **Combat**: 600ms tick engine, OSRS-style damage rolls, auto-eat, weighted
  main/tertiary/pet drop tables, boss KC, monster respawns.
- **Cooking / Smithing / Carpentry**: tick-based active crafting with item
  mastery (preserve-material chance + speed), cooking burn chance. Smithing
  and Carpentry recipes require the matching settlement building.
- **Settlement building**: tap-to-place Town Hall, Storehouse, Sawmill,
  Smelter, Granary with tile validation (green highlight). Passive per-tick
  yields (logs→planks, ore→bars, food trickle, gold tax), Storehouse raises
  inventory cap, Town Hall extends offline idle cap (8h→12h).
- Inventory + HUD, settings (export/import/reset), toasts, offline-away summary.

## Up next (M4+)

Collection log UI + milestone rewards, dungeons & boss chambers, more
wilderness zones, equipment/armor slots, region unlocking.

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
```

Requires a modern browser with WebGL.