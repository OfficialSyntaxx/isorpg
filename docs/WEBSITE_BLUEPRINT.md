# Isoperia — Website Blueprint

> **What this document is.** The single tracked plan for the Isoperia public
> website: design system, information architecture, animation, frontend,
> backend, security, and delivery. Every phase below has checkboxes and a
> status. Update this file as work lands — it is the progress record, not a
> one-time proposal.
>
> **What this document is not.** It does not describe the game's internals.
> Those live in `ROADMAP.md`, `docs/ART_BIBLE.md`, `docs/WORLD_LAYOUT.md`, and
> `WIKI.md`. The website consumes the game; it does not redesign it.

**Created:** 2026-08-27 · **Last updated:** 2026-08-27 · **Status:** Phases 2 and 3
done; Phase 4 built. Two gates open, both needing something this environment
cannot provide — see Phase 1 and Phase 4 in §12.

**Rollback anchor (§2.5).** The production deploy serving the game at the root
before any cutover is Netlify deploy `6a8f04e32a032f122bbaba51` on site
`8e151e1b-5592-45b7-b272-1910dba25184` (`inspiring-tarsier-8973d6`). Republishing
that deploy restores the pre-website world exactly.

---

## 0. Progress dashboard

Update the Status column as phases move.

| # | Phase | Owner model | Status | Gate to exit |
|---|---|---|---|---|
| 0 | Decisions & constraints | — | ✅ Done | All four architecture decisions locked (§1) |
| 1 | Deploy composition spike | Opus 5 | 🟡 Code done, gate open | Game verified loading at `/play/` with correct Brotli headers |
| 2 | Design system & tokens | Opus 5 | ✅ Done | Token file + type scale + motion scale reviewed against `docs/ART_BIBLE.md` |
| 3 | Astro workspace scaffold | Opus 5 | ✅ Done | `npm run build` in `web/` green; CI runs it |
| 4 | Landing page build | Opus 5 | 🟡 Built; Lighthouse gate open | All 8 sections live, Lighthouse ≥ 95/100/100/100 |
| 5 | Animation layer | Opus 5 | ⬜ Not started | Motion spec implemented; `prefers-reduced-motion` verified |
| 6 | Content routes (devlog, wiki, roadmap) | Sonnet 5 | ⬜ Not started | Feeds render from repo markdown; RSS valid |
| 7 | Security hardening | Opus 5 | ⬜ Not started | CSP enforced with zero console violations; headers audit passes |
| 8 | Netlify cutover | Opus 5 | ⬜ Not started | Landing at `/`, game at `/play`, no regression in `deploy-report.txt` |
| 9 | Custom domain | Sonnet 5 | ⬜ Not started | DNS live, HTTPS, canonical + redirects correct |
| 10 | Backend Phase B1 (forms) | Sonnet 5 | ⬜ Not started | Newsletter + contact functions live, rate-limited, spam-guarded |
| 11 | Backend Phase B2 (accounts) | Opus 5 | ⬜ Blocked on B1 | Design doc only until greenlit |
| 12 | Backend Phase B3 (cloud saves) | Opus 5 | ⬜ Blocked on B2 | Design doc only until greenlit |

Legend: ⬜ Not started · 🟡 In progress · ✅ Done · ⛔ Blocked · ⏸️ Deferred

---

## 1. Locked decisions

These were decided 2026-08-27 and are the premises everything below rests on.
Changing one means re-reading the sections that cite it.

| # | Decision | Choice | Consequence |
|---|---|---|---|
| D1 | Site layout | Landing at `/`, game at `/play` | The hardened Unity deploy path must change. See §2, and the blocker in §2.3. |
| D2 | Backend scope | Static now, backend fully designed for later | §7 ships as spec, not code. Phase 10 is the only backend work greenlit. |
| D3 | Frontend stack | Astro + TypeScript + GSAP / Motion One | New `web/` workspace; the game's toolchain is untouched. |
| D4 | Domain | Custom domain planned, not yet purchased | Everything is written domain-agnostic against `$SITE_ORIGIN`. §9 is the cutover. |
| D5 | Sub-models | Recommended per workstream, dispatched manually | §11 assigns them. No agent is spawned without an explicit request. |

---

## 2. Architecture: how the landing page and the game share one origin

### 2.1 What exists today

`https://inspiring-tarsier-8973d6.netlify.app` is **not a website**. It is a
dumb host. `.github/workflows/unity-webgl.yml` builds the Unity project on
GitHub Actions and `scripts/deploy-report.sh` runs:

```
npx netlify-cli deploy --dir unity/WebGLBuild --prod --no-build
```

That directory *becomes* the entire site root, every deploy. `docs/CI_DEPLOY.md`
is explicit that the Netlify site must never be connected to the repo, because
Netlify's build image has no Unity and no licence and would only ever redeploy
the old TypeScript prototype.

So there is no "add a page to the site" — there is only "replace the whole
site". That is the constraint D1 has to work around.

### 2.2 Target topology

```
$SITE_ORIGIN/                     ← Astro landing page (web/dist)
  ├── /                           ← Home
  ├── /features, /world, /devlog, /roadmap, /wiki, /press, /legal/*
  ├── /play/                      ← Unity WebGL PWA (unity/WebGLBuild)
  │     ├── index.html
  │     ├── Build/*.br
  │     ├── ServiceWorker.js
  │     └── manifest.webmanifest
  └── _headers, _redirects        ← MERGED, single file, root only
```

The publish directory becomes a **composed** artifact:

```
web/dist/            (Astro output)
  + unity/WebGLBuild/  copied into  web/dist/play/
  = deploy --dir web/dist --prod
```

### 2.3 ⚠️ The blocker this creates — read before writing any code

`unity/Assets/WebGLTemplates/IsoperiaPWA/_headers` declares its rules with
**absolute, root-anchored paths**:

```
/Build/*.wasm.br
  Content-Type: application/wasm
  Content-Encoding: br
```

Unity copies that file to the build root, and today the build root *is* the
site root, so `/Build/*` resolves. Move the game to `/play/` and **every one of
those rules silently stops matching.** The wasm is then served without
`Content-Encoding: br`, and the loader dies with "Unable to parse
Build/xxx.wasm" or hangs on the progress bar.

This is not hypothetical. It is the exact class of failure `docs/CI_DEPLOY.md`
says the header check exists to catch, and the failure `UPDATES.md` records
from 2026-08-26 (the cache/data-size mismatch at 90%).

Compounding it: **Netlify reads only the root `_headers` file.** Two `_headers`
files in one publish directory do not merge — the one at `web/dist/play/_headers`
is ignored entirely and shipped as a public text file.

**Required work in Phase 1, in this order:**

1. Rewrite the template's `_headers` paths to be prefix-aware
   (`/play/Build/*.wasm.br`, `/play/ServiceWorker.js`, `/play/index.html`,
   `/play/manifest.webmanifest`). Make the prefix a template macro alongside
   `__BUILD_ID__` so a root-hosted build stays possible.
2. Have the compose step **concatenate** the game's header rules into the
   landing site's root `_headers` and delete the nested copy.
