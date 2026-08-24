#!/usr/bin/env node
/**
 * Bans digit separators (1_000) from Isoperia.Core.
 *
 * MONO'S mcs SILENTLY MIS-PARSES THEM. Measured on the toolchain this repo uses
 * to verify the port outside Unity:
 *
 *     20_000            ->        200000     (want 20000)
 *     3_600_000         ->     366000000     (want 3600000)
 *     7_200_000         ->     722000000     (want 7200000)
 *     1_787_000_000_000 -> 17787000000000000
 *
 * No error, no warning: it compiles and runs with different numbers.
 *
 * Why that is worse than it sounds. Isoperia.Core is declared noEngineReferences
 * precisely so its behaviour can be checked with mcs, with no Unity licence, in
 * about a second. Unity builds the same source with Roslyn, which parses these
 * correctly. So a separator makes the verification harness test DIFFERENT NUMBERS
 * from the ones the game runs — the exact failure mode the harness exists to
 * prevent.
 *
 * And it hides. A test that compares two mangled constants still passes: a 20 s
 * interval and a 60 s window both scale by ten, so "three logs per minute" held
 * while both numbers were wrong. It surfaced only where a literal met real data
 * from the content JSON, which is parsed at runtime and therefore correct.
 *
 * This is the second confirmed mcs miscompilation here. The first turned a tuple
 * swap into list indexers and corrupted the A* heap — see the longhand swap in
 * AStar.cs. Treat mcs as a second compiler whose disagreements are silent.
 *
 * Run: npm run verify:separators
 */
const fs = require("fs");
const path = require("path");

const ROOT = "unity/Assets/Isoperia/Core";

/** Reports digit separators in numeric literals, skipping strings and comments. */
function findSeparators(src) {
  const hits = [];
  let state = null;   // null | str | verbatim | char | line | block
  let line = 1;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const nxt = src[i + 1] || "";
    if (c === "\n") line++;

    if (state === null) {
      if (c === '"' && src[i - 1] === "@") { state = "verbatim"; continue; }
      if (c === '"') { state = "str"; continue; }
      if (c === "'") { state = "char"; continue; }
      if (c === "/" && nxt === "/") { state = "line"; i++; continue; }
      if (c === "/" && nxt === "*") { state = "block"; i++; continue; }

      const prev = src[i - 1] || "";
      if (/[0-9]/.test(c) && !/[A-Za-z0-9_]/.test(prev)) {
        let j = i, lit = "";
        while (j < src.length && /[0-9_a-fA-FxXbBeElLuU.]/.test(src[j])) {
          if (src[j] === "." && !/[0-9]/.test(src[j + 1] || "")) break;
          lit += src[j++];
        }
        if (lit.includes("_")) hits.push({ line, lit });
        i = j - 1;
      }
      continue;
    }

    if (state === "str") {
      if (c === "\\") { i++; continue; }
      if (c === '"') state = null;
    } else if (state === "verbatim") {
      if (c === '"' && nxt === '"') { i++; continue; }
      if (c === '"') state = null;
    } else if (state === "char") {
      if (c === "\\") { i++; continue; }
      if (c === "'") state = null;
    } else if (state === "line") {
      if (c === "\n") state = null;
    } else if (state === "block") {
      if (c === "*" && nxt === "/") { i++; state = null; }
    }
  }

  return hits;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".cs") ? [p] : [];
  });
}

if (!fs.existsSync(ROOT)) {
  console.log(`SKIP  ${ROOT} not present.`);
  process.exit(0);
}

let failures = 0;
let files = 0;

for (const file of walk(ROOT)) {
  files++;
  for (const hit of findSeparators(fs.readFileSync(file, "utf8"))) {
    console.error(
      `FAIL  ${file}:${hit.line}  numeric literal "${hit.lit}" uses digit separators.\n` +
      `      Mono's mcs mis-parses these SILENTLY, so the verification harness\n` +
      `      would run different numbers than Unity's Roslyn build. Write it as\n` +
      `      ${hit.lit.replace(/_/g, "")}.`
    );
    failures++;
  }
}

if (failures === 0) console.log(`PASS  no digit separators in ${files} Core file(s)`);
console.log(failures === 0 ? "\nseparators OK" : `\n${failures} found`);
process.exit(failures === 0 ? 0 : 1);
