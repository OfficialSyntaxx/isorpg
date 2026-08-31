#!/usr/bin/env node
/**
 * QC: every internal link on the built site goes somewhere that exists.
 *
 * WHY THIS EXISTS
 * The compendium derives its cross-links from the game's content export, and
 * two separate shape assumptions produced links to pages that were never built:
 * `/items/giant_rat/` (a monster id treated as an item id) and
 * `/items/cinder_hollow_returned/` (a journal flag treated as an item id). Both
 * rendered as ordinary item links, both 404ed, and nothing failed. The build was
 * green, the pages looked right, and the only way to find them was to click.
 *
 * That is the failure mode of a derived wiki: the more the site infers, the more
 * ways it can infer something that does not exist. A generated link needs a
 * generated check.
 *
 * Anchors are checked too, not just paths. `/quests/#starter_gather` pointing at
 * a page with no such id is the same defect wearing a fragment.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "web", "dist");

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.log("FAIL  the site is built");
  process.exit(1);
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith(".html"));

/** Route -> the set of element ids on that page. */
const idsByRoute = new Map();
/** Every path that can be served. */
const served = new Set();

for (const f of files) {
  let rel = "/" + path.relative(DIST, f).split(path.sep).join("/");
  served.add(rel);
  if (rel.endsWith("/index.html")) served.add(rel.slice(0, -"index.html".length));
}

for (const f of htmlFiles) {
  const html = fs.readFileSync(f, "utf8");
  let rel = "/" + path.relative(DIST, f).split(path.sep).join("/");
  if (rel.endsWith("/index.html")) rel = rel.slice(0, -"index.html".length);
  const ids = new Set();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  idsByRoute.set(rel, ids);
}

const broken = [];
const brokenAnchors = [];
let checked = 0;

for (const f of htmlFiles) {
  const html = fs.readFileSync(f, "utf8");
  let from = "/" + path.relative(DIST, f).split(path.sep).join("/");
  if (from.endsWith("/index.html")) from = from.slice(0, -"index.html".length);

  for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
    const href = m[1];
    // External, protocol-relative, mail, and pure fragments are out of scope.
    if (/^(https?:)?\/\//.test(href) || /^(mailto:|tel:|data:)/.test(href)) continue;
    if (!href.startsWith("/")) continue;
    // The game is mounted at /play by scripts/compose-site.cjs at deploy time
    // and is deliberately absent from web/dist — the landing build knows
    // nothing about it. Exempted by name rather than by pattern, so a typo like
    // /player/ is still a failure.
    if (href === "/play/" || href.startsWith("/play/?") || href === "/play") continue;
    checked++;

    const [rawPath, frag] = href.split("#");
    const target = rawPath === "" ? from : rawPath;

    const exists =
      served.has(target) ||
      served.has(target + "index.html") ||
      served.has(target.replace(/\/$/, "") + "/index.html") ||
      served.has(target + ".html");
    if (!exists) {
      broken.push(`${from} → ${href}`);
      continue;
    }
    if (frag) {
      const key = idsByRoute.has(target)
        ? target
        : idsByRoute.has(target.replace(/index\.html$/, ""))
          ? target.replace(/index\.html$/, "")
          : null;
      const ids = key ? idsByRoute.get(key) : null;
      if (ids && !ids.has(frag)) brokenAnchors.push(`${from} → ${href}`);
    }
  }
}

ok(
  `every internal link resolves to a built page (${checked} links, ${htmlFiles.length} pages)`,
  broken.length === 0,
  broken.slice(0, 8).join("; "),
);
ok(
  "every in-page anchor target exists",
  brokenAnchors.length === 0,
  brokenAnchors.slice(0, 8).join("; "),
);

console.log(`\n${pass}/${pass + failures.length} passed`);
process.exit(failures.length === 0 ? 0 : 1);
