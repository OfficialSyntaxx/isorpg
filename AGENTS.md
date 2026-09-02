# Alderfell — agent entry point

Read `docs/GDD_ALDERFELL.md` (Start here, §1, §16, §36), then
`docs/WORKFLOW.md`, `docs/IMPLEMENTATION_STATUS.md`, and `HANDOFF.md`.
`CLAUDE.md` is an operating summary of the same project, not a competing plan.

- The GDD defines game intent. Workflow defines delivery. Implementation status
  records facts and evidence. Historical documents do not override these.
- Current production milestone is M0: the Shorelands beauty proof. This is not
  authorization to build later gameplay systems while the visual gate is open.
- Match the user's task to a tracked work item. Routine implementation choices
  can proceed; unresolved gameplay choices belong in GDD Appendix A before the
  affected system is implemented. Preserve the user's scope and authorization.
- Work on `codex/m0-shorelands-foundation` unless the user specifies another
  branch. Do not force-push. No PR or merge to main unless requested.
- Keep `Isoperia.Core` independent of Unity. New gameplay authority belongs in
  Core; legacy exceptions are migration work, not patterns to copy.
- Content JSON under `unity/Assets/Isoperia/Resources/Content/` is authored source.
  The TypeScript exporter is retired. Never regenerate Unity data from `src/`.
- Validate with `dotnet test ci/CoreTests/CoreTests.csproj`. Report the exact
  checked commit and distinguish Core tests from Unity/device validation.
- Preserve authored assets, `.meta` GUIDs, saves and unrelated work. Stage intended
  paths explicitly; new LFS rules can expose unrelated legacy binary changes.
- For repeated content/asset/region work, read the matching procedure under
  `.claude/skills/`; these files are shared procedures even outside Claude.
