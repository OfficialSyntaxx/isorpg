#!/usr/bin/env node
/**
 * QC: audits every declared colour pair in web/src/styles/tokens.json for WCAG
 * 2.2 contrast, in BOTH themes.
 *
 * WHY THIS EXISTS
 * docs/WEBSITE_BLUEPRINT.md §9.2 calls accessibility a gate rather than a pass,
 * and §3.3 says "contrast is a gate, not a preference". Neither sentence is
 * worth anything unless something checks it. Palettes drift: someone lightens a
 * muted grey to make a card look calmer and silently pushes caption text under
 * 4.5:1, and nobody notices until an audit months later.
 *
 * So the palette declares its own requirements and this asserts them.
 *
 * It also asserts the FORBIDDEN pairs still fail. That reads backwards at first,
 * but a ban that has quietly become unnecessary is a ban nobody can justify —
 * if gold ever does pass on parchment, that should be a deliberate decision,
 * not a silent one.
 *
 * Contrast maths: WCAG 2.x relative luminance and the (L1+0.05)/(L2+0.05)
 * ratio. Alpha colours are not auto-composited — a pair involving one is
 * rejected rather than guessed at, because the answer depends on what is behind
 * it and a wrong guess here is worse than no answer.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TOKENS = path.join(ROOT, "web/src/styles/tokens.json");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  [" + detail + "]" : ""}`); }
};

// --- colour maths ------------------------------------------------------------
function parseHex(v) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const round = (n) => Math.round(n * 100) / 100;

// --- load --------------------------------------------------------------------
const spec = JSON.parse(fs.readFileSync(TOKENS, "utf8"));
const themes = spec.themes;
const themeNames = Object.keys(themes).filter((t) => !t.startsWith("$"));

// --- structural checks -------------------------------------------------------
// A token present in one theme and missing from the other produces a page that
// is fine in light and broken in dark (or the reverse), which is exactly the
// bug nobody tests for.
const keysOf = (t) => Object.keys(themes[t]).filter((k) => !k.startsWith("$")).sort();
const [firstTheme, ...restThemes] = themeNames;
for (const t of restThemes) {
  const a = keysOf(firstTheme);
  const b = keysOf(t);
  const missing = a.filter((k) => !b.includes(k));
  const extra = b.filter((k) => !a.includes(k));
  ok(
    `themes "${firstTheme}" and "${t}" declare the same tokens`,
    missing.length === 0 && extra.length === 0,
    [missing.length ? `missing in ${t}: ${missing.join(", ")}` : "",
     extra.length ? `only in ${t}: ${extra.join(", ")}` : ""].filter(Boolean).join(" | ")
  );
}

// Tokens whose value is a composite CSS expression rather than a colour.
// box-shadow carries offsets and a blur as well as a colour, so it is not
// parseable as one and has no contrast to audit.
const COMPOSITE = /^shadow-/;

// Every colour token must actually parse. A typo'd hex silently becomes an
// invalid CSS value that the browser drops, falling back to inherited colour —
// which usually still looks plausible, so it survives review.
for (const t of themeNames) {
  const bad = [];
  for (const [k, v] of Object.entries(themes[t])) {
    if (k.startsWith("$") || COMPOSITE.test(k)) continue;
    if (typeof v !== "string") { bad.push(k); continue; }
    if (/^rgba?\(|^hsla?\(/.test(v.trim())) continue;
    if (!parseHex(v)) bad.push(`${k}="${v}"`);
  }
  ok(`theme "${t}": every colour is a valid hex or rgba()`, bad.length === 0, bad.join(", "));
}

// --- contrast: required ------------------------------------------------------
function resolve(theme, name) {
  const v = themes[theme][name];
  if (v === undefined) return { err: `token "${name}" is not defined in theme "${theme}"` };
  const rgb = parseHex(v);
  if (!rgb) {
    return {
      err: `token "${name}" in "${theme}" is "${v}" — contrast against a ` +
           `translucent colour depends on what is behind it, so it is not ` +
           `auto-composited. Compare against the opaque surface instead.`,
    };
  }
  return { rgb, hex: v };
}

for (const rule of spec.contrast.required) {
  const applicable = rule.theme ? [rule.theme] : themeNames;
  for (const theme of applicable) {
    const fg = resolve(theme, rule.fg);
    const bg = resolve(theme, rule.bg);
    if (fg.err || bg.err) {
      ok(`${theme}: ${rule.fg} on ${rule.bg}`, false, fg.err || bg.err);
      continue;
    }
    const ratio = contrast(fg.rgb, bg.rgb);
    ok(
      `${theme}: ${rule.fg} on ${rule.bg} >= ${rule.min}:1`,
      ratio >= rule.min,
      `got ${round(ratio)}:1 (${fg.hex} on ${bg.hex}) — ${rule.why}`
    );
  }
}

// --- contrast: forbidden -----------------------------------------------------
for (const rule of spec.contrast.forbidden || []) {
  const applicable = rule.theme ? [rule.theme] : themeNames;
  for (const theme of applicable) {
    const fg = resolve(theme, rule.fg);
    const bg = resolve(theme, rule.bg);
    if (fg.err || bg.err) {
      ok(`${theme}: ${rule.fg} on ${rule.bg} (banned)`, false, fg.err || bg.err);
      continue;
    }
    const ratio = contrast(fg.rgb, bg.rgb);
    ok(
      `${theme}: ${rule.fg} on ${rule.bg} stays below ${rule.max}:1 (banned as text)`,
      ratio < rule.max,
      `got ${round(ratio)}:1 — this pair now PASSES contrast, so the ban is ` +
      `stale. Review it deliberately rather than deleting this rule. ${rule.why}`
    );
  }
}

// --- report ------------------------------------------------------------------
// The full matrix is printed on failure so the fix is obvious without
// re-deriving every ratio by hand.
if (fail > 0) {
  console.log("\n--- contrast matrix (text tokens against surfaces) ---");
  const textTokens = ["text-strong", "text-body", "text-muted", "accent", "accent-hover",
                      "success", "warn", "danger"];
  const surfaces = ["surface-page", "surface-raised", "surface-sunken"];
  for (const theme of themeNames) {
    console.log(`\n${theme}`);
    const head = ["".padEnd(16), ...surfaces.map((s) => s.replace("surface-", "").padStart(9))];
    console.log(head.join(""));
    for (const tk of textTokens) {
      const cells = surfaces.map((s) => {
        const f = resolve(theme, tk), b = resolve(theme, s);
        if (f.err || b.err) return "—".padStart(9);
        return `${round(contrast(f.rgb, b.rgb))}`.padStart(9);
      });
      console.log([tk.padEnd(16), ...cells].join(""));
    }
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
