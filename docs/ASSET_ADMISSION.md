# Isoperia asset admission gate

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
