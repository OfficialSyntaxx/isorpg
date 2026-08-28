#!/usr/bin/env node
/**
 * Runs Lighthouse against a deployed site and gates on the blueprint's targets.
 *
 * WHY THIS IS A CI JOB AND NOT SOMETHING RUN BY HAND
 * The Phase 4 exit gate is a Lighthouse score, and it stayed open for the whole
 * build because the development sandbox cannot produce an honest one: there is
 * no Chrome UI, and the network policy blocks Google Fonts — which the real page
 * requests. A score measured there would describe a page nobody is served. A CI
 * runner has a real Chrome and unrestricted egress, so it can.
 *
 * WHY IT RUNS EACH PAGE MORE THAN ONCE
 * Lighthouse's performance score is a measurement, and measurements vary: the
 * same page on the same runner can differ by several points between runs
 * depending on what else the machine is doing. A single run is a number, not a
 * result. This takes the MEDIAN of N runs, which is what makes a threshold
 * meaningful rather than a coin toss. Accessibility, best-practices and SEO are
 * deterministic audits and do not vary, but they are taken from the same median
 * run so every number in a row describes one real page load.
 *
 * WHY THE BROWSER COMES FROM OUR OWN RESOLVER
 * Lighthouse finds Chrome by guessing at install locations, and there is no
 * system Chrome on a runner. scripts/lib/browser.cjs already knows where
 * Playwright puts one, and it refuses to skip under CI — so pointing Lighthouse
 * at the same binary means one answer to "which browser" and no silent
 * fallback to a different one.
 *
 * Usage:
 *   node scripts/run-lighthouse.cjs --url https://example.com
 *   node scripts/run-lighthouse.cjs --url http://localhost:4200 --runs 1 --no-enforce
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { findChromium, loadPlaywright } = require("./lib/browser.cjs");

// Pinned, for the same reason the deploy tool is: an unpinned release in a gate
// means a third party can change what "passing" means, or stop it running at
// all. Raise deliberately after checking the new version installs.
const LIGHTHOUSE = "lighthouse@13.4.1";

/** The blueprint's Phase 4 exit gate (§0, §9.1). */
const TARGETS = {
  performance: 95,
  accessibility: 100,
  "best-practices": 100,
  seo: 100,
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (
    i !== -1 &&
    process.argv[i + 1] &&
    !process.argv[i + 1].startsWith("--")
  ) {
    return process.argv[i + 1];
  }
  return fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const BASE = (arg("url", "") || "").replace(/\/+$/, "");
if (!BASE) {
  console.error(
    "usage: run-lighthouse.cjs --url <base-url> [--routes /,/features/] [--runs 3]",
  );
  process.exit(2);
}

const ROUTES = arg("routes", "/,/features/,/wiki/,/devlog/")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

const FORM_FACTORS =
  arg("form-factor", "both") === "both"
    ? ["mobile", "desktop"]
    : [arg("form-factor", "mobile")];

const RUNS = Math.max(1, Number(arg("runs", "3")) || 3);
const ENFORCE = !flag("no-enforce");
const OUT = arg("out", "lighthouse-reports");

fs.mkdirSync(OUT, { recursive: true });

/** Resolves the browser once, and fails loudly rather than letting Lighthouse guess. */
function chrome() {
  const found = findChromium(loadPlaywright());
  if (!found) {
    console.error(
      "::error::run-lighthouse: no Chromium found. Install one first " +
        '("npx playwright install chromium") or set PLAYWRIGHT_CHROMIUM.',
    );
    process.exit(1);
  }
  return found;
}

const CHROME_PATH = chrome();
console.log(`Chrome:     ${CHROME_PATH}`);
console.log(`Lighthouse: ${LIGHTHOUSE}`);
console.log(`Base URL:   ${BASE}`);

/*
 * A LOCAL RUN IS NOT A PRODUCTION RUN, AND THE GAP IS LARGE.
 *
 * Measured 2026-08-28 on the same commit: `npx serve` over HTTP/1.1 with no
 * compression and no cache headers gave a median mobile performance of 95 on
 * both `/` and `/world/`, and blamed render-blocking stylesheets and font
 * chaining. Netlify — HTTP/2, Brotli, the immutable cache headers this repo
 * already ships — gave 100 on both. Five points, entirely transport.
 *
 * That gap was nearly acted on as a real regression: a whole phase of
 * "reclaim the performance budget" work was planned against a number that
 * only existed because of the static server used to produce it.
 *
 * So a localhost run is for comparing against other localhost runs and for
 * reading the diagnostics. The gate is a run against the deployed site.
 */
if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(BASE)) {
  console.log(
    "\nNOTE: local origin. Local scores run several points below production —\n" +
      "a dev static server has no HTTP/2, no compression and no cache headers.\n" +
      "Use these to compare against other local runs and to read the diagnostics;\n" +
      "take the score itself from a run against the deployed site.",
  );
}
console.log(`Routes:     ${ROUTES.join(" ")}`);
console.log(`Runs:       ${RUNS} per route per form factor`);
console.log(`Enforcing:  ${ENFORCE ? "yes" : "no (report only)"}\n`);

