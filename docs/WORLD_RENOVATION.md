# Isoperia world renovation

Baseline: `d40ab4a`, inspected 2026-09-01. Work is on
`claude/unity-engine-migration-roadmap-fz9w8y`, based on current main.

**Status: source repair pass implemented; full visual renovation is blocked on
Unity import, Play Mode and screenshot validation. Not release-ready.**

## What the audit established

| Finding | Evidence | Consequence |
| --- | --- | --- |
| Current game is third-person Unity, not the old isometric renderer | `OpenWorldExperience`, `docs/VISUAL_DIRECTION.md` | Continue the current perspective world; older handoff camera instructions are stale. |
| Gathering nodes exist but their view was forcibly disabled | `OpenWorldExperience.SuppressPrototypeViews`, `WorldResourceRegistry` | Trees, ore and fishing interactions disappear from the playable 3D world. |
| Every harvest rebuilt nearby geometry and materials | Old `WorldDecorationView.OnNodeChanged` | Unnecessary destruction of up to 64 presentation objects on a normal resource yield. |
| NPC paths duplicated `npc_` | `WorldTownView.OwnedNpcRoot` plus `CreateNpc` arguments | Even an approved NPC would fail the intended model lookup. |
| Interaction success was emitted even when gathering was rejected | `WorldInteractionTarget.TryInteract` | Feedback can imply an action started despite missing skill/tool requirements. |
| Distant NPC interactions had no range check | `WorldInteractionTarget` | Clicking a distant NPC could accept its journey. |
| Third-person movement did not interrupt gathering | `OpenWorldPlayerController` versus the retired grid controller | Gathering could continue after walking away. |
| Owned assets remain quarantined | `WorldAssetAdmission`, `docs/ASSET_ADMISSION.md` | Correct source files are insufficient to restore hero/NPC/monster/prop art. |
| The old scene audit covers zero active drawing meshes | `npm run verify:scene` | Its green result is not runtime-world evidence. |

The source inventory contains **166 models**, including **131 Resources models**
(110 owned models and 21 Kenney models). No unresolved LFS pointers, missing model
metadata, duplicate GUIDs/model resource keys, invalid checked headers/GLB chunks,
or missing paths among the **46 discoverable resource references** were found.
See `world-assets-source-audit.json` for the exact inventory and scope. This does
not establish material appearance, animation quality, collision or visual approval.

## Implemented repair pass

- Restore `WorldDecorationView` using the already-approved Kenney trees and rocks.
  Retain visible objects across refreshes; remove only depleted/out-of-range nodes.
  Select nearest nodes deterministically with caps of 32 trees, 24 rocks and 8
  fishing spots within 28 m. Reconsider selection after 2 m of travel.
- Bind/rebind the resource registry safely around startup and disable/re-enable.
  Keep interaction colliders on unscaled parent objects; ground imported visuals
  using their rendered bounds. Use a small ring for existing fishing nodes.
- Correct NPC model paths while retaining their quarantine. Enforce conversation
  range and emit action feedback only after gathering/targeting succeeds.
- Interrupt gathering during actual third-person movement.
- Use existing approved fountain/stall models and two lantern props in the town;
  ground houses individually. No new downloaded or paid assets were introduced.
- Add source audit tests, three pure C# selection tests, three Unity interaction/
  placement tests, and a read-only Unity imported-asset audit menu. CI installs
  Mono explicitly so resource tests cannot silently skip.
  The first CI run exposed a non-LFS checkout; CI now hydrates LFS payloads before
  auditing models. The pointer failures were checkout configuration, not corrupt
  source models.

Core generation, save IDs, resource density, admission rules and scene/prefab
serialization were not changed. This is deliberately not a claim that the
remaining mainland is finished.

## Renovation sequence and acceptance

