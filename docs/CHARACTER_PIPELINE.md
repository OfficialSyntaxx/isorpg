> Historical reference: the current design and delivery rules are in `GDD_ALDERFELL.md` and `WORKFLOW.md`. Older camera, paid asset, exporter, branch and deployment instructions below are superseded. Use the implementation status board for current work.

# Isoperia character and creature pipeline

## Decision

Use a hybrid source strategy:

- **Free, license-cleared source assets** may provide early NPC and monster
  bases only after isolated review and attribution recording.
- **Original Blender characters and signature creatures** are the long-term
  visual standard. They must be designed for Isoperia rather than assembled
  from unrelated marketplace packs.

This prevents the world from waiting on a full character department while
avoiding a permanent collage of inconsistent assets.

## Blender production contract

Each original character or creature must have:

1. a clean, named armature with one root bone;
2. a neutral, non-T-pose idle stance for the exported bind pose;
3. shared scale: humanoid eye height around 1.6–1.75 m;
4. a controlled WebGL budget: 2–4k triangles for ordinary NPCs, 3–6k for
   common monsters, 8–12k only for a boss or major landmark creature;
5. one atlas/material family wherever possible;
6. no camera, light, reference mesh, or hidden helper object in the export;
7. root motion disabled in Unity unless a reviewed gameplay system owns it.

## Minimum animation library

### Humanoids

- idle, walk, run, turn-in-place
- talk/gesture, gather/work loop, hit, death
- weapon-ready and one basic attack only for guards/hostile humanoids

### Four-legged creatures

- idle, walk, run, turn, bite/attack, hit, death

### Large creatures

- idle, walk, turn, telegraphed attack, hit, death

Animation is presentation-only: Core gameplay and the third-person controller
retain authority over movement, damage, and interaction state.

## Admission sequence

1. Produce/import the source in Blender.
2. Validate the bind pose and every action in Blender.
3. Export FBX with only mesh, armature, and animations.
4. Import into `Assets/Scenes/AssetReview.unity`.
5. Verify URP materials, clip mapping, disabled root motion, collider, bounds,
   LOD, and screenshot at gameplay distance.
6. Add to `WorldAssetAdmission` only after review.
7. Integrate one actor type into the vertical slice, then re-capture.

## First original actor batch

1. Player ranger/adventurer (hero) — establishes the humanoid rig.
2. Hearthvale villager — derives from the same rig with palette/outfit changes.
3. Guard — same rig, armor and weapon variant.
4. Wolf — establishes a quadruped rig.
5. Bog husk — establishes a humanoid monster silhouette.

No new actor is added to the open world until these five pass isolated review.
