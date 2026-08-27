#!/usr/bin/env node
/**
 * Builds the design-system specimen page: every token and every component on
 * one page, in both themes.
 *
 * WHY THIS EXISTS
 * A design system that has never been looked at is a guess. The contrast audit
 * proves the numbers; this proves the result is something anyone would want to
 * read. It is also the fastest way to catch the things numbers miss — a card
 * that disappears into the page, a border that vanishes in dark, a display face
 * that looks wrong next to the body face.
 *
 * Swatches print their real measured contrast against the current surface, from
 * the same tokens.json the audit reads, so the page cannot flatter itself.
 *
 * Output is gitignored and regenerated on demand: npm run site:specimen
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "web/src/styles/tokens.json");
const STYLES = path.join(ROOT, "web/src/styles");
const OUT_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, "web/specimen");

const spec = JSON.parse(fs.readFileSync(SRC, "utf8"));

// --- contrast (same maths as verify-tokens.cjs) ------------------------------
const hex = (v) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lum = ([r, g, b]) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  const [h, l] = x > y ? [x, y] : [y, x];
  return Math.round(((h + 0.05) / (l + 0.05)) * 100) / 100;
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const entries = (o) => Object.entries(o).filter(([k]) => !k.startsWith("$"));

// --- swatches ----------------------------------------------------------------
function swatchGrid(theme) {
  const t = spec.themes[theme];
  const page = hex(t["surface-page"]);
  return entries(t)
    .filter(([, v]) => hex(v))
    .map(([k, v]) => {
      // Roles that pair with a surface OTHER than the page. Judging them
      // against surface-page would flag them red for doing their job —
      // accent-contrast is the label ON the accent, not next to it.
      const PAIRED = {
        "text-inverse": "surface-inverse",
        "accent-contrast": "accent",
      };

      if (PAIRED[k]) {
        const against = PAIRED[k];
        const r2 = ratio(hex(v), hex(t[against]));
        return `<div class="swatch">
        <div class="swatch__chip" style="background: ${esc(t[against])}; color: ${esc(v)}; display:grid; place-items:center; font-weight:700">Aa</div>
        <div class="swatch__meta">
          <code>--${esc(k)}</code>
          <span class="swatch__hex">${esc(v)}</span>
          <span class="swatch__ratio ${r2 >= 4.5 ? "is-ok" : "is-no"}">${r2}:1 on --${esc(against)}</span>
        </div>
      </div>`;
      }

      const r = ratio(hex(v), page);
      // Only text-ish roles get a pass/fail judgement — a surface or a map mark
      // is not trying to be readable against the page.
      const isTextRole = /^(text|accent|success|warn|danger|district)/.test(k);
      const badge = isTextRole
        ? `<span class="swatch__ratio ${r >= 4.5 ? "is-ok" : "is-no"}">${r}:1</span>`
        : `<span class="swatch__ratio is-na">${r}:1</span>`;
      return `<div class="swatch">
        <div class="swatch__chip" style="background: ${esc(v)}"></div>
        <div class="swatch__meta">
          <code>--${esc(k)}</code>
          <span class="swatch__hex">${esc(v)}</span>
          ${badge}
        </div>
      </div>`;
    })
    .join("\n");
}

const typeRows = entries(spec.scales.type)
  .map(([k]) => `<tr>
      <td><code>--text-${esc(k)}</code></td>
      <td style="font-size: var(--text-${esc(k)}); font-family: var(--font-display); line-height: 1.15;">Hearthvale</td>
    </tr>`)
  .join("\n");

const motionRows = entries(spec.scales.motion)
  .map(([k, v]) => `<tr><td><code>--${esc(k)}</code></td><td class="num">${esc(v)}</td></tr>`)
  .join("\n");

const fontRows = ["display", "body", "mono"]
  .map((r) => `<tr>
      <td><code>--font-${r}</code></td>
      <td><strong>${esc(spec.fonts[r].family)}</strong></td>
      <td>${esc(spec.fonts[r].why)}</td>
    </tr>`)
  .join("\n");

const tokensCss = fs.readFileSync(path.join(STYLES, "tokens.css"), "utf8");
const baseCss = fs.readFileSync(path.join(STYLES, "base.css"), "utf8");
const componentsCss = fs.readFileSync(path.join(STYLES, "components.css"), "utf8");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Isoperia — design system specimen</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Inter:wght@400..700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
${tokensCss}
${baseCss}
${componentsCss}

/* specimen-only chrome */
.spec-head { position: sticky; top: 0; z-index: 10; background: var(--glass-bg); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-subtle); padding-block: var(--space-sm); }
.spec-head .wrap { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); }
section { padding-block: var(--space-2xl); border-bottom: 1px solid var(--border-subtle); }
section > .wrap > h2 { margin-bottom: var(--space-lg); }
.eyebrow { font-family: var(--font-mono); font-size: var(--text-2xs); letter-spacing: var(--tracking-caps);
  text-transform: uppercase; color: var(--text-muted); margin-bottom: var(--space-2xs); }
