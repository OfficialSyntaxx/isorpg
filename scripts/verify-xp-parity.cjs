#!/usr/bin/env node
/**
 * QC: proves the website's XP curve is the game's XP curve.
 *
 * WHY THIS EXISTS
 * docs/WEBSITE_BLUEPRINT.md §5.5 puts the OSRS-style progression curve on the
 * landing page and says the chart is drawn from src/data/XPTable.ts "so the
 * chart is *true*". web/src/lib/xp.ts duplicates the formula rather than
 * importing across the two toolchains, and a duplicated formula drifts.
 *
 * A marketing page showing a curve that is not the game's curve is worse than
 * showing no curve, so the duplication is allowed only because this compares
 * the two tables element for element on every push.
 *
 * Both files are TypeScript. Rather than regex the numbers out — which breaks
 * the moment either file is reformatted — this transpiles each with the real
 * TypeScript compiler (already a root devDependency) and evaluates the result.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
const GAME = path.join(ROOT, "src/data/XPTable.ts");
const WEB = path.join(ROOT, "web/src/lib/xp.ts");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  [" + detail + "]" : ""}`); }
};

let ts;
try {
  ts = require("typescript");
} catch {
  console.log("SKIP  xp-parity: typescript not installed (run npm ci).");
  process.exit(0);
}

/**
 * Transpiles a TypeScript module to CommonJS and evaluates it in a throwaway
 * module scope, returning its exports.
 *
 * These are two first-party files in this repository, not untrusted input.
 */
function loadTs(file) {
  const source = fs.readFileSync(file, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: file,
  }).outputText;

  const m = new Module(file, null);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(js, file);
  return m.exports;
}

let game, web;
try {
  game = loadTs(GAME);
  web = loadTs(WEB);
} catch (e) {
  console.log(`FAIL  xp-parity: could not load both modules  [${e.message}]`);
  process.exit(1);
}

const gameTable = game.XP_TABLE;
const webTable = web.XP_TABLE;

ok("game exports XP_TABLE", Array.isArray(gameTable), typeof gameTable);
ok("web exports XP_TABLE", Array.isArray(webTable), typeof webTable);

if (!Array.isArray(gameTable) || !Array.isArray(webTable)) {
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(1);
}

ok(
  "tables are the same length",
  gameTable.length === webTable.length,
  `game ${gameTable.length}, web ${webTable.length}`
);

const mismatches = [];
for (let i = 0; i < Math.max(gameTable.length, webTable.length); i++) {
  if (gameTable[i] !== webTable[i]) {
    mismatches.push(`level ${i}: game ${gameTable[i]} vs web ${webTable[i]}`);
  }
}
ok(
  "every level's cumulative XP matches",
  mismatches.length === 0,
  mismatches.slice(0, 5).join(" | ") + (mismatches.length > 5 ? ` (+${mismatches.length - 5} more)` : "")
);

// Spot-check the shape too. A table that matched but was, say, all zeros would
// pass the comparison above while making the chart meaningless.
ok("level 1 costs 0 xp", webTable[1] === 0, String(webTable[1]));
ok("the curve is strictly increasing from level 2", (function () {
  for (let i = 2; i < webTable.length; i++) {
    if (!(webTable[i] > webTable[i - 1])) return false;
  }
  return true;
})());
ok(
  "level 99 is the familiar 13,034,431",
  webTable[99] === 13034431,
  String(webTable[99])
);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