/** One Lighthouse run. Returns the parsed category scores, or null if it failed. */
function runOnce(url, formFactor, slug, index) {
  const stem = path.join(OUT, `${slug}-${formFactor}-${index}`);
  const args = [
    "--yes",
    LIGHTHOUSE,
    url,
    "--quiet",
    "--output=json",
    "--output=html",
    `--output-path=${stem}`,
    // --headless=new is the supported headless mode; --no-sandbox is required
    // because CI runners run as root inside a container.
    "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage",
    // Only the four categories the gate is about. Skipping the rest is a third
    // of the runtime.
    "--only-categories=performance,accessibility,best-practices,seo",
  ];
  if (formFactor === "desktop") args.push("--preset=desktop");

  const r = spawnSync("npx", args, {
    encoding: "utf8",
    env: { ...process.env, CHROME_PATH },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });

  const jsonPath = `${stem}.report.json`;
  if (!fs.existsSync(jsonPath)) {
    console.log(`      run ${index + 1}: FAILED`);
    const detail = (r.stderr || r.stdout || "")
      .trim()
      .split("\n")
      .slice(-4)
      .join("\n      ");
    if (detail) console.log(`      ${detail}`);
    return null;
  }

  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const scores = {};
  for (const key of Object.keys(TARGETS)) {
    const cat = report.categories[key];
    scores[key] =
      cat && typeof cat.score === "number" ? Math.round(cat.score * 100) : null;
  }
  scores.__runtimeError = report.runtimeError ? report.runtimeError.code : null;
  // Kept so the median run can be re-opened for its diagnostics below.
  scores.__reportPath = jsonPath;
  console.log(
    `      run ${index + 1}: perf ${scores.performance} · a11y ${scores.accessibility} · ` +
      `bp ${scores["best-practices"]} · seo ${scores.seo}`,
  );
  return scores;
}

/** Median by performance score; ties keep the first. */
function medianRun(runs) {
  const ok = runs.filter(Boolean);
  if (ok.length === 0) return null;
  const sorted = [...ok].sort(
    (a, b) => (a.performance ?? 0) - (b.performance ?? 0),
  );
  return sorted[Math.floor(sorted.length / 2)];
}

const rows = [];
let hardFailure = false;

for (const route of ROUTES) {
  for (const formFactor of FORM_FACTORS) {
    const url = `${BASE}${route}`;
    const slug = route.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "home";
    console.log(`  ${formFactor.padEnd(7)} ${url}`);

    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(runOnce(url, formFactor, slug, i));

    const median = medianRun(runs);
    if (!median) {
      hardFailure = true;
      rows.push({ route, formFactor, failed: true });
      continue;
    }
    if (median.__runtimeError) {
      console.log(`      runtime error: ${median.__runtimeError}`);
      hardFailure = true;
    }
    rows.push({ route, formFactor, ...median });
  }
}

// --- report ----------------------------------------------------------------
const cell = (v, target) => {
  if (v === null || v === undefined) return "—";
  return v >= target ? `${v} ✅` : `**${v}** ❌`;
};

const lines = [];
lines.push("## Lighthouse");
lines.push("");
lines.push(
  `\`${BASE}\` · median of ${RUNS} run${RUNS === 1 ? "" : "s"} per row`,
);
lines.push("");
lines.push(
  "| Route | Device | Performance | Accessibility | Best practices | SEO |",
);
lines.push("|---|---|---|---|---|---|");
for (const r of rows) {
  if (r.failed) {
    lines.push(
      `| \`${r.route}\` | ${r.formFactor} | did not complete | — | — | — |`,
    );
    continue;
  }
  lines.push(
    `| \`${r.route}\` | ${r.formFactor} | ${cell(r.performance, TARGETS.performance)} | ` +
      `${cell(r.accessibility, TARGETS.accessibility)} | ` +
      `${cell(r["best-practices"], TARGETS["best-practices"])} | ` +
      `${cell(r.seo, TARGETS.seo)} |`,
  );
}
lines.push("");
lines.push(
  `Targets: performance ≥ ${TARGETS.performance}, accessibility ${TARGETS.accessibility}, ` +
    `best practices ${TARGETS["best-practices"]}, SEO ${TARGETS.seo}.`,
);
lines.push("");
lines.push("Full HTML reports are attached to this run as an artifact.");

