#!/usr/bin/env node
/**
 * Generates the INTERIM holding page that sits at the site root until the real
 * landing page exists (docs/WEBSITE_BLUEPRINT.md Phase 4).
 *
 * WHY THIS EXISTS
 * Phase 1's job is to prove the game still loads when it is served from /play
 * instead of the root. Proving that needs something at the root to compose
 * against. Hand-writing a throwaway page would mean the social links live in
 * two places from day one, so this reads web/site.config.json instead — the
 * same file Phase 3's Astro build will consume.
 *
 * This is NOT the landing page. It is deliberately one screen with no
 * dependencies. Phase 4 replaces it wholesale; Phase 2's design system and
 * Phase 5's motion work do not belong here.
 *
 * Output is gitignored: it is derived from the config and regenerated on every
 * build, so there is nothing to keep in sync.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG = path.join(ROOT, "web/site.config.json");
const OUT_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, "web/holding");

const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));

// A null url is a placeholder and must not render. Rendering it as a dead "#"
// link is the failure this guards against.
const links = (cfg.social || []).filter((s) => typeof s.url === "string" && s.url.length > 0);
const placeholders = (cfg.social || []).filter((s) => !s.url).map((s) => s.id);

const prefix = (cfg.paths && cfg.paths.gamePrefix) || "play";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(cfg.name)} — ${esc(cfg.shortDescription)}</title>
<meta name="description" content="${esc(cfg.tagline)}">
<meta name="theme-color" content="#1a1610">
<!-- Interim page: not indexed, because the real landing page (blueprint Phase 4)
     should be what search engines see first. -->
<meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230b1220'/%3E%3Cpath d='M16 5l10 6-10 6-10-6z' fill='%236aa8ff'/%3E%3Cpath d='M6 13l10 6 10-6v6l-10 6-10-6z' fill='%237cd992'/%3E%3C/svg%3E">
<style>
  /* Palette from docs/WEBSITE_BLUEPRINT.md §3.3, which takes it from
     src/style.css and docs/ART_BIBLE.md rather than inventing a second one. */
  :root {
    --ground-800: #1a1610;
    --ink-900: #0b1220;
    --ink-800: #141c2e;
    --ink-100: #eaf0ff;
    --ink-muted: #93a1bf;
    --accent: #6aa8ff;
    --good: #7cd992;
    --gold: #ffd479;
    --radius: 16px;
    --shadow: 0 8px 30px rgba(0,0,0,.45);
    --dur-base: 320ms;
    --ease-out: cubic-bezier(.16,1,.3,1);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    display: grid;
    place-items: center;
    padding: 6vmin 5vmin;
    background:
      radial-gradient(120% 90% at 50% 0%, #1d2740 0%, var(--ink-900) 55%, var(--ground-800) 100%);
    color: var(--ink-100);
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-align: center;
  }
  main { max-width: 62ch; }
  .mark {
    width: 72px; height: 72px; margin: 0 auto 28px;
    animation: rise 900ms var(--ease-out) both;
  }
  h1 {
    font-size: clamp(2.4rem, 8vw, 4rem);
    line-height: 1.05;
    letter-spacing: -.02em;
    margin: 0 0 .5rem;
    animation: rise 900ms var(--ease-out) 80ms both;
  }
  .tagline {
    color: var(--ink-muted);
    font-size: clamp(1rem, 2.6vw, 1.15rem);
    margin: 0 auto 2.2rem;
    max-width: 46ch;
    animation: rise 900ms var(--ease-out) 160ms both;
  }
  .cta {
    display: inline-flex; align-items: center; gap: .6rem;
    background: linear-gradient(180deg, var(--accent), #4f8de0);
    color: #06101f; font-weight: 800; font-size: 1.05rem;
    text-decoration: none;
    padding: .95rem 1.9rem; border-radius: var(--radius);
    box-shadow: var(--shadow);
    transition: transform var(--dur-base) var(--ease-out), filter var(--dur-base) var(--ease-out);
    animation: rise 900ms var(--ease-out) 240ms both;
  }
  .cta:hover, .cta:focus-visible { transform: translateY(-2px); filter: brightness(1.07); }
  .cta:active { transform: translateY(0) scale(.985); }
  .weight {
    display: block; margin-top: .9rem;
    color: var(--ink-muted); font-size: .82rem;
    animation: rise 900ms var(--ease-out) 300ms both;
  }
  nav {
    margin-top: 2.6rem; display: flex; flex-wrap: wrap;
    gap: .6rem; justify-content: center;
    animation: rise 900ms var(--ease-out) 380ms both;
  }
  nav a {
    color: var(--ink-100); text-decoration: none; font-size: .9rem; font-weight: 600;
    background: rgba(255,255,255,.06);
    border: 1px solid rgba(255,255,255,.09);
    padding: .5rem 1rem; border-radius: 11px;
    transition: background var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out);
  }
  nav a:hover, nav a:focus-visible { background: rgba(255,255,255,.12); border-color: var(--accent); }
  footer { margin-top: 3rem; color: var(--ink-muted); font-size: .78rem; }
  footer .dot { color: var(--gold); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

  @keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }

  /* Blueprint §6.1.5: reduced motion is a designed state, not a kill switch.
     Everything still arrives, it just arrives without travelling. */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
    }
  }
</style>
</head>
<body>
<main>
  <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 3l12 7-12 7L4 10z" fill="#6aa8ff"/>
    <path d="M4 13l12 7 12-7v6l-12 7-12-7z" fill="#7cd992"/>
  </svg>

  <h1>${esc(cfg.name)}</h1>
  <p class="tagline">${esc(cfg.tagline)}</p>

  <a class="cta" href="/${esc(prefix)}/">Play in your browser</a>
  <!-- Blueprint §9.2: a ~50 MB download is information someone on metered
       data is entitled to before they tap, not after. -->
  <small class="weight">Loads in the browser · first load downloads roughly 50&nbsp;MB</small>

  ${links.length ? `<nav aria-label="Elsewhere">
    ${links.map((s) => `<a href="${esc(s.url)}" rel="noopener noreferrer">${esc(s.label)}</a>`).join("\n    ")}
  </nav>` : ""}

  <footer>
    Interim holding page <span class="dot">·</span> the full site is in progress
  </footer>
</main>
</body>
</html>
`;

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "index.html"), html);

console.log(`gen-holding-page: wrote ${path.relative(ROOT, path.join(OUT_DIR, "index.html"))}`);
console.log(`  links rendered:     ${links.length ? links.map((s) => s.id).join(", ") : "(none)"}`);
console.log(`  placeholders unset: ${placeholders.length ? placeholders.join(", ") : "(none)"}`);