3. Extend `scripts/verify-pwa-template.cjs` to assert no header rule is
   root-anchored when a prefix is configured. Failing the build is cheaper than
   failing on a phone.
4. Point `scripts/deploy-report.sh`'s post-deploy header check at
   `$SITE/play/Build/...`. That check is the only thing separating "deployed"
   from "actually loads" — it must follow the game.

**What is already safe.** Two things do not need changing, and it is worth
knowing why so nobody "fixes" them:

- `manifest.webmanifest` uses `"start_url": "./index.html"` and `"scope": "./"`
  — relative, so they resolve to `/play/` correctly.
- `index.html` registers `navigator.serviceWorker.register("ServiceWorker.js")`
  — also relative, so the worker's scope becomes `/play/` and it cannot
  intercept landing-page requests. That scope narrowing is a *feature*: the
  cache-first `Build/*` strategy must never see a marketing route.

### 2.4 Deploy triggers

Two independent lanes must not clobber each other. A landing-copy change must
not require a 30-minute Unity build, and a Unity deploy must not wipe the
landing page.

| Change | Workflow | Unity build? | Publishes |
|---|---|---|---|
| `web/**` | `web-deploy.yml` (new) | No | Composed dir, reusing the last Unity artifact |
| `unity/**` | `unity-webgl.yml` (modified) | Yes | Composed dir, rebuilding Astro (~seconds) |

Because Netlify's `--dir` deploy replaces the whole site, **both lanes must
publish the full composed directory.** The landing lane therefore needs the
Unity build without rebuilding it. `unity/WebGLBuild/` is gitignored
(`unity/.gitignore:14`), so it cannot come from git. Two options:

- **Option A (recommended): retained GitHub Actions artifact.** The Unity lane
  already uploads `WebGLBuild/`. The web lane downloads the most recent
  successful one via `actions/download-artifact` with `run-id`. Costs a ~18 MB
  zipped download per landing deploy. Simple, no new infrastructure.

  ⚠️ **Retention is the catch.** The `WebGLBuild` artifact from run #129 expires
  **14 days** after upload, not 90. So a landing-only deploy more than two weeks
  after the last Unity build has nothing to source the game from, and
  `compose-site.cjs` will (correctly) refuse rather than publish a site with no
  `/play`. Before Phase 8 goes to production, set `retention-days: 90` on the
  `WebGLBuild` upload in `unity-webgl.yml`. Until then the preview lane simply
  fails loudly, which is the right behaviour for a spike.
- **Option B: Netlify proxy rewrite.** Keep the game on its own untouched
  Netlify site and proxy `/play/*` to it with a 200 rewrite. Attractive because
  it touches nothing that currently works — but a proxy re-terminating the
  response is a live risk to `Content-Encoding: br` passthrough, and the PWA
  scope/offline story through a proxy is unproven. **Do not adopt without
  measuring the wasm headers through the proxy first.**

**Settled (2026-08-27): Option A.** Implemented in
`.github/workflows/site-preview.yml`. Option B was left unmeasured rather than
dismissed — see the Phase 1 checklist in §12 for what could not be tested and
why.

### 2.5 Rollback

Netlify keeps every deploy immutable and addressable. Before the Phase 8
cutover, record the current production deploy ID. Rollback is a one-click
"Publish deploy" on that ID and restores the game-at-root world exactly.
Write the ID into `unity/deploy-report.txt` as part of the cutover commit.

---

### 2.6 Tooling built for this (Phase 1)

| Path | Does |
|---|---|
| `scripts/compose-site.cjs` | Merges landing output + Unity build into one publish dir; rewrites and merges `_headers`. Refuses unsafe inputs. |
| `scripts/verify-compose.cjs` | 23 assertions over the real template `_headers`. `npm run verify:compose` |
| `scripts/verify-deploy-report.cjs` | 9 assertions driving the header check against a live local server. `npm run verify:deploy-report` |
| `web/` | The Astro workspace (Phase 3). Own lockfile and toolchain, isolated from the game's. |
| `web/src/lib/site.ts` | Typed access to `site.config.json`. Filters out `null` socials so a placeholder is never a dead link. |
| `web/public/theme-init.js` | Applies the saved theme before first paint. External and blocking so it needs only `script-src 'self'`. |
| `.github/workflows/web-ci.yml` | Typecheck, lint, format, build, size report, `npm audit` on `web/**`. |
| `web/src/styles/tokens.json` | **Design token source of truth** (Phase 2). Colour, type, space, motion, plus the contrast contract. |
| `scripts/gen-tokens.cjs` | Emits `tokens.css` from the JSON. `npm run site:tokens` |
| `scripts/verify-tokens.cjs` | 54 contrast/structure assertions over both themes. `npm run verify:tokens` |
| `scripts/gen-specimen.cjs` | Both palettes + every component on one page. `npm run site:specimen` |
| `web/src/styles/base.css`, `components.css` | Reset/elements and the component inventory. Tokens only, no literal colours. |
| `web/site.config.json` | Single source of truth for domain, socials, contact, newsletter, analytics. A `null` url is a placeholder and is **not rendered** — a half-filled config yields a missing link, never a dead one. |
| `.github/workflows/site-preview.yml` | Manual dispatch. Composes and publishes a **draft** deploy, then gates on the header verdict. Cannot reach production. |

`npm run verify:site` runs all three guards (tokens, compose, deploy-report);
`ci.yml` runs it on every push.

**Filling in a social link:** set its `url` in `web/site.config.json` and it
appears. Discord, YouTube, Bluesky, Mastodon, X, Reddit, itch.io and Steam are
stubbed as `null` today; GitHub is live.

---

## 3. Design direction

### 3.1 The brief, honestly read

"No basic designs." The failure mode to avoid is the default indie-game
landing page: a centred logo, a Steam button, three feature cards with
outline icons, a gradient nobody chose. Isoperia has something most of those
pages do not — **a real, running, procedurally-built world** and an art bible
with actual rules. The site should be an extension of the world's material
language, not a brochure placed in front of it.

### 3.2 Concept: "the cartographer's table"

The site reads as a surveyed world — parchment, ink, ordered survey marks —
with the game's own dusk-blue UI as the interface layer sitting on top of it.
This is a direct read of what the project already is: `WORLD_LAYOUT.md`
districts, `docs/concepts/isoperia-overworld-layout-v1.png`, route anchors,
waystones, a mainland with named regions. The world map *is* the brand.

Three material layers, used consistently:

1. **Ground** — warm parchment / ember dark. The page surface.
2. **Ink** — survey lines, contours, route paths, district boundaries. Used for
   structure and for animation paths.
3. **Glass** — the game's HUD language (`src/style.css`): dark blue-ink panels,
   `backdrop-filter: blur(6px)`, 16px radii, soft deep shadow. Used for
   anything interactive, so the site's controls and the game's controls feel
   like the same object.

### 3.3 Palette

