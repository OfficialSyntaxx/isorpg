# Alderfell delivery workflow

This file governs delivery for Claude, Codex and human collaborators. Game intent
is in `GDD_ALDERFELL.md`; current work and evidence are in
`IMPLEMENTATION_STATUS.md`. Current branch: `codex/m0-shorelands-foundation`.

## Start a session

1. Read the GDD's Start here index and current milestone, then the status board
   and `../HANDOFF.md`. Inspect branch, HEAD and existing changes before editing.
2. Select the next applicable ready task. Record its owner/session and mark it
   in progress. Keep the current milestone's scope visible.
3. Check capabilities actually available in this session. An installed Unity or
   Blender package is not proof of a connected editor. Before editor writes,
   verify the project path, version, active scene, Play Mode and dirty state.
4. Read only the relevant GDD sections and procedure. If intent and code differ,
   record the migration explicitly. Do not treat planned features as implemented.

## Finish one reviewable change

- Implement the smallest complete task. Update design first when it changes a
  game rule; record the rationale and affected sections in GDD Appendix A.
- Run the relevant checks below. A failed check stays visible. Do not disable
  tests, loosen content loading, or hide errors to obtain a green result.
- Review the diff for unintended assets, GUID changes, generated output and
  content writes. Stage named paths, not the entire checkout.
- Commit and push authorized work to the working branch. Re-read remote HEAD
  before publishing; if another session advanced it, integrate their changes
  without force-pushing or overwriting their work. No PR/main merge unless asked.
- Check CI for the pushed SHA. Update task status, evidence and handoff. A task
  requiring Unity/device evidence remains blocked or in review until it exists.

## Evidence states

| State | Meaning |
|---|---|
| Planned | Defined work, not started |
| Ready | Dependencies and decisions for this task are resolved |
| In progress | An identified session owns active work |
| In review | Implemented; one or more required checks remain |
| Verified | Acceptance criteria passed, with reproducible evidence |
| Blocked | A named decision, capability or dependency prevents completion |

Evidence includes the commit, command, result, platform and any limitations.
Never infer scene quality, mobile performance or network readiness from Core tests.
Use the checked commit in evidence; do not use a timeless “all green” statement.

## Validation commands

Run from the repository root with a .NET 8 SDK. Root `global.json` selects an
installed stable 8.0 feature band rather than accidentally using a newer major SDK.

```bash
# All Core tests, including the shipping content gate
dotnet test ci/CoreTests/CoreTests.csproj

# Focused content checks (synthetic regressions + actual authored JSON)
dotnet test ci/CoreTests/CoreTests.csproj --filter ContentValidatorTests

# Review before commit
git diff --check
```

`core-tests.yml` runs on pushes/PRs and uploads `core-test-results` even on test
failure. `unity-build.yml` runs on main or explicit dispatch; it runs EditMode tests
and builds Android plus an iOS Xcode project. It is configured, not certified until
its exact run succeeds. It does not sign/install iOS or publish a release. The
activation helper remains available; never print credentials in handoffs.

Unity changes require a connected editor or successful Unity CI plus the relevant
runtime check. Art needs a lit-scene review; M0 needs three phone screenshots and
profiling. An iPhone pass is provisional for the target Android budget. The Android
emulator is a compatibility tool, not device performance evidence.

## Content authoring contract

Edit `unity/Assets/Isoperia/Resources/Content/*.json` directly. Do not run the old
exporter; its entry point now fails before writing anything. Legacy `npm test`
no longer exports content. The TypeScript prototype and its wiki are historical
references, not the source for new Unity data.

Current automated coverage:

- Required nonempty files/tables and valid JSON via `ContentDatabase`.
- Required top-level table kinds via `ContentValidator`.
- Item key/id agreement, item names and nonnegative values when supplied.
- Recipe item references, duplicate recipe IDs and positive integer quantities.
- Monster/resource drop references, weights/chances and supplied min/max ranges.
- Weapon item references (unarmed may have no item); shop references and prices.
- Building costs, seed/produce references, quest rewards and clue reward references.
- `ShippingContentPassesValidation` loads the real files; a mutation regression
  proves a broken real-data reward reference is rejected without editing the files.

This is not a complete gameplay schema. Skill unlocks, full field validation,
icon/locale completeness, economic cycles, reachability, new gear instances and
save migrations need their own checks as their systems arrive. Changing a table's
shape means changing the loader/validator, consumers, tests and GDD §33 together.

## Two working environments

| Lane | Appropriate work | Required proof |
|---|---|---|
| Repository / remote | GDD, C#, content, shaders, tests, tooling | Diff + relevant automated results; shader visuals remain unverified |
| Connected Unity / Blender | Terrain, prefabs, imported art, scenes, editor/build work | Correct project confirmed, import/compile results, runtime/visual evidence |
| Real device | Controls, UI, performance, suspend/resume | Device model, OS, build SHA, settings/resolution, observations and captures |

No mandatory delegation is assumed. When multiple sessions are authorized, give
non-overlapping tasks/paths and record ownership; avoid concurrent scene or prefab
edits. One session integrates and verifies the resulting branch state.

## Milestone discipline

M0 builds an isolated Shorelands inspection scene and a temporary traversal rig.
Do not run the legacy gameplay bootstrap in that proof or claim temporary motion
implements command authority. Its acceptance is GDD §36, not merely a successful
build. Record authoring hours, frame-time percentiles, draw calls, triangles and
resident memory alongside the three reveal screenshots.

M1–M3 own command migration, active offline/labour removal, XP/gear changes,
saves and the playable vertical slice. Do not move them ahead of M0 to avoid art.
Unresolved Appendix A decisions block only their listed systems.

## Handoff and asset preservation

End sessions by updating the status board and handoff with: completed work,
checked SHA/run, remaining blockers, next task and required environment. Preserve
historical evidence under `archive/` or git history; clearly label obsolete plans.

Do not overwrite art sources, reorganize assets or rewrite LFS history as incidental
cleanup. New root attributes do not convert old raw blobs. Verify actual payloads
before asset review; a pointer file is not a model. Preserve editable source art
in a durable backed-up location and record it in the asset ledger.
