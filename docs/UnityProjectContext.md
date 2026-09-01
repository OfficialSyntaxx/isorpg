# Unity project context

Analyzed 2026-09-01 at `d40ab4a`. Project root: `unity/`.

## Confirmed architecture

- Unity **6000.5.8f1**, URP **17.5.0**, Input System **1.20.0**. Addressables,
  glTFast, Newtonsoft JSON and Test Framework are installed. No first-party
  multiplayer implementation was identified.
- `Core/Isoperia.Core.asmdef` has no engine references. Deterministic generation,
  600 ms simulation, combat, crafting, progression and saves live there.
- `Unity/Isoperia.Unity.asmdef` owns rendering, input, resource/combat registries,
  and `SaveDriver`. `Editor/` owns import preparation and WebGL builds.
- `Assets/Isoperia/Scenes/Bootstrap.unity` is the enabled build scene.
  `Assets/Scenes/AssetReview.unity` is the isolated visual-review scene.
- `WorldRuntime` initializes the shared 126 × 126 grid before scene load.
  `SaveDriver.Awake` restores state and constructs the gameplay registries.
  `OpenWorldExperience` switches the scene to third-person movement/camera.
  Views also initialize themselves through scene-load callbacks; callback order
  must not be assumed.
- Runtime content comes from `Resources/Content`; TypeScript remains the reference
  implementation. Do not delete it or change Core's Unity-free assembly boundary.
- Use existing namespaces, plain C# in Core, private mutable state, explicit event
  cleanup, and comments explaining constraints. Preserve serialized names/GUIDs.

## Current direction and constraints

`docs/VISUAL_DIRECTION.md` supersedes the old fixed-isometric language in
`HANDOFF.md`: third-person fantasy world, Hearthvale 70 × 70 m vertical slice,
layered nature, believable scale, and reviewed authored assets.
`docs/ASSET_ADMISSION.md` quarantines owned models. Only the Kenney town kit is
currently approved. Imported files and procedural fallbacks are not visual approval.
No district expansion or deployment before the vertical-slice screenshot gate.
Mobile acceptance remains deferred, not passed (`docs/MAINLAND_QA.md`).

Use the existing development branch `claude/unity-engine-migration-roadmap-fz9w8y`.
The repository requests no PR unless asked. Main triggers deployment, so keep
unvalidated renovation work on the development branch.

## Testing and tools

- Core NUnit tests and Node/Mono parity harnesses exist. `npm run build` and
  `npm test` validate the legacy web game, not Unity presentation.
- `verify:scene` currently checks **zero active mesh-bearing renderers**; it
  cannot certify the runtime world. `verify:models` covers only a model subset.
- Coplay Unity MCP is installed in `Packages/manifest.json`, but no connected
  Unity tools or Editor executable are available in this session.
- Mono is unavailable locally. Unity compilation, imported materials, animation,
  live scene screenshots, traversal, WebGL and device performance are unverified.

## Evidence inspected

`HANDOFF.md`, `docs/VISUAL_DIRECTION.md`, `docs/ASSET_ADMISSION.md`,
`docs/MAINLAND_QA.md`, `ProjectSettings/ProjectVersion.txt`,
`ProjectSettings/EditorBuildSettings.asset`, `Packages/manifest.json`, first-party
assembly definitions, `WorldRuntime`, `SaveDriver`, `OpenWorldExperience`,
`OpenWorldPlayerController`, `WorldDecorationView`, `WorldTownView`,
`WorldPlayerAvatarView`, `WorldInteractionTarget`, `OwnedModelPresentation`,
`IsoperiaBuild`, and `.github/workflows/ci.yml`.