> **Superseded by `web/src/styles/tokens.json` (Phase 2, done).** That file is
> the source of truth: `scripts/gen-tokens.cjs` emits the CSS from it and
> `scripts/verify-tokens.cjs` audits it in CI. The block below is kept as the
> record of the *intent*; where the two differ, the JSON is right.
>
> Implementation changed three things, all caught by the audit:
> - **`border-strong` failed WCAG 1.4.11 in both themes** at the values first
>   chosen (2.55:1 light, 2.17:1 dark, against a 3:1 requirement for non-text
>   UI). Now `#8A7859` / `#5A6FA3`, which clear on page *and* card surfaces.
> - **Light mode needed its own accent.** The HUD blue `#6AA8FF` is ~2:1 on
>   parchment — unusable as a link. Light uses `#15579F`; `#6AA8FF` survives as
>   a map *mark*, and the audit asserts it stays below 4.5:1 so nobody mistakes
>   it for text-safe.
> - **Semantic roles replaced raw names.** `--surface-page` / `--text-body` /
>   `--accent` rather than `--ink-900` / `--parchment`, so a component never
>   hardcodes which theme it is in.

Derived from `src/style.css:2-13` (HUD) and `docs/ART_BIBLE.md` (world), not
invented. Both light and dark are first-class — the artifact/theme rule is that
neither is an afterthought.

```css
:root {
  /* Ground — warm, from the Unity manifest theme_color #1a1610 */
  --ground-900: #12100c;
  --ground-800: #1a1610;
  --ground-700: #241f17;
  --parchment:  #ece3d2;
  --parchment-2:#dcd0b8;

  /* Ink — the game HUD, verbatim */
  --ink-900:  #0b1220;   /* --bg */
  --ink-800:  #141c2e;   /* --panel */
  --ink-700:  #1b2740;   /* --panel-2 */
  --ink-100:  #eaf0ff;   /* --ink */
  --ink-muted:#93a1bf;   /* --muted */

  /* Accents — the game HUD, verbatim */
  --accent: #6aa8ff;     /* waystone blue  */
  --good:   #7cd992;     /* meadow green   */
  --gold:   #ffd479;     /* travel lamp    */
  --danger: #ff6b6b;

  /* World — from docs/ART_BIBLE.md, for district identity */
  --meadow: #2E612B;
  --trunk:  #452914;
  --rock:   #5C5E61;

  /* District accents, matching the in-game route anchors (UPDATES.md) */
  --wildwood:  #4f9d5a;  /* green  */
  --frostwatch:#6aa8ff;  /* blue   */
  --miregate:  #3fa89a;  /* teal   */
  --cinder:    #e07b3f;  /* orange */

  --radius: 16px;                              /* --radius, verbatim */
  --shadow: 0 8px 30px rgba(0,0,0,0.45);       /* --shadow, verbatim */
}
```

**Contrast is a gate, not a preference.** Every text/background pair ships at
≥ 4.5:1 (≥ 3:1 for text ≥ 24px). Gold on parchment fails — it is a
border/glyph colour only, never body text.

### 3.4 Type

| Role | Face | Notes |
|---|---|---|
| Display | A high-contrast serif with real character (e.g. *Fraunces*, *Cormorant*) | Google Fonts only — the CSP in §8 permits `fonts.googleapis.com` / `fonts.gstatic.com` and nothing else. Ship `font-display: swap` and a real fallback stack. |
| Body | A neutral humanist sans (e.g. *Inter*) | Optical sizing for long-form devlog reading. |
| Data | A mono (e.g. *JetBrains Mono*) | Build IDs, version stamps, patch numbers, wiki tables. |

Scale: 1.250 (major third) on mobile, 1.333 on ≥ 1024px, driven by `clamp()`
so there is no layout-shifting breakpoint jump. Body copy caps at 68ch.

### 3.5 Grid & spacing

12-column, 1280px max content width, 1520px max for full-bleed world panels.
Spacing on a 4px base with an 8px rhythm. Every section is either full-bleed
(world/atmosphere) or contained (reading) — never a half-committed middle,
which is what makes template sites read as templates.

---

## 4. Information architecture

### 4.1 Route map

| Route | Purpose | Source of truth | Phase |
|---|---|---|---|
| `/` | Landing. Convert a stranger into a player in one scroll. | This doc, §5 | 4 |
| `/play` | The game. Unity WebGL PWA. | `unity/WebGLBuild` | 1, 8 |
| `/features` | Systems deep-dive: skills, combat, settlement, mastery. | `README.md`, `WIKI.md` | 6 |
| `/world` | The mainland: districts, routes, landmarks. Interactive map. | `docs/WORLD_LAYOUT.md`, `docs/MAINLAND_WORLD_PLAN.md` | 6 |
| `/devlog` | Dated development entries with real screenshots. | `UPDATES.md` | 6 |
| `/devlog/[slug]` | A single entry. | `UPDATES.md` | 6 |
| `/roadmap` | Public phase status. | `ROADMAP.md` | 6 |
| `/wiki` | Generated game data: items, monsters, XP, drops. | `WIKI.md` (already generated by `npm run wiki`) | 6 |
| `/press` | Press kit: logline, screenshots, logos, factsheet, contact. | New | 6 |
| `/legal/privacy`, `/legal/terms` | Required before any form or account exists. | New | 10 |
| `/404` | In-world, not a stack trace. | New | 4 |

**The content leverage here is large and worth stating plainly:** `UPDATES.md`
is 123 KB of genuine, dated development history, `WIKI.md` is generated from
game data, and `ROADMAP.md` tracks real phases. Most indie sites have to invent
a devlog. This one has three years of content already written and only needs a
parser. That is why §6 puts content routes on Sonnet 5 — it is transformation
work, not authoring.

### 4.2 Content pipeline

Astro content collections read the repo's markdown directly at build time.
No CMS, no duplication, no drift:

```
UPDATES.md   → split on "## YYYY-MM-DD · Title" → devlog entries
ROADMAP.md   → parse phase headings + checkpoints → roadmap timeline
WIKI.md      → already machine-generated by scripts/gen-wiki.cjs → wiki tables
docs/screenshots/*, docs/concepts/* → gallery + press kit
```

Two rules keep this honest:

- The parser is **strict**: an entry that does not match the expected heading
  shape fails the build rather than being silently dropped. A devlog that
  quietly loses entries is worse than no devlog.
- `UPDATES.md` stays the authoring surface. Nobody writes devlog content in
  `web/`. One source, one truth — the same discipline `ci.yml` already enforces
  with its "generated files are stale" check.

---

## 5. The landing page, section by section

Eight sections. Each one has a job; if it does not have a job it does not ship.

**1 — Hero: "The world builds itself."**
Full-viewport. Live procedural isometric terrain rendered in a canvas behind
the headline — genuinely generated in-browser, reusing the *actual* generation
approach from `src/generators/` and `src/world/Grid.ts` rather than a video
loop. It is the honest hook: the game's whole premise is zero-asset procedural
generation, so the hero should generate. Primary CTA **Play in browser** →
`/play`. Secondary **Watch it run** → scrolls to §3.
*Fallback:* a static WebP first frame under `prefers-reduced-motion`, on
`save-data`, or if WebGL/canvas is unavailable. The fallback is authored, not
degraded — it must look deliberate.

