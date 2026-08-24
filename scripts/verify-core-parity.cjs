#!/usr/bin/env node
/**
 * QC: proves the C# port of the simulation core is behaviourally identical to
 * the TypeScript original it replaces.
 *
 * This is the acceptance test for Phase 2a of the Unity migration. It exists
 * because "I ported it carefully" is not evidence: the world is a pure function
 * of a 32-bit PRNG, so a single wrong shift produces a different map, and the
 * failure mode is a game that looks fine and is subtly, permanently wrong.
 *
 * How it works: `Isoperia.Core` is built with `noEngineReferences`, so it has no
 * UnityEngine dependency and compiles with any C# compiler. We build it with
 * mcs, run it, dump the generated world plus a set of pathfinding results, and
 * diff that against the same dump from the TypeScript build. No Unity, no
 * licence, about two seconds.
 *
 * What is compared:
 *   - terrain, biome and zone of all 1,764 tiles
 *   - the per-tile decoration seed (the value most sensitive to PRNG draw order)
 *   - elevation to 12 decimal places
 *   - walkability
 *   - pathfinding over the generated grid with blocking occupants scattered
 *     across it: endpoints, step count and total cost
 *
 * Paths are compared by COST rather than by tile sequence. A* may choose any
 * among equal-cost routes, and the two implementations use different open-list
 * structures for good reason -- see the remarks in AStar.cs.
 *
 * Skips (does not fail) when no C# compiler is installed.
 */
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, ".parity");
const CORE = path.join(ROOT, "unity/Assets/Isoperia/Core/Runtime");

const SOURCES = [
  `${CORE}/Sim/Mulberry32.cs`,
  `${CORE}/World/WorldTypes.cs`,
  `${CORE}/World/Grid.cs`,
  `${CORE}/AI/IGridLike.cs`,
  `${CORE}/AI/AStar.cs`,
  path.join(ROOT, "tools/parity/DumpWorld.cs"),
];

const XP_SOURCES = [
  `${CORE}/Data/XpTable.cs`,
  path.join(ROOT, "tools/parity/DumpXpTable.cs"),
];

const COMBAT_SOURCES = [
  `${CORE}/Sim/Mulberry32.cs`,
  `${CORE}/Sim/IRandom.cs`,
  `${CORE}/Data/XpTable.cs`,
  `${CORE}/Data/CombatData.cs`,
  `${CORE}/Combat/CombatMath.cs`,
  path.join(ROOT, "tools/parity/DumpCombat.cs"),
];

/**
 * Builds one C# dumper and diffs its output against a Node one, line by line.
 * Reports the first differing line rather than dumping both documents.
 */
