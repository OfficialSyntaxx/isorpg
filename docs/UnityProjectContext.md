# Unity project context — Alderfell

Design authority: `GDD_ALDERFELL.md` v6.1. Workflow and evidence:
`WORKFLOW.md`, `IMPLEMENTATION_STATUS.md`, and `../HANDOFF.md`.
Working branch: `codex/m0-shorelands-foundation`.

## Verified by repository inspection

- Unity 6000.5.8f1, URP 17.5.0, Input System 1.20.0. Addressables,
  glTFast, Newtonsoft JSON and Test Framework are installed.
- `Isoperia.Core` has `noEngineReferences: true`. Its content/save code currently
  uses its own JSON parser. Preserve the Core boundary and RNG draw-order tests.
- `Isoperia.Unity` owns presentation and the legacy controller. That controller
  directly writes Core positions today; GDD command ownership is a migration goal.
- Existing runtime initializes a procedural grid. M0 requires an isolated proof
  scene; authored additive region streaming is not established by these docs.
- Content is hand-authored JSON in `Resources/Content`. TypeScript is historical
  reference. The old exporter is retired and cannot write the Unity content.
- The standalone Core test project is `ci/CoreTests/CoreTests.csproj`.

## Current direction

Third-person, authored, mobile-first Alderfell. M0 proves Shorelands composition,
terrain, water, wind, sky and camera before expanding gameplay. The old Hearthvale
slice and isometric/WebGL milestones are superseded. Keep historical assets and
technical lessons; do not mistake import presence for visual admission.

## Capabilities and remaining proof

The package manifest includes Coplay Unity MCP, but every session must establish
its own actual connection and project identity. No live Unity/Blender session was
used during this preparation. Console, asset imports, runtime traversal, player
builds and device performance remain unverified. Consult the status board for
Core CI results tied to commits.
