# Isoperia Mainland World — 126×126 Plan

## Outcome

Replace the compact 42×42 prototype island with a **126×126 playable mainland**.
The game remains a hybrid third-person/orbit experience: players can travel
between a safe town, distinct biomes, resource loops, combat clearings, and
quest destinations without the world reading as a tiled board or floating
diorama.

The target is a coherent first mainland rather than an infinite map. Every
district needs a travel reason, a visible landmark, an activity loop, and a
route back to town.

## Non-negotiables

- No paid asset purchases. New art is owned, created in Blender, or imported
  only after its free license and Unity/URP compatibility are recorded.
- The Core grid remains deterministic from its seed; presentation never becomes
  the authority for movement, resources, combat, or saves.
- Existing saves are migrated deliberately. The migration preserves progression
  and inventory, relocates the player safely, and regenerates world-bound data
  that cannot be interpreted on the new mainland.
- Browser/WebGL and mobile remain first-class: chunked meshes, pooled/static
  decoration, bounded draw calls, no per-frame terrain allocation.

## Mainland layout

```text
                    [Frostwatch Highlands]
                  mines · crags · old observatory
                             │
        [Wildwood] ─── [Hearthvale] ─── [Ember Road]
     timber · shrine       town          Cinder Hollow
                             │                combat/dungeon
                   [Sunmere Fields]
                  farms · mill · coast
                             │
                      [Miregate Fen]
                  fishing · bog ruins · hazards
```

Hearthvale occupies the central 18×18 town district. Each outer district has
one main approach, one alternate return route, and an authored transition
(bridge, gate, ridge, ford, or coastal road). Water, cliffs, dense forest and
ruins are natural boundaries; invisible walls are not a progression tool.

## Phases

### M0 — Mainland contract and migration

1. Define `WorldSize = 126`, region/chunk dimensions, district IDs, and shared
   coordinate helpers. Do not scatter literal map dimensions through systems.
2. Replace the 42-only sanitizer bounds with a versioned mainland migration.
   Keep skill, inventory, journal, buildings where valid; relocate player and
   clear/reseed resource/occupancy data tied to obsolete coordinates.
3. Update deterministic generation tests, save-sanitizer tests, pathfinding
   cases, and migration fixtures. Add a test that an old save never spawns the
   player outside the mainland.
4. Deliverable: a fresh 126×126 Core world with a safe migrated save and no
   visual dependency.

### M1 — Terrain, coast, and traversal scale

1. Generate seeded mainland terrain with broad elevation fields, river/coast
   shapes, roads, and biome transition bands—not per-tile confetti.
2. Build chunked terrain meshes (initially 18×18 chunks), colliders only near
   player travel space, and a coast/horizon presentation that does not expose a
   rectangular world edge.
3. Add route-aware third-person travel: camera obstacle handling, sprint/walk
   tuning, grounded slopes, water/steep-slope boundaries, and a player locator.
4. Deliverable: a five-minute town-to-biome traversal loop that feels grounded
   in Play Mode.

### M2 — Hearthvale town and settlement life

1. Author a dense central town: plaza, homes, market, forge/work yard, inn,
   water source, farm edge, storage and construction plots.
2. Replace capsule NPC fallbacks with free/owned character models where the
   importer and animation pipeline validate; retain robust fallback prefabs.
3. Give each service NPC a location, role, dialogue hook, and nearby functional
   objects. Keep clear routes and interaction colliders consistent with visuals.
4. Deliverable: a town that reads as a place to return to and thrive in—not a
   ring of props.

### M3 — Biomes, routes, and activity loops

1. Wildwood: woodcutting, wildlife, shrine/ruin, starter quest route.
2. Frostwatch: copper/tin/iron progression, mine entrance, highland hazards.
3. Sunmere: farms, cooking inputs, coastal fishing, mill and trade loop.
4. Miregate: willow/fishing, bog hazards, ruins, mid-game enemy clearings.
5. Ember Road/Cinder Hollow: guided combat route, light pools, dungeon entrance
   and return objective.
6. Deliverable: each district has clustered resources, NPC purpose, encounter
   space, a landmark, and a readable return road.

### M4 — Asset and animation replacement

1. Maintain a license inventory for every imported free asset; reject unclear
   licenses and paid content.
2. Import one compatible free environment kit at a time, validate URP materials,
   scale, collider behavior, and WebGL output, then replace fallbacks by district.
3. Use Blender only for original glue assets, terrain accents, simple props, and
   optimized collision/LOD meshes—not to hide unlicensed source assets.
4. Establish hero/NPC/enemy idle, locomotion, hit, harvest, and interaction
   animation bridges. Gameplay authority stays in Core systems.
5. Deliverable: the most-visible town/route objects no longer look like debug
   primitives or disconnected kit pieces.

### M5 — Open-world gameplay and persistence

1. Add district discovery, map reveal, route markers, respawn/return points,
   and later fast-travel unlocks.
2. Add resource respawn budgets, enemy encounter zones, simple patrol/idle
   behavior, and safe combat clearings.
3. Extend quest content with district prerequisites and complete a first
   mainland progression path: gather → craft → build → explore → combat → return.
4. Test fresh, migrated, corrupt, and browser-restored saves.
5. Deliverable: a player can start in town, establish a loop, progress through
   at least two districts, and recover safely from a session restart.

### M6 — Performance, device QA, and test deployment

1. Establish draw-call, triangle, memory, and frame-time budgets per terrain
   chunk and district. Measure on representative desktop/WebGL, then physical
   mobile browsers when available.
2. Add LOD/culling or pooled chunk decoration only after measured need; preserve
   visual landmarks at travel distance.
3. Test cold boot, first-tap audio unlock, save/resume, background close, input,
   and long traversal on browser, Android, and iOS.
4. Build WebGL, publish the test candidate, capture game screenshots, and record
   known device limitations.
5. Deliverable: a deployable mainland test build with a reproducible QA report.

## Implementation order and checkpoints

| Checkpoint | Exit evidence |
| --- | --- |
| M0 | migration fixtures pass; 126×126 deterministic grid; no out-of-bounds save state |
| M1 | town-to-biome Play Mode traversal; chunk metrics; no square horizon in normal camera |
| M2 | dense Hearthvale screenshot and interactive service loop |
| M3 | each district traversable with landmark, activity cluster, and return route |
| M4 | license inventory, visual replacement review, animated hero/NPC/enemy proof |
| M5 | fresh/migrated save progression test and end-to-end mainland journey |
| M6 | test suite, WebGL build, physical-device QA, deployment and screenshots |

## Current repository impact

M0 and the first M1/M2 foundations are now present: the deterministic grid is
126×126 with 18×18 chunks, the sanitizer migrates legacy 42×42 coordinates,
and the Unity presentation has continuous terrain, a broad ocean horizon,
grounded routes, a central Hearthvale, and a third-person/orbit controller.
The map survey records walking exploration at chunk scale. These foundations do
not complete the roadmap: route activities, district progression, NPC/enemy
replacement, physical-device QA, and a current hosted WebGL verification
remain active work.
