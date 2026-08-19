# Automated build and deploy

Pushing to `main` builds the Unity project and deploys it to Netlify. Nobody
needs the Editor open for a routine change.

## Why the build is not on Netlify

Netlify builds in its own image, which has no Unity and no licence, so it cannot
produce the artifact. Its git integration would only ever redeploy the
TypeScript app. So GitHub Actions builds, and **Netlify is a dumb host receiving
a finished directory** via `netlify deploy --dir unity/WebGLBuild --prod`.

Do not connect the Netlify site to the repo — it would fight this workflow.

## What runs

`.github/workflows/unity-webgl.yml`, on pushes to `main` touching `unity/**`,
and on manual dispatch.

| Job | Needs Unity | Time | Does |
|---|---|---|---|
| `preflight` | no | ~1 min | scene materials, PWA template, core/parity/JSON/sanitizer |
| `build` | yes | 10–30 min | `IsoperiaBuild.BuildWebGL`, uploads `WebGLBuild/` |
| `deploy` | no | ~2 min | `scripts/deploy-report.sh` — deploy, then verify headers |

`preflight` exists because a broken scene should fail in under a minute rather
than after a twenty-minute build. Everything it checks runs without an Editor:
`Isoperia.Core` is declared `noEngineReferences`, and the scene check reads the
scene *file*.

## Secrets to add

**Settings → Secrets and variables → Actions.** The workflow cannot run without
these, and they are the only manual setup.

| Secret | Where from |
|---|---|
| `UNITY_LICENSE` | contents of the `.ulf` file — see below |
| `UNITY_EMAIL` | your Unity account email |
| `UNITY_PASSWORD` | your Unity account password |
| `NETLIFY_AUTH_TOKEN` | Netlify → User settings → Applications → New access token |
| `NETLIFY_SITE_ID` | Netlify → Site configuration → Site ID |

Unity **Personal** is fine and free. To get the `.ulf`: run GameCI's
[activation workflow](https://game.ci/docs/github/activation), which produces a
`.alf` file, upload it at <https://license.unity3d.com/manual>, and paste the
returned `.ulf` contents into `UNITY_LICENSE`.

A Personal licence is single-seat, which is why the Unity work is one job rather
than a build and a test job running in parallel.

## What it will not catch

**Everything that only fails on a device.** Every fault that reached a phone
during Phase 1 — the camera framing the map's corner, the service worker serving
its first build forever, URP installed but never assigned, shared materials
orphaning each other — passed the build, the deploy *and* the header checks. CI
now has a specific guard for each, but the guards were written after the fact,
from a screenshot.

So CI removes the round trip; it does not remove the device check. Home-screen
install, fullscreen launch, safe areas, audio-after-tap and **save durability**
still need a human with a phone, per `docs/EDITOR_LANE.md` Step 8.

## Reading a run

Both reports are appended to the run summary, so the evidence is in the run
rather than in a chat message. `build_id` is the value stamped into
`ServiceWorker.js`; if two deploys share one, the cache bust did not happen and
returning visitors are still on the old build.

The header check writes `VERDICT:` lines and the workflow fails on
`VERDICT: FAIL`. A wasm served as `text/plain` is a dead site that reports as a
successful deploy.

## When you still need dispatch

- Anything that changes `ProjectSettings/` or `.meta` files — CI does not commit
  back to the repo, deliberately, since a workflow that pushes triggers itself.
- Importing assets, wiring prefabs, Blender work.
- Any device test.
