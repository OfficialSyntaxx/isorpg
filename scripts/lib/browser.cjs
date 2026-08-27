/**
 * Finding a browser for the QC checks, and refusing to pretend when there is
 * none.
 *
 * WHY THIS EXISTS
 * Four browser-driven checks each resolved Playwright and a Chromium binary on
 * their own, and each printed "SKIP" and exited 0 when either was missing. On a
 * GitHub runner both were missing — the Web CI job installs only `web/`, and
 * `playwright-core` is a dependency of the repository root — so the steps ran in
 * under a second, printed `0/0 passed`, and went green.
 *
 * That is worse than having no check. A red build says "look at this"; a green
 * build that tested nothing says "this is fine" in exactly the same voice as a
 * green build that tested everything. The CSP browser pass had been skipping
 * that way since it was written.
 *
 * So: one resolver, and a skip is only allowed where a developer might
 * legitimately not have a browser installed. Under CI it is a failure.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

/** Expands one glob-ish path containing a single `*` segment. */
function expand(pattern) {
  const star = pattern.indexOf("*");
  if (star === -1) return fs.existsSync(pattern) ? [pattern] : [];

  const head = pattern.slice(0, star);
  const dir = path.dirname(head);
  const prefix = path.basename(head);
  const tail = pattern.slice(star + 1);
  if (!fs.existsSync(dir)) return [];

  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.startsWith(prefix)) continue;
    const candidate = path.join(dir, entry) + tail;
    if (fs.existsSync(candidate)) out.push(candidate);
  }
  // Newest build number last; take the highest.
  return out.sort();
}

/**
 * Locates a Chromium the checks can drive.
 *
 * The sandbox this project is developed in pre-installs one under
 * /opt/pw-browsers; a GitHub runner puts it in the Playwright cache after
 * `playwright install chromium`. Both are searched, plus an explicit override
 * for anything else.
 */
function findChromium() {
  const home = os.homedir();
  const patterns = [
    process.env.PLAYWRIGHT_CHROMIUM,
    "/opt/pw-browsers/chromium-*/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
    path.join(home, ".cache/ms-playwright/chromium-*/chrome-linux/chrome"),
    path.join(
      home,
      ".cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell",
    ),
    process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(
          process.env.PLAYWRIGHT_BROWSERS_PATH,
          "chromium-*/chrome-linux/chrome",
        )
      : null,
  ].filter(Boolean);

  for (const pattern of patterns) {
    const found = expand(pattern);
    if (found.length > 0) return found[found.length - 1];
  }
  return null;
}

/** Requires playwright-core, then playwright, then gives up. */
function loadPlaywright() {
  for (const name of ["playwright-core", "playwright"]) {
    try {
      return require(name);
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/**
 * Returns `{ chromium, executablePath }` ready to launch, or exits.
 *
 * Outside CI a missing browser prints a skip and exits 0, because a contributor
 * running one check locally should not be blocked by a 150 MB download they did
 * not ask for. Under CI it exits 1 with an explanation: a check that cannot run
 * has not passed.
 */
function requireBrowser(label, probe = {}) {
  const inCi = process.env.CI === "true" || process.env.CI === "1";
  // `probe` lets the guard itself be tested without uninstalling anything —
  // see scripts/verify-browser-guard.cjs. Callers never pass it.
  const pw = "pw" in probe ? probe.pw : loadPlaywright();

  if (!pw) {
    const why = "playwright-core is not installed";
    if (inCi) {
      console.error(
        `::error::${label}: ${why}, so this check did not run. ` +
          `Install the repository root's dependencies (npm ci at the root) before this step.`,
      );
      process.exit(1);
    }
    console.log(`SKIP  ${label}: ${why}.`);
    process.exit(0);
  }

  const executablePath =
    "executablePath" in probe ? probe.executablePath : findChromium();
  if (!executablePath) {
    const why = "no Chromium binary was found";
    if (inCi) {
      console.error(
        `::error::${label}: ${why}, so this check did not run. ` +
          `Run "npx playwright install chromium" before this step, or set ` +
          `PLAYWRIGHT_CHROMIUM to a browser executable.`,
      );
      process.exit(1);
    }
    console.log(`SKIP  ${label}: ${why}.`);
    process.exit(0);
  }

  return { chromium: pw.chromium, executablePath };
}

module.exports = { requireBrowser, findChromium, loadPlaywright };
