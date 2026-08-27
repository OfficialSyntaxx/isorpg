#!/usr/bin/env node
/**
 * QC: proves scripts/compose-site.cjs produces a publish directory that will
 * actually serve the game from a subdirectory — WITHOUT Unity, without a
 * licence, without a browser, and without a 50 MB build.
 *
 * WHY THIS EXISTS
 * Moving the game off the site root breaks its _headers silently. Nothing
 * fails: the build succeeds, the deploy succeeds, the header check passes if it
 * is still pointed at the old path, and the site is dead. docs/CI_DEPLOY.md is
 * blunt that the guards in this repo were "written after the fact, from a
 * screenshot" — this one is written before the fact, from the same failure
 * mode.
 *
 * The fixture uses the REAL unity/Assets/WebGLTemplates/IsoperiaPWA/_headers,
 * not a copy. So if anyone later adds a root-anchored rule to the template that
 * the prefixing does not handle, this fails on their push rather than on a
 * phone.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { compose } = require("./compose-site.cjs");

const ROOT = path.join(__dirname, "..");
const TEMPLATE = path.join(ROOT, "unity/Assets/WebGLTemplates/IsoperiaPWA");
const PREFIX = "play";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  [" + detail + "]" : ""}`); }
};

// --- fixture -----------------------------------------------------------------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "isoperia-compose-"));
const SITE = path.join(TMP, "site");
const GAME = path.join(TMP, "game");
const OUT = path.join(TMP, "out");

function writeFile(p, contents) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contents);
}

// A minimal stand-in for the Astro output.
writeFile(path.join(SITE, "index.html"), "<!doctype html><title>Isoperia</title>");
writeFile(path.join(SITE, "devlog/index.html"), "<!doctype html><title>Devlog</title>");
writeFile(path.join(SITE, "_headers"), [
  "/*",
  "  X-Frame-Options: DENY",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "",
].join("\n"));

// A minimal stand-in for unity/WebGLBuild. The names match what Unity emits and
// what verify-pwa-template.cjs already assumes.
writeFile(path.join(GAME, "index.html"), "<!doctype html><title>Isoperia</title>");
writeFile(path.join(GAME, "ServiceWorker.js"), "// isoperia-20260827-test");
writeFile(path.join(GAME, "manifest.webmanifest"), '{"name":"Isoperia","scope":"./"}');
writeFile(path.join(GAME, "Build/web.wasm.br"), "\0fake-wasm");
writeFile(path.join(GAME, "Build/web.data.br"), "\0fake-data");
writeFile(path.join(GAME, "Build/web.framework.js.br"), "\0fake-framework");
writeFile(path.join(GAME, "Build/web.loader.js"), "// loader");
writeFile(path.join(GAME, "icons/icon-192.png"), "\0png");
writeFile(path.join(GAME, "vercel.json"), "{}");
// The real one. This is the point of the whole test.
fs.copyFileSync(path.join(TEMPLATE, "_headers"), path.join(GAME, "_headers"));

// --- run ---------------------------------------------------------------------
compose(["--site", SITE, "--game", GAME, "--out", OUT, "--prefix", PREFIX]);

const read = (p) => fs.readFileSync(path.join(OUT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(OUT, p));

// --- structure ---------------------------------------------------------------
ok("landing index at root", exists("index.html"));
ok("landing subpage preserved", exists("devlog/index.html"));
ok(`game index at /${PREFIX}`, exists(`${PREFIX}/index.html`));
ok(`game payload at /${PREFIX}/Build`, exists(`${PREFIX}/Build/web.wasm.br`));
ok(`service worker at /${PREFIX}`, exists(`${PREFIX}/ServiceWorker.js`));
ok(`manifest at /${PREFIX}`, exists(`${PREFIX}/manifest.webmanifest`));

// Netlify ignores nested _headers and serves them as public text. If this one
// survives, the game's rules are NOT applied and the site is dead.
ok("nested game _headers removed", !exists(`${PREFIX}/_headers`));
ok("vercel.json dropped", !exists(`${PREFIX}/vercel.json`));
ok("exactly one _headers in the tree", (function () {
  const found = [];
  (function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, path.join(rel, e.name));
      else if (e.name === "_headers") found.push(path.join(rel, e.name));
    }
  })(OUT, "");
  return found.length === 1 && found[0] === "_headers";
})());

// --- the headers themselves --------------------------------------------------
const headers = read("_headers");

// Every path pattern in the merged file must be either a landing-site rule or
// a prefixed game rule. A bare "/Build/..." means the rewrite missed one.
const patterns = headers
  .split("\n")
  .filter((l) => /^\/\S*\s*$/.test(l))
  .map((l) => l.trim());

ok("merged file has rules", patterns.length > 0, String(patterns.length));

const unprefixedGameRules = patterns.filter(
  (p) => /^\/(Build|ServiceWorker\.js|index\.html|manifest\.webmanifest|StreamingAssets)/.test(p)
);
ok(
  "no root-anchored game rules survive",
  unprefixedGameRules.length === 0,
  unprefixedGameRules.join(" ")
);

// The three rules that decide whether the Unity loader lives or dies.
function ruleFor(pattern) {
  const lines = headers.split("\n");
  const i = lines.findIndex((l) => l.trim() === pattern && /^\//.test(l));
  if (i === -1) return null;
  const body = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^\s+\S/.test(lines[j])) body.push(lines[j].trim());
    else if (lines[j].trim() === "") continue;
    else break;
  }
  return body;
}

const wasmRule = ruleFor(`/${PREFIX}/Build/*.wasm.br`);
ok(`/${PREFIX}/Build/*.wasm.br rule present`, wasmRule !== null);
ok(
  "wasm declares Content-Type: application/wasm",
  !!wasmRule && wasmRule.some((h) => /^Content-Type:\s*application\/wasm$/i.test(h)),
  JSON.stringify(wasmRule)
);
ok(
  "wasm declares Content-Encoding: br",
  !!wasmRule && wasmRule.some((h) => /^Content-Encoding:\s*br$/i.test(h)),
  JSON.stringify(wasmRule)
);

const dataRule = ruleFor(`/${PREFIX}/Build/*.data.br`);
ok(
  "data declares Content-Encoding: br",
  !!dataRule && dataRule.some((h) => /^Content-Encoding:\s*br$/i.test(h)),
  JSON.stringify(dataRule)
);

const swRule = ruleFor(`/${PREFIX}/ServiceWorker.js`);
ok(
  "service worker stays no-store",
  !!swRule && swRule.some((h) => /no-store/i.test(h)),
  JSON.stringify(swRule)
);

// The landing site's own rules must survive the merge, and must come first so
// that the game's more specific rules win on overlap.
ok("landing rules preserved", /^\/\*$/m.test(headers) && /X-Frame-Options:\s*DENY/.test(headers));
ok(
  "landing rules precede game rules",
  headers.indexOf("/*") < headers.indexOf(`/${PREFIX}/Build`),
  "last match wins in Netlify; game rules must come after"
);

// --- refusals ----------------------------------------------------------------
// A missing game directory is the way a landing-only deploy takes the game
// offline while reporting success. It must be a hard stop.
function refuses(name, argv) {
  const res = require("child_process").spawnSync(
    process.execPath,
    [path.join(__dirname, "compose-site.cjs"), ...argv],
    { encoding: "utf8" }
  );
  ok(name, res.status !== 0, `exit ${res.status}`);
}

refuses("refuses a missing game directory", [
  "--site", SITE, "--game", path.join(TMP, "nope"), "--out", path.join(TMP, "out2"),
]);

const NOWASM = path.join(TMP, "game-nowasm");
writeFile(path.join(NOWASM, "index.html"), "x");
writeFile(path.join(NOWASM, "Build/.keep"), "");
writeFile(path.join(NOWASM, "_headers"), "/*\n  X: y\n");
refuses("refuses a Build/ with no compressed payload", [
  "--site", SITE, "--game", NOWASM, "--out", path.join(TMP, "out3"),
]);

const NOHDR = path.join(TMP, "game-noheaders");
writeFile(path.join(NOHDR, "index.html"), "x");
writeFile(path.join(NOHDR, "Build/web.wasm.br"), "\0");
refuses("refuses a game build with no _headers", [
  "--site", SITE, "--game", NOHDR, "--out", path.join(TMP, "out4"),
]);

refuses("refuses a multi-segment prefix", [
  "--site", SITE, "--game", GAME, "--out", path.join(TMP, "out5"), "--prefix", "a/b",
]);

// A landing route that collides with the mount point would be silently
// overwritten by the game.
const COLLIDE = path.join(TMP, "site-collision");
writeFile(path.join(COLLIDE, "index.html"), "x");
writeFile(path.join(COLLIDE, `${PREFIX}/index.html`), "landing's own /play page");
refuses("refuses when the site already has the mount directory", [
  "--site", COLLIDE, "--game", GAME, "--out", path.join(TMP, "out6"), "--prefix", PREFIX,
]);

// --- done --------------------------------------------------------------------
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
