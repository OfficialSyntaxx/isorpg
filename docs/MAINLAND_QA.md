# Mainland M6 QA Record

## Candidate

- Branch: `main`
- Unity: `6000.5.8f1`
- Target: WebGL
- Build output: `unity/WebGLBuild/` (git-ignored)
- Built: 2026-08-23
- Size: 28 MB on disk; Unity reported 23.8 MB compressed / 39.7 MB uncompressed.

## Evidence completed in this workspace

| Check | Result | Evidence |
| --- | --- | --- |
| Mainland save migration | Pass | Grid/sanitizer EditMode suite previously passed 206/206; a pre-mainland save was observed to migrate and spawn at `(63,63)` without losing state. |
| Runtime mainland traversal | Pass | Play Mode verified player/Core position stay synchronized at the Hearthvale mainland spawn; settlements, discovery, combat clearings, Cinder route and light pools instantiate. |
| Character fallback | Pass | Four Hearthvale NPCs instantiate from `Resources/Art/OwnedModels/villager`; the player instantiates `hero_rigged` from the same reviewed path; compact primitive fallbacks remain in code. |
| WebGL compilation/build | Pass | Headless `Isoperia.EditorTools.IsoperiaBuild.BuildWebGL` completed with exit code 0 and emitted loader, data, framework and wasm artifacts. |
| First-tap audio | Code reviewed | `OpenWorldExperience` supplies the listener; must be confirmed in a hosted browser with a real user gesture. |

## Measured desktop snapshot

The streamed-resource presentation snapshot reduced active renderers from 1,563
to 402 and colliders from 1,395 to 234 at the observed position. The editor
sample changed from 17.93 ms / 55.8 fps to 17.74 ms / 56.4 fps. This is a
directional desktop Editor measurement, not a mobile performance claim.

## Required hosted/device sweep before public release

1. Host the generated `unity/WebGLBuild/` directory with Brotli content types
   configured; confirm a cold boot and a first-tap audio unlock.
2. Test Chrome/Edge desktop: fresh save, migrated save, refresh/resume, 10-minute
   town-to-Cinder traversal, interaction, combat and return to Hearthvale.
3. Test Android Chrome and iOS Safari on physical hardware: touch movement,
   orbit/zoom, audio unlock, background/foreground resume, save restoration and
   long traversal. Record device, OS, browser and frame-time observations.
4. Record the hosting URL and test date in this document, plus any device
   limitation that cannot be fixed inside the Unity project.

Physical-device testing and public hosting are intentionally not marked as
passed here: neither can be truthfully performed from this workspace alone.

## Follow-up build

On 2026-08-23 the hero, wolf and ogre-inclusive candidate completed the same
headless WebGL build path with exit code 0. Its recorded output is 60.77 MB
with a 320 MB initial WebGL memory setting. Visual Play Mode confirmation is
pending only on the currently locked local Mac session; this is not a
substitute for the physical-device sweep above.