**2 — The one-line pitch + trust row.**
One sentence of what Isoperia is. Beneath it: platform badges (browser, PWA,
installable, offline-capable, free), each one a claim the project can actually
back — `README.md` documents offline idle progression and the PWA is real.

**3 — Systems showcase.**
Horizontal-scroll or pinned-scroll sequence over the pillars: gather → craft →
build → fight → explore. Each panel pairs a real screenshot from
`docs/screenshots/` with a short, specific line. No feature-card grid.

**4 — The mainland map.**
Interactive SVG of the overworld from `docs/WORLD_LAYOUT.md`. Districts
highlight on hover/tap with their route-anchor colour (§3.3) and reveal a
short description. This is the section that makes the site memorable and it is
also the strongest argument for the "cartographer's table" concept — the asset
already exists in `docs/concepts/isoperia-overworld-layout-v1.png`.

**5 — Progression.**
The OSRS-style XP curve made visual: an animated curve with mastery
milestones. Data comes from `src/data/XPTable.ts`, so the chart is *true*.
Per the dataviz discipline: one accessible palette, direct labels over a
legend, no chartjunk.

**6 — Built in the open.**
The three most recent devlog entries from `UPDATES.md`, with dates and the real
build IDs. This is the credibility section and it costs nothing to maintain
because it is generated.

**7 — Play CTA.**
Repeat the primary action with the install/PWA path spelled out: play in
browser now, or add to home screen. Explicitly state that saves are local and
offline-capable — that is a genuine differentiator, and §7 shows it is also a
constraint worth being honest about.

**8 — Footer.**
Navigation, press kit, licence and asset credits (`docs/ASSET_CREDITS.md` — CC0
attribution is an obligation, not a courtesy), and legal links.

---

## 6. Motion & animation specification

"Animations included" is the part most likely to go wrong, so this section is
prescriptive. The goal is motion that reads as *craft*, not as *effects*.

### 6.1 Principles

1. **Motion explains, or it does not exist.** Every animation either shows a
   causal relationship, directs attention, or gives feedback. Decorative motion
   with no job is cut in review.
2. **One motion language.** Same easing family, same duration scale, same
   spatial logic across the whole site. Inconsistent motion is the tell of an
   assembled page.
3. **The world moves slowly; the interface moves fast.** Ambient/world layers
   run 600–2400 ms. Interface feedback runs 120–260 ms. This mirrors the game:
   a 600 ms tick engine under a responsive HUD.
4. **60 fps or it gets simplified.** Compositor-only properties (`transform`,
   `opacity`, `filter`). Anything animating `width`, `top`, or `box-shadow` in
   a scroll handler is a defect.
5. **Reduced motion is a real design, not a kill switch.** Under
   `prefers-reduced-motion: reduce`, transforms and parallax stop, but
   opacity/colour transitions ≤ 150 ms remain and every scroll-triggered
   element renders in its final state immediately. Nothing becomes invisible or
   unreachable. **This is a launch gate, not a nice-to-have.**

### 6.2 Scales

```
--dur-instant: 120ms   /* toggles, presses          */
--dur-quick:   200ms   /* hovers, tooltips          */
--dur-base:    320ms   /* panels, reveals           */
--dur-slow:    600ms   /* section transitions       */
--dur-world:  1800ms   /* ambient world layers      */

--ease-out:   cubic-bezier(0.16, 1, 0.3, 1);      /* entrances */
--ease-in-out:cubic-bezier(0.65, 0, 0.35, 1);     /* movement  */
--ease-spring:cubic-bezier(0.34, 1.56, 0.64, 1);  /* feedback  */
```

### 6.3 The set pieces

| # | Where | What | How |
|---|---|---|---|
| M1 | Hero | Terrain tiles rise into place on load, then a slow ambient day/night wash | Canvas 2D or a thin three.js scene; staggered `y` + opacity, 24 ms stagger, ~1200 ms total |
| M2 | Global | Scroll-linked parallax across ground / ink / glass layers | `ScrollTrigger` with `scrub`, max 40px displacement — restraint is what separates this from a template |
| M3 | §3 Systems | Pinned horizontal scroll through the five pillars | GSAP `ScrollTrigger` pin + `x` translate; falls back to native scroll-snap under reduced motion |
| M4 | §4 Map | Route paths draw themselves; districts lift on hover | SVG `stroke-dashoffset` draw, 900 ms, `--ease-in-out`; districts `translateY(-4px)` + accent glow |
| M5 | §5 Progression | XP curve draws left-to-right, milestones pop in sequence | Path draw + `--ease-spring` scale on milestone dots |
| M6 | Global | Section reveals | `IntersectionObserver`, 12px rise + fade, 60 ms stagger, `--dur-base` |
| M7 | Global | Nav/CTA feedback | Scale 0.97 press, glass highlight sweep on hover, `--dur-instant` |
| M8 | `/play` | Hand-off transition into the game | Ink layer wipes over, hold, then navigate — hides the Unity loader's first blank frame |
| M9 | Global | Page transitions | Astro View Transitions API, native, no JS framework cost |
| M10 | `/404` | An in-world "off the map" scene | Reuses M4's route-drawing primitives |

### 6.4 Library choice

- **GSAP + ScrollTrigger** for the set pieces (M1–M5, M8). Nothing else does
  pinned scroll orchestration as reliably across mobile Safari, which — given
  this is a mobile-first project — is the browser that decides.
- **Motion One** (or raw CSS + `IntersectionObserver`) for M6/M7. Small,
  hardware-accelerated, no need for the full GSAP timeline machinery.
- **View Transitions API** for M9. Native, free.

GSAP loads **only on routes that use it**, via a dynamic `import()` inside an
Astro island. It must never enter the base bundle — that would defeat the
entire reason D3 chose a static-first framework.

### 6.5 Motion budget

| Metric | Budget |
|---|---|
| Long tasks during hero animation | 0 over 50 ms |
| Dropped frames, mid-tier Android, hero | < 5% |
| CLS from any animation | 0 (transform/opacity only) |
| Animation JS on a route with no set piece | 0 KB |

---

## 7. Backend

Per D2: **nothing here ships except Phase 10.** B2 and B3 are specified so that
the static site does not paint them into a corner, and so the security model is
designed before the first credential exists — not after.

### 7.1 Phase B1 — forms (Phase 10, greenlit)

Two Netlify Functions. No database.

| Endpoint | Purpose | Protections |
|---|---|---|
| `POST /api/subscribe` | Newsletter signup → ESP API | Honeypot field, timing check (< 2 s = bot), per-IP rate limit, email validation, ESP key server-side only |
| `POST /api/contact` | Press/contact → email relay | Same, plus body length cap and no HTML passthrough |

Rules: no PII in logs. Explicit consent copy with a link to
`/legal/privacy`. Double opt-in — it is both correct and required in the EU.
Function returns generic errors; detail goes to server logs only.

### 7.2 Phase B2 — accounts (design only)

If and when accounts are greenlit:

