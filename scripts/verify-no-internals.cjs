#!/usr/bin/env node
/**
 * QC: fails the build if anything repository-shaped reached a public page.
 *
 * WHY THIS EXISTS
 * /devlog rendered UPDATES.md and /roadmap rendered ROADMAP.md, both verbatim.
 * Those are engineering documents. Measured on the built site before this
 * existed: 102 devlog pages carrying build-script filenames, source paths,
 * internal document names, asset-vendor names and per-asset spend, plus a wiki
 * page opening with an instruction to re-run a generator, plus a source-file
 * path printed under the experience chart.
 *
 * None of that is a secret in the cryptographic sense and none of it is
 * catastrophic on its own. It is simply not for players, it makes the site read
 * like somebody's working notes, and taken together it maps the project's
 * internals for anyone who cares to read it.
 *
 * WHY A SCANNER RATHER THAN CAREFUL WRITING
 * Careful writing is the actual rule — see the notes at the top of
 * web/content/devlog.md and web/content/roadmap.md. This is the backstop, and a
 * backstop is worth having because the failure mode is silent: a leak ships
 * looking exactly like a page that did not leak. The only way to know is to
 * look at every built page every time, which is a machine's job.
 *
 * WHAT IT DOES NOT DO
 * It reads the built HTML, so it cannot see a leak that only appears at
 * runtime, and it matches patterns, so it cannot judge whether a sentence gives
 * away something it should not. Passing means "nothing matched", not "safe".
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "web/dist");

/**
 * Each rule is a name, a pattern, and why it is forbidden.
 *
 * Patterns are deliberately narrow. A rule broad enough to match ordinary
 * English ("build", "data", "source") would fire on real player-facing copy,
 * get suppressed by whoever hit it, and stop protecting anything.
 */
const RULES = [
  {
    name: "build-script filenames",
    re: /\b[\w-]+\.(?:cjs|mjs)\b/g,
    why: "names a build script",
  },
  {
    name: "repository source paths",
    re: /\b(?:src|scripts|tests|unity|web)\/[\w./-]+/g,
    why: "is a path inside the repository",
  },
  {
    name: "internal document names",
    re: /\bdocs\/[\w.-]+|\b(?:ROADMAP|UPDATES|WIKI|CLAUDE|AGENTS)\.md\b/g,
    why: "names an internal document",
  },
  {
    name: "tool commands",
    re: /\bnpm (?:run|ci|test|install)\b|\bnode scripts\b|\bgit (?:commit|push|checkout)\b/g,
    why: "is a command a maintainer runs, not something a player does",
  },
  {
    name: "code hosting",
    re: /\bgithub\.com\/[\w-]+|\bgitlab\.com\/[\w-]+|\bbitbucket\.org\/[\w-]+/g,
    why: "links the repository",
  },
  {
    name: "asset-tool vendors and spend",
    re: /\bHiggsfield\b|\bMeshy\b|\bnano_banana\w*|\b\d+(?:\.\d+)?\s*(?:cr|credits?)\b/g,
    why: "names an asset vendor or what it cost",
  },
  {
    name: "CI and deploy internals",
    re: /\bworkflow_dispatch\b|\bNETLIFY_[A-Z_]+|\bGITHUB_[A-Z_]+|\bsecrets\.[A-Z_]+/g,
    why: "exposes deployment configuration",
  },
  {
    name: "engine source symbols",
    re: /\b\w+\.(?:cs|ts|tsx)\b(?!\w)/g,
    why: "names a source file",
  },
];

/**
 * Matches that are legitimate on a public page.
 *
 * Kept as exact strings rather than loosened patterns, for the same reason the
 * devlog parser allow-lists headings by exact text: a widened pattern silently
 * stops catching the thing it was written for.
 */
const ALLOWED = new Set([
  // The game is served from /play; the word "play" is not a repository path.
  "play/index.html",
]);

let pass = 0;
let fail = 0;
const findings = [];

if (!fs.existsSync(DIST)) {
  console.log(`SKIP  no-internals: ${path.relative(ROOT, DIST)} not built.`);
  process.exit(0);
}

/** Every .html file under the built site. */
function htmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith(".html") || entry.name.endsWith(".xml"))
      out.push(full);
  }
  return out;
}

const files = htmlFiles(DIST);
console.log(`Scanning ${files.length} built pages for repository internals.\n`);

for (const file of files) {
  const rel = path.relative(DIST, file);
  // The whole file, comments included. An HTML comment is not visible copy but
  // it is shipped to every visitor and readable with one keystroke, so it is
  // scanned like anything else. strip-html-comments.cjs removes them from the
  // build; this is what proves it worked.
  const text = fs.readFileSync(file, "utf8");

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    const hits = new Set();
    let m;
    while ((m = rule.re.exec(text)) !== null) {
      const hit = m[0];
      if (!ALLOWED.has(hit)) hits.add(hit);
    }
    if (hits.size > 0) {
      findings.push({ rel, rule: rule.name, why: rule.why, hits: [...hits] });
    }
  }
}

// Report by rule rather than by file: one bad sentence in a shared component
// shows up on every page, and 102 identical failures hide the other problems.
const byRule = new Map();
for (const f of findings) {
  const entry = byRule.get(f.rule) ?? { why: f.why, hits: new Map() };
  for (const hit of f.hits) {
    const pages = entry.hits.get(hit) ?? [];
    pages.push(f.rel);
    entry.hits.set(hit, pages);
  }
  byRule.set(f.rule, entry);
}

for (const rule of RULES) {
  const entry = byRule.get(rule.name);
  if (!entry) {
    pass++;
    console.log(`PASS  no ${rule.name} on any public page`);
    continue;
  }
  fail++;
  console.log(`FAIL  ${rule.name} — ${entry.why}`);
  const sorted = [...entry.hits.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  for (const [hit, pages] of sorted.slice(0, 8)) {
    const where =
      pages.length === 1 ? pages[0] : `${pages.length} pages, e.g. ${pages[0]}`;
    console.log(`        ${JSON.stringify(hit)}  (${where})`);
  }
  if (sorted.length > 8)
    console.log(`        ... and ${sorted.length - 8} more`);
}

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) {
  console.log(
    "\nA public page is showing something written for whoever builds the game.\n" +
      "Rewrite the copy for a player rather than adding an exception: the\n" +
      "allow-list in this file is for strings that are genuinely public, not\n" +
      "for silencing a real finding.",
  );
}
process.exit(fail ? 1 : 0);
