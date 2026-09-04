# M0-05 remote session — dress, light and compose

Use this only after M0-05 is explicitly authorized. The GDD is the design
authority: read `docs/GDD_ALDERFELL.md` §3.2, §6, §18 and §36 first.

## Starting checkpoint

- Branch: `codex/m0-shorelands-foundation`.
- M0-04 evidence checkpoint: `1d9e9a72704cac7f114a9c6376c41f9c67547515`.
- Documentation checkpoint: `a03a9892627346c5dbaab48a87eb2b50c4195d81`.
- Exact Unity project: `/Users/syntaxx/isorpg-m0/unity`.
- Unity: `6000.5.8f1`; expected bridge: CoplayDev `unity@931634bd`.
- Scene: `Assets/Isoperia/Scenes/ShorelandsM0.unity`, saved with exactly six
  persistent roots.

M0-04 is evidence-complete: the route is grounded and reaches Beach, Wreck,
Switchback, Plateau and Clifftop; three labelled Editor captures exist. This is
not device or final-M0 acceptance.

## Scope

1. Dress and light the existing Shorelands scene for the three GDD framed reveals:
   `Beach_Wreck`, `Switchback`, and `Clifftop`.
2. Preserve the established terrain, collider, M0 inspection/player isolation,
   hero landforms, admitted scatter, atlas contract, wind and foam ribbon unless
   a specific regression requires a minimal, documented repair.
3. Compose distinct, legible views. Each must read as a place, not a renamed
   generic camera position.
4. Use only admitted/original project assets. Record any newly admitted asset in
   `docs/ASSET_CREDITS.md` and follow `docs/ASSET_ADMISSION.md`.
5. Capture real-device evidence when a device is available. Record device model,
   OS, build SHA, graphics settings, resolution and capture conditions.

## Out of scope

- M1/gameplay systems, new combat, inventory, quests, saves or persistent UI.
- SSR, reflections, new paid assets or an atlas-layout migration.
- Faking device evidence from the Editor.
- M0-06 profiling/sign-off unless separately authorized.

## Completion evidence

- Saved/reopened scene with six roots and zero project Console errors.
- Three visually inspected, correctly labelled reveal captures.
- Exact source/build SHA and asset-admission entries for all additions.
- If a phone was tested: device/build/settings/resolution and observed result.
- Clear `NOT RUN` entries for genuine pinch, iPhone/Android, percentile
  performance and authoring hours when they were not actually recorded.
- Update `HANDOFF.md`, `docs/IMPLEMENTATION_STATUS.md` and
  `docs/M0_REMOTE_RETURN.md`; stage only intended files and push normally.

## Stop conditions

Stop and report rather than claim success if the Unity bridge is stale, the scene
is not the exact saved M0 scene, a required asset/material is missing, route/camera
behaviour regresses, a capture is generic/unverified, or device evidence cannot be
performed.
