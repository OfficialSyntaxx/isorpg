# Mainland M6 QA Record

## Candidate

- Branch: `main`
- Unity: `6000.5.8f1`
- Target: WebGL
- Build output: `unity/WebGLBuild/` (git-ignored)
- Built: 2026-08-24
- Build ID: `20260824-173100-117bf348`
- Size: 49.53 MB total output; Unity reported 9.7 MB compressed / 19.2 MB uncompressed scene content.

## Evidence completed in this workspace

| Check | Result | Evidence |
| --- | --- | --- |
| Mainland save migration | Pass | Grid/sanitizer EditMode suite previously passed 206/206; a pre-mainland save was observed to migrate and spawn at `(63,63)` without losing state. |
| Runtime mainland traversal | Pass | Play Mode verified player/Core position stay synchronized at the Hearthvale mainland spawn; settlements, discovery, combat clearings, Cinder route and light pools instantiate. Streamed free-model trees and rocks are normalized from their rendered bounds, preventing oversized asset geometry from blocking the third-person camera. |
| Character and motion bridge | Pass | Four Hearthvale NPCs instantiate from `Resources/Art/OwnedModels/villager` with bounded ambient presentation. The owned hero ships as `hero_animated.fbx` with Blender-authored idle, walk, gather, attack, and hit clips; Play Mode verified `PlayerAvatar/HeroModel` with an initialized Animator and no primitive fallback. Owned wolf/ogre actors cover mainland encounters; authoritative harvest and combat events drive presentation without owning gameplay state. |
| Open-world input | Pass in Editor | The third-person controller reads keyboard/gamepad and a left-side touch virtual stick; right-side touch drag orbits, two fingers pinch zoom, and a short tap interacts with nearby targets. This corrected the prior build where the open-world controller had no touch path. |
| WebGL compilation/build | Pass | `Isoperia.EditorTools.IsoperiaBuild.BuildWebGL` completed successfully on 2026-08-24. Build report records Brotli, exceptions None, high stripping, 320 MB initial memory, cache-stamped service worker, and all loader/data/framework/wasm artifacts. |
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

Physical-device testing is intentionally not marked as passed here. Hosted
browser testing is recorded separately after the candidate is deployed.

## Hosted browser check

- URL: `https://radiant-taiyaki-275365.netlify.app/`
- Host: Netlify Drop (public production site)
- Tested: 2026-08-23, desktop Chrome on the build Mac
- Result: Pass — the hosted Brotli build completed its loader after the required
  first tap, entered the 3D Hearthvale scene, and displayed the town, normalized
  tree/rock resources, distant terrain, player, and NPC presentation without
  the previous camera-blocking geometry. The browser surfaced the PWA install
  affordance.
- Still required: a real touch-device traversal, orbit/zoom, background/resume,
  audio, persistence, and long-session sweep.

## Follow-up build

On 2026-08-24 the candidate completed the WebGL path with build ID
`20260824-173100-117bf348`, **49.53 MB** total output, and a 320 MB initial
WebGL memory setting. Unity EditMode tests passed **379/379** before this build.
The candidate includes the animated owned hero, Blender-authored wayfinding
signs, Sunmere/Ember route landmarks, ambient settlement contacts, and bounded
enemy-clearing motion. This is not a substitute for the physical-device sweep.

**Known configuration note:** the build report records `Generic` for WebGL
texture subtarget even though the project requests ASTC. Desktop-browser output
is valid, but mobile texture compression remains a release follow-up to verify
in Unity Build Profiles before public mobile release.

## Latest candidate

On 2026-08-24 the current mainland pass rebuilt successfully as
`20260824-201419-66587a16`, **49.49 MB**. It includes the continuous terrain
shader, grounded travel routes, ocean/horizon surround, owned ore veins,
attunable return-waystones, and Cinder Hollow’s owned gate. The build reported
`Succeeded` with Brotli, exceptions None, high stripping, 320 MB initial
memory, the PWA template, and a cache-stamped service worker. The terrain
shader remains explicitly retained by an authored Resources material. Unity
EditMode tests passed **379/379** immediately before this release-validation
pass.

The outstanding validation remains unchanged: publish this candidate through
the canonical CI deployment, then test touch traversal, camera, audio,
persistence, background/resume, and long-session stability on physical mobile
hardware. The WebGL texture subtarget is still `Generic`; verify ASTC in the
WebGL Build Profile before calling a mobile release ready.
