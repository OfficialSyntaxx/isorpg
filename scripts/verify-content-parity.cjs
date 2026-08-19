#!/usr/bin/env node
/**
 * QC: proves the JSON the Unity build loads still says what src/data/*.ts says.
 *
 * The chain has three links — TypeScript source, exported JSON, C# loader — and
 * a break in any one is invisible from either end alone. The exporter can drop a
 * table (a Set serialised to {} lost 62 item ids on its first run, silently).
 * The loader can misread one. Both produce a game with quietly wrong content
 * rather than an error.
 *
 * So: dump a canonical text form from the TypeScript, dump the same from C#
 * going through ContentDatabase over the real exported files, and byte-diff.
 * The C# side deliberately reads the JSON rather than the TypeScript, and the
 * TS side deliberately reads the TypeScript rather than the JSON — comparing
 * the JSON with itself would prove only that a file can be read twice.
 *
 * Skips (does not fail) when no C# toolchain is installed.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, ".content-parity");
const CORE = path.join(ROOT, "unity/Assets/Isoperia/Core/Runtime");
const CONTENT = path.join(ROOT, "unity/Assets/Isoperia/Resources/Content");

const have = (c) => spawnSync("sh", ["-c", `command -v ${c}`], { encoding: "utf8" }).status === 0;

if (!have("mcs") || !have("mono")) {
  console.log("SKIP  content parity: no C# toolchain (mcs/mono) installed (optional).");
  process.exit(0);
}

if (!fs.existsSync(CONTENT)) {
  console.error(`FAIL  ${path.relative(ROOT, CONTENT)} does not exist. Run: npm run export:content`);
  process.exit(1);
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

const exe = path.join(OUT, "DumpContent.exe");
const build = spawnSync("mcs", [
  "-langversion:latest", "-nologo", "-out:" + exe,
  ...collect(CORE), path.join(ROOT, "tools/parity/DumpContent.cs"),
], { encoding: "utf8" });

if (build.status !== 0) {
  console.error("FAIL  could not compile the C# content dump:\n" + (build.stderr || build.stdout));
  process.exit(1);
}

const cs = spawnSync("mono", [exe, CONTENT], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (cs.status !== 0) {
  console.error("FAIL  the C# dump did not run:\n" + (cs.stderr || cs.stdout));
  process.exit(1);
}

const ts = spawnSync("node", [path.join(ROOT, "tools/parity/dump-content-ts.cjs")], {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024, cwd: ROOT,
});
if (ts.status !== 0) {
  console.error("FAIL  the TypeScript dump did not run:\n" + (ts.stderr || ts.stdout));
  process.exit(1);
}

const a = ts.stdout.split("\n");
const b = cs.stdout.split("\n");

let diffs = 0;
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] === b[i]) continue;
  if (diffs < 10) {
    console.error(`FAIL  line ${i + 1}\n        TS: ${a[i] ?? "<missing>"}\n        C#: ${b[i] ?? "<missing>"}`);
  }
  diffs++;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.rmSync(path.join(ROOT, ".content-parity-emit"), { recursive: true, force: true });

if (diffs > 0) {
  console.error(`\n${diffs} differing line(s). The exported JSON no longer matches src/data.`);
  console.error("If src/data changed, run: npm run export:content");
  process.exit(1);
}

console.log(`PASS  content parity: ${a.length - 1} lines identical (TypeScript -> JSON -> C# loader)`);