- **Auth provider, not hand-rolled.** Supabase Auth, Clerk, or Auth0. Password
  handling, session rotation, MFA, and breach response are solved problems and
  hand-rolling them is how indie games leak credentials.
- Email + OAuth (Discord and Google — Discord is where this audience is).
- Sessions in `HttpOnly; Secure; SameSite=Lax` cookies. **Never
  `localStorage`** — the game's own save layer is in `localStorage`, and a
  token sharing that surface is one XSS away from account takeover.
- Minimal profile: id, display name, created_at, region. Email lives with the
  auth provider, not in the app database.

```sql
create table profile (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null check (char_length(display_name) between 3 and 20),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz
);
alter table profile enable row level security;
create policy "read own"   on profile for select using (auth.uid() = id);
create policy "update own" on profile for update using (auth.uid() = id);
```

### 7.3 Phase B3 — cloud saves (design only)

This is the section with the sharpest engineering problem, so it is worth
stating clearly rather than hand-waving.

Isoperia's save is **client-authoritative by design**: `SaveSystem.ts` writes
`localStorage` with an IndexedDB backup, sanitized JSON import/export, and
rollback recovery. `README.md` advertises import/export as a *feature*. That
means a player can already hand-edit their save, and the game is fine with it.

Cloud saves do not change that. **A synced save is a backup, not a source of
truth.** Do not build a leaderboard on top of it and call the numbers real.

```sql
create table save_slot (
  user_id     uuid not null references auth.users on delete cascade,
  slot        smallint not null check (slot between 1 and 3),
  payload     jsonb not null,
  checksum    text not null,
  version     integer not null,
  client_time timestamptz not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table save_slot enable row level security;
create policy "own slots" on save_slot
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- **Size cap enforced server-side** (256 KB). Reject, do not truncate.
- **Schema-validate on write** with the *same* sanitizer the client uses —
  `npm run verify:sanitizer` already exists to keep the TS and Unity sanitizers
  in parity, and the server becomes a third consumer of that contract.
- **Conflict resolution: last-write-wins, with the loser retained.** Keep the
  overwritten payload for 30 days. Silently destroying a player's progress is
  the single worst bug a cloud save can have.
- **Never trust the payload for anything competitive.** If leaderboards are
  ever wanted, they need server-simulated or server-observed events, which is a
  different and much larger project. Say so out loud rather than shipping a
  board everyone can edit.

---

## 8. Security

### 8.1 Response headers

Delivered via the merged root `_headers` (§2.3). These are **additive** to the
Unity rules, which must survive the merge intact.

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  X-Frame-Options: DENY
```

Notes that matter:

- `'wasm-unsafe-eval'` is **required** by Unity WebGL and is not optional. It
  is narrower than `'unsafe-eval'` and is the correct directive here.
- `frame-ancestors 'none'` prevents the game being embedded and monetised on
  scraper portals — a real and common outcome for browser games.
- **No `'unsafe-inline'` in `script-src`.** Astro can hash or externalise
  inline scripts; GSAP does not need it. If something demands it, that thing
  gets fixed, not the policy.
- Deploy CSP in `Content-Security-Policy-Report-Only` first, gather violations
  from real traffic, then enforce. Enforcing an unvalidated CSP on a Unity
  WebGL page is how you ship a blank screen.
- **COEP/COOP:** `Cross-Origin-Embedder-Policy: require-corp` is deliberately
  **not** set. It would enable `SharedArrayBuffer` (Unity threading) but breaks
  any cross-origin subresource. Revisit only if the Unity build is reconfigured
  for threads, and treat it as its own spike.

### 8.2 Threat model

| # | Threat | Surface | Mitigation | Phase |
|---|---|---|---|---|
| T1 | XSS via devlog markdown | Content pipeline | Build-time render, sanitize HTML, no `set:html` on untrusted input. Content is repo-authored, so the real risk is a compromised commit — hence CI review. | 6 |
| T2 | Clickjacking / embedding the game | `/play` | `frame-ancestors 'none'` + `X-Frame-Options` | 7 |
| T3 | Supply chain (npm) | `web/` deps | Lockfile committed, `npm ci` only, Dependabot, pinned major versions, `npm audit` in CI. GSAP and Astro are the only non-trivial additions. | 3, 7 |
| T4 | Secret leakage | CI | Secrets are Actions secrets only; never in `web/` env at build time; `run_secret_scanning` on the repo. `docs/CI_DEPLOY.md` already treats `UNITY_LICENSE` correctly — extend that discipline. | 3 |
| T5 | Form spam / abuse | B1 functions | Honeypot, timing, per-IP rate limit, size cap | 10 |
| T6 | Save tampering | Client saves | Accepted by design (§7.3). Never used for competitive claims. | — |
| T7 | Stale service worker serving a dead build | `/play` | Already solved — build ID stamped into every URL and the cache version (`UPDATES.md`, 2026-08-26). **Do not regress this during the `/play` move.** | 1, 8 |
| T8 | Header regression killing the wasm | Deploy | The `VERDICT: FAIL` check in `scripts/deploy-report.sh`, repointed at `/play` | 1, 8 |
| T9 | Dependency-free claim drift | Landing | The landing page must not import the game's runtime; they share tokens, not code | 4 |
| T10 | PII in analytics | Analytics | Cookieless, IP-truncating, self-hostable (§10) | 6 |

### 8.3 Practices

- No secrets in client bundles, ever. Anything in `web/` `PUBLIC_*` is public.
- Dependencies reviewed on addition, not just on audit. Every new package in
  `web/package.json` needs a one-line justification in the PR.
- `npm audit --audit-level=high` fails CI.
- Legal pages exist **before** the first form collects the first email.

---

## 9. Performance, accessibility, SEO

### 9.1 Budgets (enforced in CI, not aspirational)

| Metric | Landing | `/play` |
|---|---|---|
| LCP | < 1.8 s (4G, mid Android) | n/a — Unity loader owns it |
| INP | < 200 ms | n/a |
| CLS | < 0.05 | < 0.05 |
| JS shipped, first load | < 60 KB gzip (excl. lazy GSAP) | ~50 MB Brotli, unavoidable |
| Total, first load | < 400 KB | — |
| Lighthouse | ≥ 95 perf / 100 a11y / 100 best-practice / 100 SEO | — |

Images: AVIF with WebP fallback, `loading="lazy"` below the fold, explicit
`width`/`height` on every one (CLS is almost always an unsized image).

### 9.2 Accessibility — a gate, not a pass

- WCAG 2.2 AA. Contrast verified per §3.3, not assumed.
- Full keyboard operability, visible focus rings that survive the design
  (a designed focus ring, not `outline: none`).
- Semantic landmarks; one `h1` per route; heading order never skips.
- `prefers-reduced-motion` honoured across every M1–M10 set piece (§6.1.5).
- Every image has meaningful alt text; decorative ones get `alt=""`.
- The interactive map (§5.4) needs a keyboard path and a text equivalent —
  an SVG map that only works with a mouse fails.
- The `/play` link states its weight honestly: a ~50 MB download is
  information a user on metered data is entitled to before tapping.

### 9.3 SEO

