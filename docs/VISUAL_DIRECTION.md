> Historical reference: the current design and delivery rules are in `GDD_ALDERFELL.md` and `WORKFLOW.md`. Older camera, paid asset, exporter, branch and deployment instructions below are superseded. Use the implementation status board for current work.

# Isoperia visual direction — Phase 1

## Target

An original, stylized high-fantasy third-person world: readable at a RuneScape-
inspired scale and density, but not a copy of any existing game. The goal is a
convincing, explorable frontier—not photorealism and not a low-poly prototype.

## Non-negotiable visual rules

- Third-person perspective; no isometric or tile-map presentation in gameplay.
- Terrain has elevation, natural transitions, roads, water, and landmarks.
- Buildings use human-scale doors, windows, roofs, foundations, and surrounding
  activity props. A single mesh never stands in for a whole settlement.
- Every town and route has a silhouette visible from a distance.
- Nature is layered: terrain material, large forms, trees, shrubs, ground
  cover, small rocks, and localized story props.
- Stylized materials use a controlled palette and readable roughness/value;
  flat unlit colors and arbitrary per-model recoloring are not acceptable.

## Hearthvale vertical slice

Build one 70 × 70 m playable area before extending the mainland:

1. Raised road into a small plaza, with terrain blending at the road edges.
2. One finished landmark building (forge or inn), one small house, and one
   market shelter with interiors deferred.
3. Forest edge, stream or pond, bridge/ford, and a distant destination
   silhouette.
4. One reviewed player actor, one reviewed NPC, and one reviewed creature.
5. Sun/sky/fog/color grading, warm practical lights, ambient sound, and a
   WebGL performance capture.

## Phase 1 asset strategy

- Test **one** free URP nature package only in `Assets/Scenes/AssetReview.unity`.
- Preferred candidate: Ultimate Nature – Starter, because it explicitly
  supports Unity 6 URP. Use it for foliage and terrain dressing, never as an
  excuse to import an entire demo world.
- The free low-poly nature pack is a secondary source only; reject any asset
  whose style makes the game read as a generic low-poly prototype.
- Model missing signature buildings, landmarks, and gameplay props in Blender;
  export only cleaned, review-approved prefabs.

## Screenshot gate

No district expansion, WebGL deployment, or website capture proceeds until the
vertical slice has an in-game screenshot that passes all of these:

- no raw helper geometry, missing materials, T-pose, clipping, or floating;
- player, doors, props, and foliage read at believable relative scale;
- terrain has depth and a clear travel route;
- screenshot looks like a cohesive world rather than a collection of assets.
