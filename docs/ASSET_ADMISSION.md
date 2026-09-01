# Isoperia asset admission gate

## Renovation validation tools

- `npm run verify:world-assets` checks model payload headers, GLB structure,
  unresolved LFS pointers, duplicate GUIDs/model resource keys, missing model
  metadata, and discoverable runtime resource paths. It does not approve art.
- `Isoperia > Validation > Audit world assets` inspects imported models and
  prefabs in a disposable Unity preview scene. Read
  `unity/Artifacts/world-asset-import-audit.json` for meshes, submesh materials,
  shader compatibility flags, bounds, embedded cameras/lights, missing scripts,
  and imported clip names. It does not modify any asset or admission rule.
- Run EditMode filter `Isoperia.Unity.Tests` for resource selection and
  interaction regressions. `npm run verify:world-resources` runs the same three
  selection tests with Mono outside Unity and fails explicitly if Mono is absent.

The screenshot and actor-motion checks below remain required after these tools.

No FBX, GLB, prefab, material, or Asset Store package is allowed into a live
world scene just because it imports successfully.

## Required review path

1. Keep the source under its provenance folder and record its license.
2. Open it alone in the Unity asset-review scene at
   `Assets/Scenes/AssetReview.unity`.
3. Verify scale at player height, grounded pivot, forward axis, visible bounds,
   URP materials, collider, and no helper meshes/cameras/lights.
4. Inspect idle, walk, actions, and root motion for actors.
5. Capture a review screenshot at gameplay camera distance.
6. Add the resource path to `WorldAssetAdmission.IsApproved` only after review.
7. Integrate one approved prefab at a time, then capture the live world again.

## Phase 0 quarantine

All `Art/OwnedModels/` assets are quarantined from runtime placement. They
produced oversized panels, invalid silhouettes, and material failures in the
2026-08-28 live capture. The CC0 Kenney town kit remains the temporary safe
baseline while replacement content is reviewed.

## Rejection criteria

- visible helper/camera/light geometry
- bounds or pivot that prevents coherent gameplay placement
- missing, incompatible, or flat fallback materials
- T-pose, bind pose, incorrect animation mapping, or unexpected root motion
- poor silhouette or unreadable detail at third-person camera distance
- collision or performance cost unsuitable for WebGL
