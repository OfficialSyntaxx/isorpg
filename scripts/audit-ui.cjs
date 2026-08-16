#!/usr/bin/env node
// QC: static UI/panel audit (no browser). Cross-checks index.html ids against
// selectors in src/ui/UI.ts and src/main.ts, validates the panel registry
// (data-panel → openPanel union → render methods), and confirms every
// UI.attach* is wired from main.ts. Prints PASS/FAIL; exit 1 on any FAIL.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "src/ui/UI.ts"), "utf8");
const main = fs.readFileSync(path.join(root, "src/main.ts"), "utf8");

const rows = [];
const add = (name, ok, x = "") => rows.push(`${ok ? "PASS" : "FAIL"}  ${name}${x ? "  [" + x + "]" : ""}`);
const uniq = (a) => [...new Set(a)];
const grab = (re, src) => uniq([...src.matchAll(re)].map((m) => m[1]));

const htmlIds = grab(/id="([^"]+)"/g, html);
const refIds = uniq(
  grab(/\$\s*\(\s*"#([A-Za-z0-9_-]+)"/g, ui + "\n" + main)
    .concat(grab(/getElementById\("([^"]+)"\)/g, ui + "\n" + main))
    .concat(grab(/querySelectorAll<[^>]*>\("#([A-Za-z0-9_-]+)"/g, ui))
);

// 1) Every referenced id exists in the DOM.
let ok = true;
for (const id of refIds) { const hit = htmlIds.includes(id); if (!hit) ok = false; }
add("all referenced ids exist in index.html", ok, ok ? "" : refIds.filter((i) => !htmlIds.includes(i)).join(","));

// 2) Declared-but-unreferenced ids (dead-DOM detection).
const NON_QC = new Set(["app", "ui-root", "topbar", "player-chip", "player-hp", "day-chip", "toast-root", "bottom-bar", "modal-root", "target-chip", "night-overlay", "float-layer", "action-xp-label", "place-banner-text", "place-banner"]);
const unused = htmlIds.filter((id) => !refIds.includes(id) && !NON_QC.has(id));
add("index.html has no unreferenced ids (layout whitelist excluded)", unused.length === 0, unused.join(","));

// 3) HUD buttons → openPanel union, and every union member has a renderer.
const panels = grab(/data-panel="([^"]+)"/g, html);
const unionLine = ui.match(/openPanel\(id: "(.+)/)?.[1]?.split("\n")[0] ?? "";
const union = unionLine.replace(/" \| "/g, "|").replace(/"/g, "").split("|").map((s) => s.trim().replace(/[){].*$/, "")).filter((s) => /^[a-z_]+$/.test(s));
for (const p of panels) add(`panel button '${p}' ∈ openPanel union`, union.includes(p));
const RENDER_ALIAS = { quest: "Journal" };
for (const p of union) {
  const cap = RENDER_ALIAS[p] ?? p[0].toUpperCase() + p.slice(1);
  add(`openPanel '${p}' has render${cap}`, ui.includes(`render${cap}(`));
}

// 4) Every openPanel switch branch names an existing render.
const branchPanels = grab(/id === "([a-z_]+)"\) this\.render/g, ui);
for (const p of branchPanels) {
  const cap = RENDER_ALIAS[p] ?? p[0].toUpperCase() + p.slice(1);
  add(`switch branch '${p}' → render${cap} exists`, ui.includes(`render${cap}(`));
}

// 5) attach* methods are all wired from main.ts.
const attachMethods = grab(/(attach[A-Za-z]+)\(/g, ui);
for (const m of attachMethods) add(`ui.${m} wired in main`, main.includes(m));

// 6) Interactive attribute families have bindings in the UI.
const actionAttrs = ["data-act", "data-recipe", "data-build", "data-upgrade", "data-travel", "data-buy", "data-sell", "data-lassign", "data-lclaim"];
for (const at of actionAttrs) add(`UI binds [${at}]`, ui.includes(at));
add("every HUD bullet has a bar-btn", (html.match(/bar-btn/g) || []).length >= 8);

// 7) Boot ordering: no field may be USED before it is ASSIGNED inside boot().
//
// This exists because P6.3 shipped `this.ui.attachQuestJournal(...)` ~60 lines
// before `this.ui = new UI(...)`. Every launch threw, aborting boot() before
// engine.start(), so the game never rendered — for five phases. Check 5 above
// still passed the whole time, because presence is not ordering.
//
// Only statement-level usage counts (a line that *begins* with `this.x.`).
// Usage nested inside a callback — `(m) => { this.ui.pop(m); }` — is deferred
// until after boot finishes and is legitimately allowed to precede assignment.
{
  // Bound the scan to boot()'s own body by brace-matching, so later methods
  // (frame handlers reassigning this.fx / this.shots) aren't misread as boot code.
  const bootStart = main.indexOf("async boot()");
  let bootBody = "";
  if (bootStart >= 0) {
    const open = main.indexOf("{", bootStart);
    let depth = 0;
    for (let i = open; i < main.length; i++) {
      if (main[i] === "{") depth++;
      else if (main[i] === "}") { depth--; if (depth === 0) { bootBody = main.slice(open, i); break; } }
    }
  }
  // Fields initialized at declaration (`private fx: X[] = [];`) are never
  // undefined, so using them before a later reassignment is fine.
  const preInitialised = new Set(
    grab(/^\s*(?:private|public|readonly)?\s*([A-Za-z_$][\w$]*)\s*:[^=;\n]+=\s*[^;\n]+;/gm, main.slice(0, bootStart))
  );
  const lines = bootBody.split("\n");

  const firstAssign = new Map();
  const firstUse = new Map();
  lines.forEach((line, i) => {
    const assign = line.match(/^\s*this\.([A-Za-z_$][\w$]*)\s*=[^=]/);
    if (assign && !firstAssign.has(assign[1])) firstAssign.set(assign[1], i);
    const use = line.match(/^\s*this\.([A-Za-z_$][\w$]*)\s*\./);
    if (use && !firstUse.has(use[1])) firstUse.set(use[1], i);
  });

  const offenders = [];
  for (const [field, useLine] of firstUse) {
    if (!firstAssign.has(field)) continue; // assigned elsewhere (ctor/declaration)
    if (preInitialised.has(field)) continue; // has a value from its declaration
    if (useLine < firstAssign.get(field)) {
      offenders.push(`this.${field} used at boot+${useLine}, assigned at boot+${firstAssign.get(field)}`);
    }
  }
  add("boot(): no field used before it is assigned", offenders.length === 0, offenders.join("; "));
}

rows.forEach((r) => console.log(r));
const fails = rows.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${rows.length - fails}/${rows.length} checks passed (${rows.length} total)`);
if (fails) process.exit(1);