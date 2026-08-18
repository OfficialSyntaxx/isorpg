#!/usr/bin/env node
/**
 * QC: runs the Unity EditMode tests OUTSIDE Unity.
 *
 * The tests in `unity/Assets/Isoperia/Core/Tests/` are ordinary NUnit tests and
 * will run in the Editor's Test Runner as normal. But waiting for the Editor to
 * find out whether they pass means nobody without a Unity licence — CI included
 * — can check, and it puts a multi-minute loop around a one-second question.
 *
 * `Isoperia.Core` is built with `noEngineReferences`, so it has no UnityEngine
 * dependency. Compile it together with the tests and a small NUnit shim
 * (tools/parity/NUnitShim.cs), and the same assertions run anywhere in about a
 * second, unmodified.
 *
 * Skips (does not fail) when no C# toolchain is installed.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, ".parity");
const CORE = path.join(ROOT, "unity/Assets/Isoperia/Core");

function have(cmd) {
  return spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" }).status === 0;
}

if (!have("mcs") || !have("mono")) {
  console.log("SKIP  core tests: no C# toolchain (mcs/mono) installed (optional).");
  console.log("      Install with: apt-get install -y mono-mcs mono-runtime");
  process.exit(0);
}

function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return collect(p);
    return e.name.endsWith(".cs") ? [p] : [];
  });
}

const sources = [
  ...collect(path.join(CORE, "Runtime")),
  ...collect(path.join(CORE, "Tests")),
  path.join(ROOT, "tools/parity/NUnitShim.cs"),
];

fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(OUT, "coretests.exe");

// -langversion:latest because Unity targets C# 9 while mcs defaults to 7.0.
const build = spawnSync("mcs", ["-out:" + exe, "-optimize+", "-langversion:latest", ...sources],
  { cwd: ROOT, encoding: "utf8" });

if (build.status !== 0) {
  console.log("FAIL  core tests: did not compile\n");
  console.log((build.stdout || "") + (build.stderr || ""));
  process.exit(1);
}

const run = spawnSync("mono", [exe], { cwd: ROOT, encoding: "utf8" });
process.stdout.write(run.stdout || "");
if (run.stderr) process.stderr.write(run.stderr);
process.exit(run.status === 0 ? 0 : 1);