.grid { display: grid; gap: var(--space-md); }
.grid--swatch { grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
.grid--cards { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.row { display: flex; flex-wrap: wrap; gap: var(--space-sm); align-items: center; }
.swatch { display: flex; gap: var(--space-sm); align-items: center; }
.swatch__chip { width: 44px; height: 44px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); flex: none; }
.swatch__meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.swatch__meta code { background: none; border: 0; padding: 0; font-size: var(--text-2xs); color: var(--text-body); }
.swatch__hex { font-family: var(--font-mono); font-size: var(--text-2xs); color: var(--text-muted); }
.swatch__ratio { font-family: var(--font-mono); font-size: var(--text-2xs); }
.swatch__ratio.is-ok { color: var(--success); }
.swatch__ratio.is-no { color: var(--danger); }
.swatch__ratio.is-na { color: var(--text-muted); }
.stack { display: flex; flex-direction: column; gap: var(--space-md); }
</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>

<header class="spec-head">
  <div class="wrap">
    <strong style="font-family: var(--font-display)">Isoperia — design system</strong>
    <button class="btn btn--secondary" id="theme" aria-live="polite">Toggle theme</button>
  </div>
</header>

<main id="main">

<section>
  <div class="wrap">
    <p class="eyebrow">Concept</p>
    <h2>${esc(spec.meta.concept)}</h2>
    <p style="color: var(--text-muted)">Light is ${esc(spec.meta.lightIs)}. Dark is ${esc(spec.meta.darkIs)}.</p>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">Colour</p>
    <h2>Tokens</h2>
    <p style="color: var(--text-muted); margin-bottom: var(--space-lg)">
      Both palettes are shown at once with their literal values, so the specimen stays
      accurate whichever theme you are viewing. Ratios are measured against that palette's
      own <code>--surface-page</code>. Text roles are judged against 4.5:1; surfaces and
      map marks are not trying to be readable.
    </p>
    <h3 style="margin-bottom: var(--space-md)">Light — parchment</h3>
    <div class="grid grid--swatch">
${swatchGrid("light")}
    </div>
    <h3 style="margin: var(--space-xl) 0 var(--space-md)">Dark — the game's HUD</h3>
    <div class="grid grid--swatch">
${swatchGrid("dark")}
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">Type</p>
    <h2>Scale and faces</h2>
    <div class="scroll-x"><table class="table">
      <thead><tr><th>Token</th><th>Specimen</th></tr></thead>
      <tbody>${typeRows}</tbody>
    </table></div>
    <div class="scroll-x" style="margin-top: var(--space-lg)"><table class="table">
      <thead><tr><th>Role</th><th>Family</th><th>Why this one</th></tr></thead>
      <tbody>${fontRows}</tbody>
    </table></div>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">Components</p>
    <h2>Buttons</h2>
    <div class="row">
      <a class="btn btn--lg" href="#">Play in your browser</a>
      <button class="btn">Primary</button>
      <button class="btn btn--secondary">Secondary</button>
      <button class="btn btn--ghost">Ghost</button>
      <button class="btn" disabled>Disabled</button>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>Cards, panel, tags</h2>
    <div class="grid grid--cards">
      <a class="card" href="#">
        <span class="card__meta">2026-08-26</span>
        <span class="card__title">WebGL returning-visitor cache repair</span>
        <p>An older service worker was serving a prior payload under the unchanged Build/* name.</p>
      </a>
      <div class="card">
        <span class="card__title">Static card</span>
        <p>No hover lift, because nothing here is clickable.</p>
        <div class="row"><span class="tag">Devlog</span><span class="tag">Unity</span></div>
      </div>
      <div class="panel">
        <strong style="font-family: var(--font-display); font-size: var(--text-lg)">Glass panel</strong>
        <p style="margin-top: var(--space-xs)">The game HUD's language: translucent, blurred, 16px radius.</p>
      </div>
    </div>
    <div class="row" style="margin-top: var(--space-lg)">
      <span class="chip-district chip-district--wildwood">Wildwood</span>
      <span class="chip-district chip-district--frostwatch">Frostwatch</span>
      <span class="chip-district chip-district--miregate">Miregate</span>
      <span class="chip-district chip-district--cinder">Cinder Hollow</span>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>Nav, table, code, callouts</h2>
    <nav class="nav" style="margin-bottom: var(--space-lg)">
      <a class="nav__link" aria-current="page" href="#">Home</a>
      <a class="nav__link" href="#">Features</a>
      <a class="nav__link" href="#">World</a>
      <a class="nav__link" href="#">Devlog</a>
      <a class="nav__link" href="#">Wiki</a>
    </nav>

    <div class="scroll-x"><table class="table">
      <thead><tr><th>Item</th><th>Skill</th><th class="num">Level</th><th class="num">XP</th></tr></thead>
      <tbody>
        <tr><td>Willow log</td><td>Woodcutting</td><td class="num">30</td><td class="num">67.5</td></tr>
        <tr><td>Iron ore</td><td>Mining</td><td class="num">15</td><td class="num">35.0</td></tr>
        <tr><td>Steel bar</td><td>Smithing</td><td class="num">30</td><td class="num">17.5</td></tr>
      </tbody>
    </table></div>

    <pre style="margin-top: var(--space-lg)"><code>build_id: 20260826-152233-4612e3c5
VERDICT: OK</code></pre>

    <div class="stack" style="margin-top: var(--space-lg)">
      <div class="callout">
        <span class="callout__icon" aria-hidden="true">🧭</span>
        <span class="callout__title">Note</span>
        <div class="callout__body"><p>Saves are local and offline-capable.</p></div>
      </div>
      <div class="callout callout--warn">
        <span class="callout__icon" aria-hidden="true">⚠️</span>
        <span class="callout__title">First load is large</span>
        <div class="callout__body"><p>Roughly 50 MB. Worth saying before someone taps on mobile data.</p></div>
      </div>
      <div class="callout callout--danger">
        <span class="callout__icon" aria-hidden="true">⛔</span>
        <span class="callout__title">Header regression</span>
        <div class="callout__body"><p>A wasm served as text/plain is a dead site that reports as a successful deploy.</p></div>
      </div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <p class="eyebrow">Motion</p>
    <h2>Duration and easing</h2>
    <div class="scroll-x"><table class="table">
      <thead><tr><th>Token</th><th class="num">Value</th></tr></thead>
      <tbody>${motionRows}</tbody>
    </table></div>
  </div>
</section>

<footer class="footer">
  <div class="wrap">
    Generated by scripts/gen-specimen.cjs from web/src/styles/tokens.json ·
    contrast verified by npm run verify:tokens
  </div>
</footer>

</main>

<script>
  // Explicit choice wins over the OS in both directions, which is what the
  // [data-theme] blocks in tokens.css exist for.
  var btn = document.getElementById("theme");
  btn.addEventListener("click", function () {
    var root = document.documentElement;
    var now = root.getAttribute("data-theme");
    var isDark = now
      ? now === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", isDark ? "light" : "dark");
  });
</script>
</body>
</html>
`;

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "index.html"), html);
console.log(`gen-specimen: wrote ${path.relative(ROOT, path.join(OUT_DIR, "index.html"))}`);
