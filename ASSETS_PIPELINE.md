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

## Shrink it first

Rigged output is texture-heavy — the source models were 93-96% texture (one
2048x2048 PNG each). Always run:

```
node scripts/optimize-glb.cjs <file.glb> --in-place
```

512px JPEG at q0.85 took the shipped model set from 21.5 MB to 1.53 MB (-93%)
with no visible change at gameplay zoom. This is also what gets a rigged clip
under the 25 MB upload ceiling.

## Installing the result

1. Download each result GLB and optimise it (above).
2. Drop it in `public/models/` named `<character>_<state>.glb`
   (e.g. `hero_idle.glb`, `hero_walk.glb`).
3. Register it in `ACTOR_CLIPS` in `src/core/Model.ts`. A character's `base` may
   be a list — name the rigged file first and the un-rigged original as fallback,
   so the manifest is valid before and after the asset lands.
4. Run `npm test`. It regenerates `src/core/ModelManifest.ts` from what's actually
   in `public/models`, so the loader never requests a file that isn't shipped, and
   `scripts/verify-rig.cjs` fails if a character's files don't share one skeleton
   or a clip binds to bones the base rig lacks.

## Animation states

`spawnActor(name)` returns an `AnimatedActor` with `play(state)`. States are
`idle | walk | attack | gather | hurt | die`; a missing state falls back to the
nearest available one, so partial clip coverage degrades gracefully. Driven from:

- hero — `main.ts` frame loop (walk/idle) plus gather on skill/craft start
- villagers — `NpcSystem.update()` (walk while travelling, idle when stopped)
- monsters — `CombatSystem.update()` (walk when the tile changed, else idle) and
  `attack` on the swing

## Shared animation clips (preferred over per-animation GLBs)

The rigging service bakes each animation into a complete GLB — mesh, skeleton and
textures — roughly 770 kB for one walk cycle on a mesh we already ship. Every
character it rigs uses the same 24-bone skeleton (`skel b6addeab77c8`), so the
motion is the only new information in that file.

Clips therefore ship as `public/models/clips/<name>.clip.json`: a header plus a
base64 `Int16` quaternion table sampled at a uniform rate. **Rotation only** —
that is what makes one clip drive every rig, since translation tracks carry the
donor's limb proportions (see `retargetable()` in `Model.ts`). ~15 kB per clip,
reusable across actors.

To add one: rig the animation, then extract with the pipeline recorded in
`ClipLibrary.ts` (decimate to ~15 fps, drop bones that never rotate, quantize to
`Int16`). Declare it in `ACTOR_CLIPS[...].shared`; `verify-rig` then checks the
table size, that every quaternion is unit length, and that the clip's bones exist
on every rigged skeleton we ship.

## Outstanding: the rigged hero mesh

`public/models/hero.glb` is the original **static** mesh — no skeleton — so the
hero cannot animate. Its `hero_idle` / `hero_walk` clips are already shipped and
verified; only the skinned mesh is missing.

The rigged mesh is built and waiting (24 joints, same skeleton as every other
actor; animation stripped and texture recompressed to 512px JPEG, 790 kB → 329 kB,
the same treatment the other models got). To land it:

1. Download <https://d2ol7oe51mr4n9.cloudfront.net/user_36MHNrl15jk9zlazEaTWSMthntm/0b19d695-d837-4941-8cea-04704fdb74fe.zip> (226 kB)
2. Unzip and put `hero_rigged.glb` in `public/models/`
3. Run `npm test`

Nothing else changes: `ACTOR_CLIPS.hero` already prefers `hero_rigged` and falls
back to `hero`, and the manifest generator picks the file up automatically.

## Notes

- Clones use `SkeletonUtils.clone()`, not `Object3D.clone()` — the latter does
  not rebind a SkinnedMesh to its cloned skeleton, so every clone would drive the
  template's bones.
- Current GLBs are ~6 MB each for actors that render ~40 px tall. Pass a lower
  `target_polycount` on future generations; 22 MB of models is the single largest
  cost in the build.
