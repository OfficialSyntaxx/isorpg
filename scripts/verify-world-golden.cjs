#!/usr/bin/env node
/**
 * QC: pins world generation against a committed golden dump.
 *
 * WHY THIS REPLACED A BETTER CHECK.
 *
 * World generation used to be verified against the TypeScript original, tile for
 * tile — 1,764 tiles byte-identical. That was the strongest check in the project
 * because it compared against an INDEPENDENT implementation: a wrong shift in
 * the PRNG could not hide, since the other side would have to make the same
 * mistake.
 *
 * The 126x126 mainland migration ended that. The Unity game generates a world
 * the frozen web build never will, so the two are supposed to differ in every
 * tile forever, and the comparison produced six confident failures per run
 * against a healthy port until it was retired.
 *
 * This is the weaker replacement, and it is worth being clear about how it is
 * weaker: a golden file compares the code against ITSELF AT A POINT IN TIME. It
 * cannot tell you the world is *correct* — only that it has not CHANGED. If the
 * generator was wrong when the golden was captured, this will faithfully defend
 * the bug.
 *
 * What it does still catch is the thing that actually threatened this project:
 * world generation is a pure function of a 32-bit PRNG, so an accidental change
 * to draw order, a reordered statement, or a different rounding silently
 * produces a different map — and every save's decoration seeds with it. That is
 * a permanent, invisible, unrecoverable divergence, and this catches it in about
 * two seconds.
 *
 * The golden is regenerated ONLY on purpose:
 *
 *     ISOPERIA_UPDATE_GOLDEN=1 npm run verify:world
 *
 * If a diff appears and you did not intend to change world generation, do not
 * update the golden. That diff is the bug.
 *
 * Skips (does not fail) when no C# toolchain is installed.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, ".world-golden");
const CORE = path.join(ROOT, "unity/Assets/Isoperia/Core/Runtime");
const GOLDEN = path.join(ROOT, "tools/parity/golden/world-126x126.txt");

const have = (c) => spawnSync("sh", ["-c", `command -v ${c}`], { encoding: "utf8" }).status === 0;

if (!have("mcs") || !have("mono")) {
  console.log("SKIP  world golden: no C# toolchain (mcs/mono) installed (optional).");
  process.exit(0);
}

function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return collect(p);
    return e.name.endsWith(".cs") ? [p] : [];
  });
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const exe = path.join(OUT, "DumpWorld.exe");
const build = spawnSync("mcs", [
  "-langversion:latest", "-nologo", "-optimize+", "-out:" + exe,
  ...collect(CORE), path.join(ROOT, "tools/parity/DumpWorld.cs"),
], { encoding: "utf8" });

if (build.status !== 0) {
  console.error("FAIL  could not compile the world dump:\n" + (build.stderr || build.stdout));
  process.exit(1);
}

const run = spawnSync("mono", [exe], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
if (run.status !== 0) {
  console.error("FAIL  the world dump did not run:\n" + (run.stderr || run.stdout));
  process.exit(1);
}

const actual = run.stdout;
fs.rmSync(OUT, { recursive: true, force: true });

if (process.env.ISOPERIA_UPDATE_GOLDEN) {
  fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
  const existed = fs.existsSync(GOLDEN);
  fs.writeFileSync(GOLDEN, actual);
  console.log(`${existed ? "UPDATED" : "CREATED"}  ${path.relative(ROOT, GOLDEN)} ` +
              `(${actual.split("\n").length - 1} lines)`);
  console.log("Commit it, and say in the message WHY world generation changed.");
  process.exit(0);
}

if (!fs.existsSync(GOLDEN)) {
  console.error(`FAIL  no golden at ${path.relative(ROOT, GOLDEN)}.`);
  console.error("      Create it with: ISOPERIA_UPDATE_GOLDEN=1 npm run verify:world");
  process.exit(1);
}

const expected = fs.readFileSync(GOLDEN, "utf8");

if (expected === actual) {
  const lines = actual.split("\n").length - 1;
  const size = (actual.split("\n")[0] || "").replace("SIZE ", "");
  console.log(`PASS  world golden: ${lines} lines identical (${size}, C# against its own committed dump)`);
  process.exit(0);
}

// Locality is the point: name the section and the first differing line.
const a = expected.split("\n");
const b = actual.split("\n");
const SECTIONS = new Set(["SIZE", "TERRAIN", "BIOME", "ZONE", "SEED", "ELEVATION", "WALKABLE", "PATHS"]);

let section = "(before any section)";
let shown = 0;

for (let i = 0; i < Math.max(a.length, b.length); i++) {
  const head = (a[i] || "").split(" ")[0];
  if (SECTIONS.has(head)) section = a[i];
  if (a[i] === b[i]) continue;

  if (shown === 0) {
    console.error(`FAIL  world generation CHANGED, first difference in section ${section}`);
  }
  if (shown < 5) {
    console.error(`      line ${i + 1}`);
    console.error(`        golden: ${JSON.stringify((a[i] ?? "<missing>").slice(0, 96))}`);
    console.error(`        actual: ${JSON.stringify((b[i] ?? "<missing>").slice(0, 96))}`);
  }
  shown++;
}

console.error(`\n${shown} differing line(s).`);
console.error("If you did NOT intend to change world generation, this diff is the bug:");
console.error("a changed draw order or rounding reshuffles every tile's decoration seed");
console.error("and every save that depends on it, permanently and invisibly.");
console.error("If you DID intend it: ISOPERIA_UPDATE_GOLDEN=1 npm run verify:world");
process.exit(1);
