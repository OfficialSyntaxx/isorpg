#!/usr/bin/env node
/**
 * QC: the browser-check guard fails under CI instead of skipping.
 *
 * WHY THIS EXISTS
 * The four browser-driven checks used to print SKIP and exit 0 when Playwright
 * or Chromium was missing. On a GitHub runner both were missing, so those steps
 * ran in under a second, printed `0/0 passed`, and went green — for the CSP
 * browser pass, since the day it was written.
 *
 * The guard that replaced that behaviour is itself the kind of code whose
 * failure is silent, so it gets its own check. It runs the guard in a child
 * process with the browser lookup stubbed out, and asserts the exit codes: 1
 * under CI, 0 elsewhere. Uninstalling Playwright to test this would be the more
 * faithful experiment and is not something a check may do to the machine it is
 * running on.
 */
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const GUARD = path.join(__dirname, "lib/browser.cjs");

let pass = 0,
  fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? "  [" + detail + "]" : ""}`);
  }
};

/** Runs requireBrowser with `probe` in a child, returns its exit code. */
function run(probe, env) {
  const code = `
    const { requireBrowser } = require(${JSON.stringify(GUARD)});
    requireBrowser("probe", ${probe});
    console.log("REACHED");
  `;
  const r = spawnSync(process.execPath, ["-e", code], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

const NO_PW = "{ pw: null }";
const NO_BROWSER = "{ pw: { chromium: {} }, executablePath: null }";
const BOTH_OK = '{ pw: { chromium: {} }, executablePath: "/tmp/chrome" }';

{
  const r = run(NO_PW, { CI: "true" });
  ok("CI + no playwright exits non-zero", r.status === 1, `exit ${r.status}`);
  ok("and says why", /did not run/.test(r.out), r.out.slice(0, 90));
}
{
  const r = run(NO_BROWSER, { CI: "true" });
  ok("CI + no chromium exits non-zero", r.status === 1, `exit ${r.status}`);
}
{
  const r = run(NO_PW, { CI: "" });
  ok(
    "outside CI, a missing browser skips cleanly",
    r.status === 0,
    `exit ${r.status}`,
  );
  ok("and says it skipped", /SKIP/.test(r.out), r.out.slice(0, 60));
}
{
  const r = run(BOTH_OK, { CI: "true" });
  ok(
    "with both present the guard returns",
    r.status === 0 && /REACHED/.test(r.out),
    r.out.slice(0, 60),
  );
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