/**
 * For every row under target, say WHY.
 *
 * Without this the workflow reports a number and nothing else, and the only
 * route to the reasons is the HTML artifact — which cannot be downloaded from
 * every environment that might need to read it. A gate that says "87" and stops
 * is a gate somebody guesses against. These are the same audits the HTML report
 * shows, pulled out of the JSON of the median run, so the diagnosis travels with
 * the score.
 */
const METRICS = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "total-blocking-time",
  "cumulative-layout-shift",
  "speed-index",
];

const diagnosed = rows.filter(
  (r) =>
    !r.failed &&
    r.__reportPath &&
    Object.entries(TARGETS).some(
      ([k, t]) => typeof r[k] === "number" && r[k] < t,
    ),
);

if (diagnosed.length > 0) {
  lines.push("");
  lines.push("### Why the rows below target are below target");
  for (const r of diagnosed) {
    let report;
    try {
      report = JSON.parse(fs.readFileSync(r.__reportPath, "utf8"));
    } catch {
      continue;
    }
    const audits = report.audits || {};

    lines.push("");
    lines.push(`**\`${r.route}\` · ${r.formFactor}**`);
    lines.push("");
    const metricBits = METRICS.filter((m) => audits[m]).map(
      (m) => `${audits[m].title}: ${audits[m].displayValue || "—"}`,
    );
    lines.push(metricBits.join(" · "));
    lines.push("");

    // Everything the performance category scored down, worst first, with the
    // saving Lighthouse estimates where it estimates one.
    const perfRefs = (
      (report.categories.performance || {}).auditRefs || []
    ).map((a) => a.id);
    const failing = perfRefs
      .map((id) => audits[id])
      .filter(
        (a) =>
          a &&
          typeof a.score === "number" &&
          a.score < 0.9 &&
          !METRICS.includes(a.id),
      )
      .map((a) => ({
        title: a.title,
        score: a.score,
        detail: a.displayValue || "",
        saving:
          (a.details && typeof a.details.overallSavingsMs === "number"
            ? a.details.overallSavingsMs
            : 0) ||
          (a.metricSavings
            ? Math.max(
                ...Object.values(a.metricSavings)
                  .map(Number)
                  .filter(Number.isFinite),
                0,
              )
            : 0),
      }))
      .sort((x, y) => y.saving - x.saving || x.score - y.score);

    if (failing.length === 0) {
      lines.push("_No performance audit scored below 0.9._");
      continue;
    }
    lines.push("| Audit | Score | Detail |");
    lines.push("|---|---|---|");
    for (const a of failing.slice(0, 12)) {
      lines.push(`| ${a.title} | ${a.score.toFixed(2)} | ${a.detail} |`);
    }
  }
}

const summary = lines.join("\n");
console.log("\n" + summary + "\n");

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
}
fs.writeFileSync(path.join(OUT, "summary.md"), summary + "\n");

// --- gate ------------------------------------------------------------------
const below = [];
for (const r of rows) {
  if (r.failed) continue;
  for (const [key, target] of Object.entries(TARGETS)) {
    if (typeof r[key] === "number" && r[key] < target) {
      below.push(`${r.route} (${r.formFactor}) ${key}: ${r[key]} < ${target}`);
    }
  }
}

if (below.length > 0) {
  console.log("Below target:");
  for (const b of below) console.log(`  ${b}`);
}

if (!ENFORCE) {
  console.log("\nReport-only run; not gating.");
  process.exit(hardFailure ? 1 : 0);
}

if (hardFailure) {
  console.error("::error::Lighthouse did not complete for at least one page.");
  process.exit(1);
}
if (below.length > 0) {
  console.error(`::error::${below.length} Lighthouse score(s) below target.`);
  process.exit(1);
}
console.log("All scores meet the targets.");
process.exit(0);