- Per-route `<title>`, meta description, canonical against `$SITE_ORIGIN`.
- Open Graph + Twitter cards with a designed 1200×630 image per route type.
- `VideoGame` JSON-LD on `/`; `Article` on devlog entries.
- `sitemap.xml` + `robots.txt` generated by Astro.
- RSS at `/devlog/rss.xml`.
- **`/play` gets `noindex`.** A 50 MB WebGL app is not a search result; the
  landing page is. Google indexing the loader instead of the site is a real and
  common own-goal.

---

## 10. Analytics

Cookieless and privacy-preserving — Plausible, Fathom, or self-hosted Umami.
No Google Analytics: it requires a cookie banner, weakens `connect-src`, and
buys nothing this project needs. Track four things and no more: page views,
`/play` click-through, devlog reads, newsletter conversions.

---

## 11. Sub-model assignments

Per D5: these are recommendations for manual dispatch. No agent is spawned
without an explicit request.

**The heuristic:** Opus 5 for work where a wrong decision is expensive to
reverse (architecture, security, deploy, motion orchestration, visual
judgement). Sonnet 5 for well-specified transformation and implementation where
the target is unambiguous. Haiku 4.5 for mechanical, verifiable passes.

| Workstream | Model | Why |
|---|---|---|
| Deploy composition spike (Ph 1) | **Opus 5** | Touches the one hardened, working path in the repo. The `_headers` failure mode (§2.3) is subtle and has already reached a phone once. Highest blast radius in the plan. |
| Design system & tokens (Ph 2) | **Opus 5** | Visual judgement and cross-referencing three existing sources. Taste-dependent and sets constraints everything else inherits. |
| Astro scaffold (Ph 3) | **Sonnet 5** | Well-trodden setup with a clear target. |
| Landing page structure (Ph 4) | **Opus 5** for §5.1/§5.4/§5.5, **Sonnet 5** for §5.2/§5.6/§5.7/§5.8 | The hero, the map, and the chart carry the "not basic" requirement. The rest is assembly against a settled spec. |
| Animation layer (Ph 5) | **Opus 5** | Orchestration, easing judgement, and the reduced-motion design. Getting this merely "fine" is the most likely way the site reads as generic. |
| Content pipeline (Ph 6) | **Sonnet 5** | Parsing `UPDATES.md` / `ROADMAP.md` / `WIKI.md` is specified transformation with a testable output. |
| Wiki + roadmap routes (Ph 6) | **Haiku 4.5** | Template rendering over already-structured data. |
| Security hardening (Ph 7) | **Opus 5** | CSP against a Unity WebGL payload is genuinely easy to get wrong in a way that ships a blank page. |
| Netlify cutover (Ph 8) | **Opus 5** | Production change with a live rollback requirement. |
| Custom domain (Ph 9) | **Sonnet 5** | Procedural once the origin is parameterised. |
| Backend B1 forms (Ph 10) | **Sonnet 5** | Small, well-understood serverless surface. |
| Backend B2/B3 design | **Opus 5** | Auth and save-conflict semantics. Mistakes here lose player data. |
| Copywriting | **Opus 5** | Voice is the difference between this and every other indie landing page. |
| Alt text, meta descriptions, OG copy | **Haiku 4.5** | High volume, low ambiguity, individually verifiable. |
| Lighthouse / a11y audit passes | **Haiku 4.5** | Run, report, fix mechanically against a fixed rubric. |
| Cross-browser QA | **Sonnet 5** | Playwright already in the repo (`playwright-core` in `devDependencies`); mobile Safari is the one that matters. |

**Parallelisable without conflict:** Ph 2 ∥ Ph 3, and Ph 6 ∥ Ph 5.
**Strictly serial:** Ph 1 → Ph 8 (deploy), and Ph 3 → everything in `web/`.

---

## 12. Phase plan

### Phase 1 — Deploy composition spike 🟡

- [x] **Option A chosen: artifact reuse.** Implemented in
      `.github/workflows/site-preview.yml`, which pulls `WebGLBuild` from the
      most recent successful `unity-webgl.yml` run instead of rebuilding.
- [ ] **Option B (proxy rewrite) not measured.** It cannot be measured from a
      sandboxed session: outbound requests to `netlify.app` are blocked by the
      agent proxy, so no header can be read back. Left explicitly unmeasured
      rather than assumed. Reasoning for preferring A regardless: a proxy
      re-terminates the response, putting `Content-Encoding: br` passthrough at
      risk for a 50 MB payload, and it bills the transfer twice. Revisit only
      if A proves painful.
- [x] ~~Parameterise the WebGL template `_headers` with a path-prefix macro.~~
      **Superseded — see the deviation note below.** The prefixing happens at
      compose time in `scripts/compose-site.cjs` instead.
- [x] Compose script — `scripts/compose-site.cjs`. Merges the landing output
      and the Unity build, rewrites the game's header rules under the prefix,
      merges them into a single root `_headers`, and deletes the nested copy.
      Refuses to compose a tree with no game, no `Build/` payload, no
      `_headers`, a multi-segment prefix, or a mount-point collision.
- [x] Header-rule guard — `scripts/verify-compose.cjs` (23 assertions). Written
      as its own script rather than added to `verify-pwa-template.cjs`, because
      that one skips itself when no browser is present and this check must never
      be skippable. It runs the **real** template `_headers` through the
      composer, so a future root-anchored rule fails CI. Mutation-tested:
      disabling the rewrite fails 7 assertions.
- [x] `scripts/deploy-report.sh` header check follows the game — `GAME_PREFIX`,
      plus `DEPLOY_DIR`/`GAME_DIR` so the composed tree is what gets published.
      Covered by `scripts/verify-deploy-report.cjs` (9 assertions) against a
      live local server serving correct and broken headers.
- [x] Both guards wired into `ci.yml` as `npm run verify:site`. Neither needs
      Unity, a licence, or a browser.
- [x] Interim holding page so there is something at the root to compose
      against — `scripts/gen-holding-page.cjs`, generated from
      `web/site.config.json`. Not the landing page; Phase 4 replaces it.
- [x] Record the current prod deploy ID for rollback (§2.5) — at the top of
      this document.
- [ ] **OPEN — needs a real Unity build.** Run
      `.github/workflows/site-preview.yml` (manual dispatch) and confirm the
      game loads end-to-end at `/play/`, including service-worker registration
      and scope. Requires `NETLIFY_AUTH_TOKEN` / `NETLIFY_SITE_ID` and one
      successful `unity-webgl.yml` run to source the artifact from. This step
      publishes a **draft** deploy (`DEPLOY_PROD=0`) and cannot reach
      production.

**Exit gate:** a preview URL where `/play/` boots to the Isoperia start screen
with zero console errors and a `VERDICT: OK` header report.

#### Deviation from the original plan, and why

The blueprint proposed parameterising the Unity template's `_headers` with a
path-prefix macro. Implementation showed a better option. `IsoperiaBuild.cs`
copies `_headers` verbatim and only substitutes `__BUILD_ID__` post-build, so a
macro would have meant a C# change that cannot be compiled or tested without a
Unity licence and a 10–30 minute build per iteration.