function compareDump(label, sources, exeName, tsScript) {
  const exe = path.join(OUT, exeName);
  const build = spawnSync("mcs", ["-out:" + exe, "-optimize+", "-langversion:latest", ...sources],
    { cwd: ROOT, encoding: "utf8" });

  if (build.status !== 0) {
    ok(`${label}: C# compiled`, false, (build.stdout || "") + (build.stderr || ""));
    return;
  }

  const cs = spawnSync("mono", [exe], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const ts = spawnSync("node", [path.join(ROOT, tsScript)], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

  if (cs.status !== 0 || ts.status !== 0) {
    ok(`${label}: both dumps ran`, false, (cs.stderr || "") + (ts.stderr || ""));
    return;
  }

  const a = ts.stdout.split("\n"), b = cs.stdout.split("\n");
  const bad = a.findIndex((l, i) => l !== b[i]);

  ok(
    `${label.padEnd(9)} ${String(a.length - 1).padStart(5)} lines match`,
    a.length === b.length && bad === -1,
    bad >= 0 ? `line ${bad + 1}: ts=${JSON.stringify(a[bad])} cs=${JSON.stringify(b[bad])}`
             : `length ${a.length} vs ${b.length}`
  );
}

function have(cmd) {
  return spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" }).status === 0;
}

if (!have("mcs") || !have("mono")) {
  console.log("SKIP  parity: no C# toolchain (mcs/mono) installed (optional).");
  console.log("      Install with: apt-get install -y mono-mcs mono-runtime");
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });

// --- 1. TypeScript side -----------------------------------------------------
// Reuse the emitted JS from the existing test pipeline when it is present,
// otherwise emit it. Keeps a full `npm test` run from compiling twice.
const EMIT = path.join(ROOT, ".qc-emit");
if (!fs.existsSync(path.join(EMIT, "src/world/Grid.js"))) {
  console.log("parity: emitting TypeScript...");
  execSync("npx tsc -p tests/tsconfig.json", { cwd: ROOT, stdio: "inherit" });
  fs.writeFileSync(path.join(EMIT, "package.json"), '{"type":"commonjs"}');
}

const tsRun = spawnSync("node", [path.join(ROOT, "tools/parity/dump-world-ts.cjs")], {
  cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
});
if (tsRun.status !== 0) {
  console.log("FAIL  parity: TypeScript dump failed");
  console.log((tsRun.stderr || "").split("\n").slice(0, 8).join("\n"));
  process.exit(1);
}
const tsDump = tsRun.stdout;
fs.writeFileSync(path.join(OUT, "ts.txt"), tsDump);

// --- 2. C# side -------------------------------------------------------------
const exe = path.join(OUT, "dumpworld.exe");
// -langversion:latest because Unity targets C# 9 while mcs defaults to 7.0.
const build = spawnSync("mcs", ["-out:" + exe, "-optimize+", "-langversion:latest", ...SOURCES],
  { cwd: ROOT, encoding: "utf8" });
if (build.status !== 0) {
  console.log("FAIL  parity: C# core did not compile");
  console.log(build.stdout || "");
  console.log(build.stderr || "");
  process.exit(1);
}

const run = spawnSync("mono", [exe], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (run.status !== 0) {
  console.log("FAIL  parity: C# dump crashed");
  console.log(run.stderr || "");
  process.exit(1);
}
fs.writeFileSync(path.join(OUT, "cs.txt"), run.stdout);

// --- 3. Compare -------------------------------------------------------------
const tsLines = tsDump.split("\n");
const csLines = run.stdout.split("\n");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  [" + detail + "]" : ""}`); }
};

// Section-by-section, so a failure names what actually drifted.
function section(label) {
  const start = tsLines.indexOf(label);
  const csStart = csLines.indexOf(label);
  if (start < 0 || csStart < 0) return null;
  const ends = ["TERRAIN", "BIOME", "ZONE", "SEED", "ELEVATION", "WALKABLE", "PATHS"];
  const nextOf = (arr, from) => {
    for (let i = from + 1; i < arr.length; i++) if (ends.includes(arr[i])) return i;
    return arr.length;
  };
  return {
    ts: tsLines.slice(start + 1, nextOf(tsLines, start)),
    cs: csLines.slice(csStart + 1, nextOf(csLines, csStart)),
  };
}

// WORLD-GENERATION PARITY IS RETIRED, NOT BROKEN.
//
// This compared the C# world against the TypeScript one tile for tile, and it
// was the strongest check in the project: 1,764 tiles byte-identical, proving
// the port had not drifted.
//
// It stopped being meaningful at "feat: migrate to 126x126 mainland world". The
// Unity game now generates a 126x126 mainland; the TypeScript is the FROZEN web
// build and still generates 42x42. They are supposed to differ, in every tile,
// forever. Left enabled it produced six confident failures per run against a
// perfectly healthy port — and it did, on every push for days, which is a large
// part of why nobody was reading CI at all.
//
// Deleting it would be worse than disabling it: world generation is still a pure
// function of a 32-bit PRNG, and a single wrong shift still silently produces a
// different map. What it needs is a NEW reference — a committed C# golden dump
// of the 126x126 world, compared C#-against-C# — so determinism is still pinned
// without a TypeScript that no longer describes this game. That is Phase B.
//
// Until then this is a KNOWN GAP, printed loudly on every run rather than
// quietly skipped. PATHS is kept: A* is world-shape agnostic and still compares.
const WORLD_GEN_PARITY_RETIRED = true;

const worldSections = WORLD_GEN_PARITY_RETIRED
  ? ["PATHS"]
  : ["TERRAIN", "BIOME", "ZONE", "SEED", "ELEVATION", "WALKABLE", "PATHS"];

for (const label of worldSections) {
  const s = section(label);
  if (!s) { ok(`${label}: section present in both dumps`, false); continue; }
  const firstBad = s.ts.findIndex((l, i) => l !== s.cs[i]);
  ok(
    `${label.padEnd(9)} ${String(s.ts.length).padStart(5)} lines match`,
    s.ts.length === s.cs.length && firstBad === -1,
    firstBad >= 0 ? `line ${firstBad + 1}: ts=${JSON.stringify(s.ts[firstBad])} cs=${JSON.stringify(s.cs[firstBad])}`
                  : `length ${s.ts.length} vs ${s.cs.length}`
  );
}

if (!WORLD_GEN_PARITY_RETIRED) ok("whole dump byte-identical", tsDump === run.stdout);

// --- 4. the XP curve and the combat rules -----------------------------------
// Separate binaries: neither depends on the world, and a focused failure names
// which subsystem drifted.
compareDump("XP curve", XP_SOURCES, "dumpxp.exe", "tools/parity/dump-xp-ts.cjs");
compareDump("Combat", COMBAT_SOURCES, "dumpcombat.exe", "tools/parity/dump-combat-ts.cjs");

if (WORLD_GEN_PARITY_RETIRED) {
  console.log(
    "\nKNOWN GAP  world-generation parity is retired: the Unity world is 126x126\n" +
    "           and the frozen TypeScript is 42x42, so tile-for-tile comparison\n" +
    "           can never pass again. World-gen determinism is currently UNPINNED.\n" +
    "           Phase B replaces it with a committed C# golden dump of the 126x126\n" +
    "           world, compared C#-against-C#."
  );
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