1. **Validate the repaired gathering loop in Hearthvale.** Open `unity/` with
   Unity 6000.5.8f1, let imports compile, run EditMode filter
   `Isoperia.Unity.Tests`, then Play Mode from `Bootstrap.unity`. Walk to a tree,
   mine a rock, fish from shore, deplete/respawn a node, and move between streamed
   sets. Confirm resource visuals match the registry and no errors accumulate.
   A normal yield should retain the same surrounding GameObjects.
2. **Review the asset roster.** Run `Isoperia > Validation > Audit world assets`.
   Inspect `unity/Artifacts/world-asset-import-audit.json`. In `AssetReview.unity`,
   review one hero, one villager, one creature, the forge, service props and the
   imported nature kit, with scale/pivots/materials/animations/screenshots as
   required by `ASSET_ADMISSION.md`. Admit individual models only after review.
3. **Finish the 70 × 70 m Hearthvale slice.** Replace reviewed actor fallbacks;
   layer trees, shrubs, ground cover and small rocks; finish the forge yard,
   market, farm, water crossing and a visible destination. Verify human-scale
   architecture, clear roads, interaction reachability, camera occlusion,
   collisions, lighting and ambient sound. Capture a cohesive gameplay frame.
4. **Restore systems visibly, then expand.** Combat, buildings, dungeon and owned
   district views are still suppressed. Their resource imports bypass admission
   in places; audit each before re-enabling. The current movement controller also
   disables `CharacterController` and checks water/slope only, so authored solid
   prop/building collision requires a separate validated pass. Restore visible
   combat and building placement, then expand reviewed routes to Wildwood,
   Frostwatch, Sunmere, Miregate and Cinder Hollow with meaningful resources,
   contacts, landmarks and return routes.
5. **Validate and release.** Capture desktop frame time/draw calls/memory, build
   WebGL and test loading, input, camera, audio, save/resume and a long traversal.
   Physical iOS/Android acceptance remains deferred per `MAINLAND_QA.md`, not
   passed. Main auto-deploys, so merge only after the screenshot/build gates.

## Validation in this session

| Check | Result |
| --- | --- |
| `npm run build` | Passed: TypeScript check and Vite production build; existing chunk-size advisory remains. This is the legacy web game. |
| `npm test` | Passed: 321/321 gameplay assertions, UI/rig checks and content export. |
| `npm run verify:world-assets` | Passed: four audit regression tests and current source inventory. |
| `node scripts/verify-scene-materials.cjs` | Passed, but covers zero active mesh-bearing scene renderers. |
| `node scripts/verify-model-budget.cjs` | Passed: existing 11-model subset, 5.35 MB. Not a complete world performance budget. |
| `node scripts/verify-always-included-shaders.cjs` | Passed: URP shader/pipeline settings pinned. Not shader appearance validation. |
| `npm run verify:world-resources` | Blocked locally (no Mono); passed 3/3 in GitHub CI after compiling the actual registry/selection code and tests with Mono. |
| `npm run verify:core` | Passed 379/379 in GitHub CI with Mono. |
| Legacy browser smoke | Passed 5/5 in GitHub CI. This does not exercise Unity. |
| Unity Editor compilation, imported-asset audit, three engine-dependent interaction/placement tests | Not run: no Unity Editor or connected Unity MCP. The three selection tests ran outside Unity as recorded above. |
| Play Mode, screenshots, WebGL build, device/performance tests | Not run for this change. Required before visual approval/release. |

Code commit `76b03f8` passed [GitHub CI run 33555545960](https://github.com/OfficialSyntaxx/isorpg/actions/runs/33555545960).
The source audit, Mono suites/parity checks, build, gameplay tests, composition
checks and legacy browser smoke completed. The existing PWA browser check reported
no Chromium binary and the existing visual-regression script reported no Playwright;
both skipped. A green job therefore does **not** establish PWA or visual acceptance.
The first two runs exposed the missing LFS checkout and a missing namespace import
in the new tests; both were corrected before this successful run.

The project already includes a Coplay Unity MCP dependency, but it is not
connected to this session. Continue the Editor validation with this checkout on
the development machine; no new MCP package is needed merely for these repairs.