Doing the rewrite in the compose step instead:

- needs no C# change, and is fully testable in Node on every push;
- leaves the Unity build independently deployable at the root, which keeps the
  §2.5 rollback path working unchanged;
- keeps one owner for the prefixing, which the CI guard can assert against.

#### Pre-existing bug found and fixed

`scripts/deploy-report.sh` wrote `VERDICT: WRONG`, while `unity-webgl.yml:166`
greps for `VERDICT: FAIL` and `docs/CI_DEPLOY.md:104` documents `VERDICT: FAIL`.
**The workflow's header fail-gate could never fire.** A wasm served as
`text/plain` — the exact dead-site failure that check exists to catch, and the
one T8 depends on — would have been reported as a successful deploy. Now
corrected to `VERDICT: FAIL`, with the failing status, content-type,
content-encoding and URL printed alongside it, and regression-tested. A build
with no matching payload also used to return silently with no verdict at all;
that now fails too.

### Phase 2 — Design system ✅

- [x] Token source — `web/src/styles/tokens.json`. Colour, type, space, radius,
      shadow, motion, layout; light and dark both complete. `gen-tokens.cjs`
      emits `tokens.css` with three theme blocks: `:root` (full light palette),
      `prefers-color-scheme: dark` guarded by `:not([data-theme="light"])`, and
      `[data-theme="dark"]` so an explicit choice wins in both directions. No
      token is defined only inside a media query.
- [x] Contrast audit — `scripts/verify-tokens.cjs`, 54 assertions across both
      themes, in CI via `npm run verify:site`. It caught two real failures on
      first run (see §3.3). It also checks that both themes declare identical
      token sets and that every colour parses — a typo'd hex is dropped by the
      browser and silently inherits, which survives review.
- [x] Forbidden pairs are asserted to **fail**, not just documented: gold, HUD
      blue and route orange on parchment. If a palette edit ever makes one pass,
      the audit flags it so the ban is revisited deliberately rather than
      decaying silently.
- [x] Fluid type scale with `clamp()`, ~1.25 mobile → ~1.333 desktop. Three
      faces, each justified in the JSON: **Fraunces** (display — variable serif
      with optical sizing and real character, reads as almanac/survey),
      **Inter** (body), **JetBrains Mono** (build IDs, wiki data). Google Fonts
      only, per the §8.1 CSP; every stack ends in a real system fallback.
- [x] Component inventory — `web/src/styles/components.css`: button (4
      variants), link, card, glass panel, tag, district chip, nav, footer,
      table, code block, callout (3 variants), reveal primitive. Plus
      `base.css` for reset, element defaults, skip link and a designed focus
      ring. No literal colours anywhere — everything is a token, so the audit
      covers the whole surface.
- [x] Specimen page — `npm run site:specimen`. Both palettes with real measured
      ratios, the type scale, and every component on one page. Reviewed at
      1280px and 390px in both themes: no console errors, no horizontal
      overflow, and under `prefers-reduced-motion` reveal elements render at
      full opacity with no transform.
- [x] Reviewed against `docs/ART_BIBLE.md`. `--success` is the art bible's
      meadow `#2E612B` verbatim; trunk `#452914` and rock `#5C5E61` are carried
      as `--mark-trunk` / `--mark-rock`, reserved for map and illustration fills
      — never chrome, never text. The dark theme is `src/style.css` verbatim
      where it can be, so site panels and game HUD panels are the same object.

#### Bugs found and fixed during the visual review

Numbers alone would have shipped both of these:

- **A card that was a link rendered its entire body as underlined accent text.**
  `<a class="card">` inherited the link colour and underline. The card is the
  affordance; the anchor is only how it is reached.
- **The specimen printed light-theme hex values while displaying dark.** The
  swatch chips were theme-reactive but their labels were baked from one theme,
  so the page lied about itself. It now renders both palettes at once with
  literal values, which is more useful for review anyway.

### Phase 3 — Astro workspace ✅

- [x] `web/` workspace with its own `package.json` and lockfile, isolated from
      the root. The root `package.json` declares no npm workspaces, so the two
      trees never resolve into each other. Root `npm test` and `npm run build`
      both re-verified unaffected.
