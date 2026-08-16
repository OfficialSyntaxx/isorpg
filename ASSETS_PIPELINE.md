# Asset pipeline — rigged characters

How rigged, animated GLBs get from Higgsfield/Meshy into the game.

## What we learned (verified 2026-08-16)

- **`3d_rigging` accepts an existing GLB URL**, so models we already have can be
  rigged without regenerating the mesh. Source must be publicly fetchable
  (the repo is public, so `raw.githubusercontent.com/...` works).
- **Cost:** 5 credits to rig, **8 credits to rig + one animation clip**.
  One clip per generation — N states for a character means N calls.
- **Every Meshy rig uses the same 24-bone humanoid** (`Hips, LeftUpLeg, …`),
  verified identical across villager / forest_ogre / cave_brute.
- **But rest poses differ per character.** Each rig keeps its source mesh's limb
  proportions, and clips animate *translation* on all 24 bones — so a clip made
  for one actor, played verbatim on another, drags the target into the donor's
  proportions.
  → Use `retargetable()` (rotation-only) to share a motion across rigs.
    Mark those states in `ACTOR_CLIPS[...].borrowed`.
- `hero.glb` as originally generated has **zero animation clips** — it can only
  ever be a static mesh until rigged.

## Generating a clip

```
generate_3d {
  model: "3d_rigging",
  model_url: "https://raw.githubusercontent.com/OfficialSyntaxx/isorpg/main/public/models/<mesh>.glb",
  height_meters: 1.7,
  enable_animation: true,
  animation_action_id: <id>
}
```

Useful clip ids (`animation_actions` tool searches all 678):

| State   | id  | Name                |
|---------|-----|---------------------|
| idle    | 0   | Idle                |
| walk    | 30  | Casual_Walk         |
| attack  | 4   | Attack              |
| attack  | 97  | Left_Slash          |
| heavy   | 128 | Heavy_Hammer_Swing  |
| ranged  | 224 | Archery_Shot        |

Always preflight with `get_cost: true` first.

## Installing the result

1. Download each result GLB.
2. Drop it in `public/models/` named `<character>_<state>.glb`
   (e.g. `hero_idle.glb`, `hero_walk.glb`).
3. Register it in `ACTOR_CLIPS` in `src/core/Model.ts`.
4. Run `npm test` — `scripts/verify-rig.cjs` reports the inventory and fails if a
   character's files don't share one skeleton, or if a clip binds to bones the
   base rig doesn't have.

## Notes

- Clones use `SkeletonUtils.clone()`, not `Object3D.clone()` — the latter does
  not rebind a SkinnedMesh to its cloned skeleton, so every clone would drive the
  template's bones.
- Current GLBs are ~6 MB each for actors that render ~40 px tall. Pass a lower
  `target_polycount` on future generations; 22 MB of models is the single largest
  cost in the build.
