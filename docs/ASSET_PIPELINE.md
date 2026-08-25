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

The following original local-only assets are complete as an unintegrated
library and are awaiting the later Unity placement pass: trail lantern, travel
crate, forge anvil/tool stump, fish rack, produce crate, barrel, sacks, bench,
handcart, hay bale, scarecrow, table, chair, bed, shelf, fireplace, hanging
sign, noticeboard, cooking pot, tool rack, banner, awning, merchant pack,
blacksmith kit, farmer kit, guard kit, ranger kit, Cinder Hound, wildwood boar,
mire wisp, three tree families, fallen log, stump, mushroom and reed clusters,
and the route bridge, milestone, brazier, ruined cart, and road lantern. Each
has an FBX under `OwnedModels` and a matching Blender source/render under
`art/blender`. Keep library creation ahead of scene placement so composition
work can use a stable, reviewed kit. The Wildwood landmark set now also covers
the first logging-camp composition: log stack, sawhorse, canvas tent, rune
shrine fragments, and rope coil. Frostwatch has its first mine composition:
timber support, ore cart, hand winch, supply tent, and cold crystal cluster.
Sunmere now has its shoreline anchor set: fishing dock, rowboat, net rack,
buoy, and lake shrine.

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