- [x] Astro 7 + TypeScript 5 strict (`astro/tsconfigs/strict` plus
      `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), ESLint 10
      flat config, Prettier with the Astro plugin. Clean rebuild from an empty
      `dist`: **0 errors, 0 warnings, 0 hints**; lint, format check and
      `npm audit --audit-level=high` all clean.
- [x] `BaseLayout.astro` — head, canonical, Open Graph, per-theme
      `theme-color`, skip link, header, footer. `SiteHeader`, `SiteFooter`,
      `ThemeToggle`. Tokens wired via `src/styles/global.css`; the layout owns
      no colours of its own.
- [x] Theme handling verified end to end in a real browser: light and dark both
      correct from the OS preference, the toggle round-trips, the choice
      persists across reload, and `data-theme` is applied **before first paint**
      so there is no flash. `aria-pressed` and the screen-reader label track the
      state.
- [x] `web-ci.yml` — typecheck (`astro check`, which covers `.astro`
      frontmatter that `tsc` alone does not see), lint, format check, build,
      build-size report to the run summary, and a guard that `dist/_headers`
      still exists (Astro silently dropping it would cost the site its security
      headers).
- [x] Verified at 1280px and 390px, both themes: no console errors, no
      horizontal overflow.
- [x] End-to-end integration: the real `web/dist` composes with a game fixture
      into `dist-site` with the landing `/*` rules first and all 12 game rules
      rewritten under `/play/`.

#### Toolchain findings

Two version constraints that are worth recording, because both would otherwise
be rediscovered painfully:

- **TypeScript 7 is unusable here.** `typescript-eslint@8` declares
  `typescript >=4.8.4 <6.1.0`. TS 5.9 is pinned instead, which also matches the
  root repo's `^5.6.3` and keeps one TS major across the repository.
- **`eslint-plugin-jsx-a11y` is omitted deliberately.** `eslint-plugin-astro@3`
  requires ESLint 10, but its own optional peer `jsx-a11y@6.10.2` supports only
  up to ESLint 9 — an unsatisfiable pair mid-migration. Rather than force a
  knowingly-broken tree with `--legacy-peer-deps`, it is left out; `jsx-a11y` is
  a *peerOptional*, so the install is clean without it. Accessibility is still
  covered by Astro's dev-time audits and, decisively, by the Lighthouse 100 gate
  in Phase 4. Revisit when `jsx-a11y` supports ESLint 10.

#### The interim holding page is gone

`scripts/gen-holding-page.cjs` existed only so Phase 1 had something at the root
to compose against before Astro existed. `web/src/pages/index.astro` now fills
that role, and keeping two generators for "the root page" is exactly the drift
this plan keeps guarding against, so it was removed and `site-preview.yml` now
builds the real site. The current home page is still an interim scaffold — Phase
4 replaces it with the eight designed sections.

### Phase 4 — Landing page 🟡

- [x] All eight sections per §5. Hero (generative), pitch + trust row, five
      systems, mainland map, progression curve, devlog, closing CTA, footer.
- [x] **The hero genuinely generates.** `src/scripts/hero-terrain.ts` builds
      isometric terrain from seeded value noise at load, echoing the game's own
      zero-asset approach rather than shipping a picture of it. Deterministic
      seed, so the frame is reviewable. Palette read from the live CSS custom
      properties, so it follows the theme and inherits the Phase 2 audit.
- [x] **Every number on the page is real.** The XP curve is the game's own
      table (`verify:xp` asserts parity, 7 assertions), the devlog is the three
      newest entries parsed from `UPDATES.md`, the districts are the spatial
      contract in `docs/WORLD_LAYOUT.md`, and the systems copy names the skills
      and buildings actually in `src/data/`.
- [x] Responsive 360 → 1920, verified at six widths: **zero horizontal overflow
      at every one**. Minimum touch target 44px.
- [x] `/404` — in-world, reusing the map's survey language rather than a
      one-off illustration. `noindex`.
- [x] Reduced motion verified as a designed state: the canvas is skipped
      entirely and the authored gradient composition carries the hero, with the
      headline and CTAs untouched. Also skipped on `save-data`.
- [x] Keyboard/AT path on the map verified — the buttons drive it, `aria-expanded`
      and the map highlight both track.
- [x] **First load: 15.4 KB gzipped total** (9.8 KB HTML with inlined module
      scripts, 5.1 KB CSS, 0.8 KB theme init) against a 60 KB JS / 400 KB total
      budget (§9.1). No chart library, no animation library yet.
- [ ] **OPEN — Lighthouse ≥ 95/100/100/100.** Not runnable here: this sandbox
      has no Lighthouse and blocks the Google Fonts requests the real page
      makes, so any score it produced would be measuring a different page.
      Verified proxies in the meantime: no console errors, no layout overflow at
      any width, one `h1` per page, semantic landmarks, `alt` on every image,
      audited contrast, and the transfer sizes above. Run it against the
      preview deploy once Phase 1's gate is closed.

#### Bugs found and fixed during the visual review

Four, all invisible to the typecheck and the automated checks:

- **The hero left two empty triangles.** The paint loop iterated a rectangle of
  *grid* coordinates, but an isometric projection maps a grid rectangle to a
  screen *diamond* — so the viewport's corners were never drawn. It now projects
  each screen corner back into grid space and iterates that bounding box.
- **`costs13,034,431 experience`** and **`© 2026Isoperia`** — Prettier moved an
  expression onto its own line and Astro then dropped the newline between
  adjacent text and expression. Both now pin the space explicitly.
- **Cinder Hollow sat outside the map frame** and read as a clipped blob. The
  frame was widened and it became a proper region with the longest route on the
  map leading to it.
- A card that was a link rendered its whole body as underlined accent text
  (fixed in Phase 2, found the same way).

### Phase 5 — Animation ⬜

- [ ] Motion tokens from §6.2.
- [ ] M1–M10 implemented.
- [ ] GSAP dynamically imported, verified absent from the base bundle.
- [ ] `prefers-reduced-motion` pass on every set piece.
- [ ] Frame-rate check on a real mid-tier Android — the project's own history
      (`docs/CI_DEPLOY.md`, "what it will not catch") says device checks are not
      optional.

### Phase 6 — Content routes ⬜

- [ ] `UPDATES.md` parser with strict failure on malformed entries.
- [ ] `/devlog`, `/devlog/[slug]`, RSS.
- [ ] `/roadmap` from `ROADMAP.md`.
- [ ] `/wiki` from `WIKI.md`.
- [ ] `/features`, `/world`, `/press`.
- [ ] Analytics (§10).

### Phase 7 — Security ⬜

- [ ] CSP in report-only; collect violations from the preview deploy.
- [ ] Resolve every violation; switch to enforce.
- [ ] Full header set applied and verified with an external scanner.
- [ ] Dependabot + `npm audit` gate.
- [ ] `/legal/privacy`, `/legal/terms`.

### Phase 8 — Cutover ⬜

- [ ] Set `retention-days: 90` on the `WebGLBuild` artifact upload in
      `unity-webgl.yml` (default is 14 — see §2.4 Option A).
- [ ] Final preview verification of `/` **and** `/play`.
- [ ] Publish. Confirm `deploy-report.txt` `VERDICT: PASS`.
- [ ] Verify a returning visitor with an old service worker still updates
      (regression check on T7).
- [ ] Device sweep: install to home screen, fullscreen launch, safe areas,
      audio-after-tap, save durability.
- [ ] Record the rollback deploy ID in `UPDATES.md`.

### Phase 9 — Custom domain ⬜

- [ ] Purchase; point DNS at Netlify.
- [ ] HTTPS + HSTS (only after the domain is confirmed correct — HSTS preload
      is hard to undo).
- [ ] Canonical URLs, OG absolute URLs, sitemap regenerated.
- [ ] 301 from the `netlify.app` origin.

### Phase 10 — Forms ⬜

- [ ] `/api/subscribe`, `/api/contact` with §7.1 protections.
- [ ] Double opt-in.
- [ ] Consent copy linked to the privacy policy.

### Phases 11–12 — Accounts, cloud saves ⛔

Blocked by design. Do not start without an explicit greenlight; §7.2 and §7.3
are the specs to start from when that happens.

---

## 13. Open questions

Answer these when they become relevant — none block Phase 1.

1. **Domain name?** Everything is written against `$SITE_ORIGIN` so this can be
   deferred to Phase 9 without rework.
2. **Newsletter provider?** Buttondown, ConvertKit, and Resend are all fine.
   Decides Phase 10's function body and one `connect-src` entry.
3. **Discord / community link?** If one exists it belongs in the footer and
   §5.7. It is also the strongest argument for Discord OAuth in B2.
4. **Is a trailer coming?** If so, §5.1's hero should be reconsidered — a real
   trailer may beat the procedural canvas. The canvas is the right answer while
   no trailer exists.
5. **Steam or itch.io later?** Changes the CTA hierarchy in §5.2 and §5.7.
6. **Who owns the copy voice?** §11 recommends Opus 5, but a human voice
   decision up front is cheaper than a rewrite.

---

## 14. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Moving the game to `/play` breaks the wasm headers | **High** | §2.3 is the entire mitigation. Phase 1 is a preview-only spike with a header verdict gate. |
| Landing deploy wipes the game (or vice versa) | **High** | Both lanes publish the full composed directory (§2.4). Never `--dir` a partial tree. |
| Animation work turns the site slow | Medium | §6.5 budgets; Lighthouse gate in Phase 4 runs *before* Phase 5, so there is a known-good baseline to regress against. |
| CSP enforced too early blanks the Unity page | Medium | Report-only first, always (§8.1). |
| Content parser silently drops devlog entries | Medium | Strict parser, fails the build (§4.2). |
| Two toolchains in one repo drift | Low | `web/` is isolated; the root `ci.yml` is untouched. |
| Scope creep into B2/B3 | Medium | They are explicitly blocked in §12. |
