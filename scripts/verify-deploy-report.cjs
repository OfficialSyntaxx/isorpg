#!/usr/bin/env node
/**
 * QC: proves scripts/deploy-report.sh's header check actually distinguishes a
 * live site from a dead one, and that it follows the game when the game moves
 * to a subdirectory.
 *
 * WHY THIS EXISTS
 * That header check is, in the words of its own source, "the single thing
 * separating 'deployed' from 'actually loads'". It had never been tested, and
 * it was broken: it emitted "VERDICT: WRONG" while unity-webgl.yml grepped for
 * "VERDICT: FAIL", so the workflow's fail-gate could not fire. A wasm served as
 * text/plain would have produced a green run and a blank site.
 *
 * Moving the game to /play makes this worse, not better: a check still pointed
 * at $SITE/Build/... would 404 and, with the old code, still not fail the run.
 * So the check is now exercised against a real HTTP server on every push.
 *
 * Serves three shapes and asserts the verdict for each:
 *   1. correct headers at /play/Build/*  -> OK
 *   2. wrong content-type                -> FAIL
 *   3. missing content-encoding          -> FAIL
 *   4. game at root while prefix is set  -> FAIL (the 404 case)
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts/deploy-report.sh");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  [" + detail + "]" : ""}`); }
};

// --- fixture: a stand-in for unity/WebGLBuild -------------------------------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "isoperia-deployreport-"));
const GAME = path.join(TMP, "WebGLBuild");
fs.mkdirSync(path.join(GAME, "Build"), { recursive: true });
fs.writeFileSync(path.join(GAME, "Build", "web.wasm.br"), "\0");
fs.writeFileSync(path.join(GAME, "Build", "web.data.br"), "\0");

// --- a server that can be told to serve correct or broken headers ------------
let mode = "correct";
let prefix = "/play";

const server = http.createServer((req, res) => {
  const wantWasm = req.url.endsWith(".wasm.br");
  const wantData = req.url.endsWith(".data.br");
  if (!req.url.startsWith(prefix + "/Build/") || (!wantWasm && !wantData)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  const headers = {};
  if (mode === "correct") {
    headers["Content-Type"] = wantWasm ? "application/wasm" : "application/octet-stream";
    headers["Content-Encoding"] = "br";
  } else if (mode === "wrong-type") {
    // What Netlify serves when no _headers rule matches — the exact symptom of
    // the /play move done without rewriting the rules.
    headers["Content-Type"] = "text/plain";
    headers["Content-Encoding"] = "br";
  } else if (mode === "no-encoding") {
    headers["Content-Type"] = wantWasm ? "application/wasm" : "application/octet-stream";
  }
  res.writeHead(200, headers);
  res.end("x");
});

/**
 * Runs the script and resolves with the report it wrote.
 *
 * Deliberately async rather than spawnSync: the stub server lives in THIS
 * process, and a synchronous spawn blocks the event loop, so curl inside the
 * script would wait out its own --max-time against a server that cannot answer.
 */
function runCheck({ gamePrefix }) {
  const report = path.join(TMP, "report.txt");
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [SCRIPT, `http://localhost:${port}`], {
      cwd: ROOT,
      env: {
        ...process.env,
        GAME_DIR: GAME,
        DEPLOY_DIR: GAME,
        GAME_PREFIX: gamePrefix,
        REPORT: report,
        // localhost is already in the sandbox's no-proxy list, but be explicit:
        // a proxied request here would be testing the proxy, not the script.
        no_proxy: "localhost,127.0.0.1",
        NO_PROXY: "localhost,127.0.0.1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("close", (status) => {
      const text = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : "";
      resolve({ text, stdout, status });
    });
  });
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));

  // 1. Correct headers, game under /play.
  mode = "correct";
  let r = await runCheck({ gamePrefix: "play" });
  ok("correct headers under /play -> OK", /VERDICT: OK/.test(r.text) && !/VERDICT: FAIL/.test(r.text),
     r.text.match(/VERDICT.*/g)?.join(" | "));
  ok("check actually requested the prefixed url", /localhost:\d+\/play\/Build\//.test(r.text) || /VERDICT: OK/.test(r.text));

  // 2. Wrong content-type — the "no rule matched" symptom.
  mode = "wrong-type";
  r = await runCheck({ gamePrefix: "play" });
  ok("wrong content-type -> FAIL", /VERDICT: FAIL/.test(r.text),
     r.text.match(/VERDICT.*/g)?.join(" | "));
  ok("FAIL is the exact string unity-webgl.yml greps for",
     /VERDICT: FAIL/.test(r.text) && !/VERDICT: WRONG/.test(r.text));

  // 3. Missing content-encoding — the loader hangs on this one.
  mode = "no-encoding";
  r = await runCheck({ gamePrefix: "play" });
  ok("missing content-encoding -> FAIL", /VERDICT: FAIL/.test(r.text),
     r.text.match(/VERDICT.*/g)?.join(" | "));

  // 4. The regression this change is guarding: the game moved to /play but the
  //    check still points at the root. Everything 404s and it must fail.
  mode = "correct";
  r = await runCheck({ gamePrefix: "" });
  ok("checking the root while the game is at /play -> FAIL", /VERDICT: FAIL/.test(r.text),
     r.text.match(/VERDICT.*/g)?.join(" | "));

  // 5. Prefix normalisation: "/play" and "play/" must behave like "play".
  mode = "correct";
  for (const p of ["/play", "play/", "/play/"]) {
    r = await runCheck({ gamePrefix: p });
    ok(`prefix "${p}" normalises`, /VERDICT: OK/.test(r.text) && !/VERDICT: FAIL/.test(r.text));
  }

  await new Promise((r2) => server.close(r2));
  fs.rmSync(TMP, { recursive: true, force: true });

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("verify-deploy-report: " + ((e && e.stack) || e));
  try { server.close(); } catch {}
  process.exit(1);
});
