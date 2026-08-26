# Isoperia Local Asset and Animation Pipeline

## Non-negotiable constraints

- Use only original Blender work, CC0 assets, or assets with a reviewed
  permissive license. No paid, trial-only, or license-unclear asset enters the
  repository.
- Asset creation uses local tools only. Do not send concepts, meshes, or source
  textures to paid APIs or hosted model generators.
- The Unity game remains the authority for movement, combat, interactions,
  saves, and NPC state. Animation is presentation driven by that authority.

## Production loop

1. Write a short asset card: purpose, district, player distance, gameplay
   ownership, scale, and acceptance image.
2. Build the first mesh in Blender procedurally or by hand; save the source
   `.blend` under `art/blender/` and keep the generator under `tools/blender/`
   when it is repeatable.
3. Apply the Isoperia palette and validate pivot, Y-up orientation, silhouette,
   and triangle budget. Render one review PNG next to the source `.blend`.
4. Export FBX to `Assets/Isoperia/Resources/Art/OwnedModels/`; let Unity create
   its `.meta` file. Never hand-author GUIDs.
5. Reimport in Unity, inspect Console, apply shared runtime materials, and place
   the prop as a purposeful composition rather than isolated decoration.
6. Capture a live in-game screenshot. Record provenance and technical review in
   `ASSET_CREDITS.md`, then add the completed work to `UPDATES.md`.
7. Before a release candidate, run the WebGL build and inspect the asset’s
   render/texture cost. Mobile validation remains a separate deferred gate.

## NPC and monster workflow

We can make original NPCs and monsters with local Blender tools. Each actor
needs a distinct silhouette, a Blender armature, and clips for idle, locomotion,
hit, attack, and death/defeat. Export the skinned FBX into `OwnedModels`, create
or extend a Unity Animator Controller, and let existing Core events choose
animation parameters. Do not use animation events as combat authority.

Minimum actor acceptance:

1. Generic or Humanoid rig imports with the intended avatar mapping.
2. No root-motion authority unless the gameplay controller explicitly consumes
   it; current movement stays code-authoritative.
3. Root interaction collider matches the visible mesh.
4. Idle, movement, hit, and attack transitions are visible in Play Mode.
5. Character budget is at most 2,000 triangles for the first WebGL/mobile pass,
   with one small material atlas where practical.

## Asset backlog

## Phase 1 library status

**Complete — asset-library milestone.** All listed Phase 1 entries have an
original local Blender source, review render, FBX import under `OwnedModels`,
and Unity import verification. The library is deliberately unplaced. Phase 2
owns purposeful scene composition, colliders, materials, Animator Controllers,
and in-game visual validation.

The completed library covers: Hearthvale service, home, market, role, farm,
and route props; Wildwood logging/shrine assets; Frostwatch mining assets;
Sunmere shoreline assets; Miregate swamp assets; Cinder Hollow volcanic assets;
three tree families and all planned wilderness scatter; six NPC silhouettes;
four friendly creatures; seven standard monsters; five outer-route boss
silhouettes (Cinder Hound included); and two source animation assets.

`cinder_hound_animated.fbx` supplies original Idle and Walk actions.
`actor_animation_baseline.fbx` supplies original source actions for Idle, Walk,
Run, Turn, Gather, Talk, Emote, LightAttack, HeavyAttack, Block, Hit, Defeat,
Spawn, and ResourceInteract. Their runtime Animator wiring is explicitly a
Phase 2 task; no animation is treated as gameplay authority.

## Phase 2 integration status

**Complete.** `WorldOwnedAssetLibraryView` composes a sparse, grounded set of
owned assets across Hearthvale, roads, Wildwood, Frostwatch, Sunmere, Miregate,
and Cinder Hollow. It applies shared URP palette materials and adds colliders
only to purposeful blocking landmarks. `WorldTownView` now selects owned NPC
role silhouettes when available, while `WorldCombatView` uses the owned rat,
ogre, and animated Cinder Hound presentation assets with existing safe
fallbacks. `OwnedAnimationSetup` creates the Cinder Hound and actor-baseline
controllers; root motion stays disabled and no clip changes combat or movement
authority.

## Phase 3 world-presence status

**Complete — runtime composition polish.** District props now stream by player
distance, keeping the active presentation set local to travel. Lanterns,
braziers, and milestones use small local lights tied to the saved world clock.
Friendly creatures use bounded presentation-only idle wandering; villagers
keep their existing social idle. The player controller deliberately relies on
deterministic terrain and water checks rather than `CharacterController`
physics, so scenic prop colliders cannot trap a player.

## Phase 4 replacement status

**In progress — Hearthvale tranche 1 complete.** `hearthvale_plaza_fountain`
and `hearthvale_market_canopy` are original local Blender replacements for the
central plaza and market. `WorldTownView` loads them first and retains the
existing CC0 town-kit fountain/stall as a safe stripped-build fallback.

Continue Phase 4 by replacing additional high-visibility route/district
silhouettes and broadening rigged NPC/enemy Animator coverage. Capture a new
WebGL candidate only after that visual tranche is coherent enough for tester
review. These remain presentation changes unless a separate gameplay ticket
explicitly changes Core authority.

### Hearthvale and routes

- Market: produce stall, fish rack, barrels, sacks, cloth awnings, handcarts.
- Farm: fence variations, crop rows, hay bales, water trough, chicken coop.
- Road: lantern variants, bridge kit, milestone, sign variants, ruined cart.
- Wilderness: 3 tree families, fallen log, stump, boulders, ferns, mushrooms,
  reed clusters, shoreline debris.

### District landmarks

- Wildwood: logging camp, rope bridge, shrine fragments, ritual brazier.
- Frostwatch: mine support kit, ore cart, winch, tents, snow/rock scatter.
- Sunmere: fishing dock, boat, net rack, buoy, lake shrine.
- Miregate: broken gate, swamp boardwalk, watchtower, bone totems.
- Cinder Hollow: lava-rock kit, ash trees, barricades, furnace ruins.

### Actors and encounters

- NPC base: villager body variations, worker outfits, guard, merchant, child,
  elder, quest-giver accessories.
- Friendly creatures: pack mule, chickens, sheep, fishing birds.
- Monsters: rat, wolf variants, bog husk, cave slasher, frost imp, forest ogre,
  and one district boss for each outer route.
- Animation library: idle, walk, run, turn, gather, talk, emote, light/heavy
  attack, block, hit, defeat, spawn, and resource interaction.

## Blender MCP status

The local `dcc-mcp-blender` bridge is installed and Blender registers at the
localhost gateway. Its typed executor currently has a Blender 5.2 adapter
compatibility error, so it is not a production dependency. Use the validated
bundled-Blender Python generator path until the bridge passes its typed smoke
test; retain the MCP configuration for retesting after adapter updates.
