#!/usr/bin/env node
/**
 * QC: every image this site publishes is declared, with a provenance, in
 * web/src/lib/media.ts.
 *
 * WHY THIS EXISTS
 * /press shipped a screenshot of the Unity editor — hierarchy, inspector, and a
 * console printing internal object names and a local bridge port — captioned as
 * a view of the settlement at runtime. It was published, and the alt text
 * described a picture that did not exist in the file, so a screen-reader user
 * was told about a plaza while everyone else saw an IDE.
 *
 * scripts/verify-no-internals.cjs could not have caught it. That check reads the
 * text of built pages; it cannot see inside a PNG. No amount of pattern
 * matching on HTML would have.
 *
 * The gap is not "we lack an image scanner" — nothing reads pixels for
 * intent. The gap is that an image could reach a page without anyone declaring
 * what it was. So the fix is structural: images enter the site through one
 * manifest, the manifest states provenance, and this check makes the manifest
 * impossible to bypass. What a human reviews is one short file rather than
 * every import in every page.
 *
 * This is a static check by design — it runs on sources, needs no browser, and
 * costs nothing, so it can gate every build rather than a nightly.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "web/src");
const MANIFEST = path.join(SRC, "lib/media.ts");
const FIGURE = path.join(SRC, "components/MediaFigure.astro");

const IMAGE_EXT = /\.(?:png|jpe?g|webp|avif|gif)$/i;

/*
 * Files that must never be registered, with the reason.
 *
 * This list is not a security control — it is a memory. Anything here was
 * looked at by a person and judged unpublishable, and the note says why so the
 * judgement does not have to be made again from scratch (or reversed by
 * someone who only sees a promising filename).
 */
const BLOCKED = {
  "unity-town-runtime-2026-08-23.jpg":
    "a screenshot of the Unity editor, not the game: hierarchy, inspector, and a console showing internal object names and a local bridge port",
};

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? "  [" + detail + "]" : ""}`);
  }
};

/**
 * Removes block and line comments, which also covers the braced block form
 * Astro uses inside templates. Deliberately crude: it exists only to stop prose
 * being read as code, so a false strip inside a string literal costs nothing.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Every file under web/src, so a new page cannot opt out by being new. */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

if (!fs.existsSync(MANIFEST)) {
  console.log(
    `FAIL  media manifest exists  [${path.relative(ROOT, MANIFEST)}]`,
  );
  process.exit(1);
}

const manifestText = fs.readFileSync(MANIFEST, "utf8");
const files = walk(SRC);

/* ------------------------------------------------------------------ *
 * 1. Images enter through the manifest, and only the manifest.
 * ------------------------------------------------------------------ */
{
  const offenders = [];
  for (const f of files) {
    if (f === MANIFEST) continue;
    // Comments are stripped first.
    //
    // This rule is about what a page LOADS, and a filename inside a comment
    // loads nothing. /bestiary documents why it does not use
    // phase1_creature_silhouettes.png, and the first version of this check read
    // that sentence as a violation — which would have forced the page to stop
    // explaining itself in order to pass. An import cannot hide inside a
    // comment, so nothing is lost by ignoring them.
    const text = stripComments(fs.readFileSync(f, "utf8"));
    // Import specifiers and bare string paths alike — a page that reaches for
    // an image file at all is the thing being prevented, however it spells it.
    const re = /["'`]([^"'`\n]*\.(?:png|jpe?g|webp|avif|gif))["'`]/gi;
    let m;
    while ((m = re.exec(text))) {
      offenders.push(`${path.relative(ROOT, f)} → ${m[1]}`);
    }
  }
  ok(
    "no page or component references an image file directly",
    offenders.length === 0,
    offenders.slice(0, 6).join("; "),
  );
}

/* ------------------------------------------------------------------ *
 * 2. astro:assets is used in exactly one place.
 *
 * Rule 1 stops a page importing a file. This stops a page taking an
 * already-imported ImageMetadata and rendering it with its own hand-written
 * alt text, which is precisely how the editor screenshot got its false
 * description.
 * ------------------------------------------------------------------ */
{
  const users = files.filter(
    (f) =>
      f !== MANIFEST &&
      f !== FIGURE &&
      /from\s+["']astro:assets["']/.test(fs.readFileSync(f, "utf8")),
  );
  ok(
    "astro:assets is imported only by MediaFigure.astro",
    users.length === 0,
    users.map((f) => path.relative(ROOT, f)).join(", "),
  );
  ok(
    "MediaFigure.astro exists and imports astro:assets",
    fs.existsSync(FIGURE) &&
      /from\s+["']astro:assets["']/.test(fs.readFileSync(FIGURE, "utf8")),
  );
}

/* ------------------------------------------------------------------ *
 * 3. Every file the manifest imports actually exists.
 * ------------------------------------------------------------------ */
const imported = [];
{
  const re = /^import\s+\w+\s+from\s+["']([^"']+)["'];/gm;
  let m;
  while ((m = re.exec(manifestText))) {
    if (IMAGE_EXT.test(m[1])) imported.push(m[1]);
  }

  ok("the manifest imports at least one image", imported.length > 0);

  for (const spec of imported) {
    const abs = path.resolve(path.dirname(MANIFEST), spec);
    ok(`manifest image exists: ${path.basename(spec)}`, fs.existsSync(abs));
  }
}

/* ------------------------------------------------------------------ *
 * 4. Nothing on the blocklist is registered.
 * ------------------------------------------------------------------ */
for (const [name, why] of Object.entries(BLOCKED)) {
  ok(
    `blocked image is not published: ${name}`,
    !imported.some((s) => path.basename(s) === name),
    why,
  );
}

/* ------------------------------------------------------------------ *
 * 5. Every entry declares a provenance the renderer knows about, and every
 *    non-placeholder entry carries real alt text.
 *
 * Parsed from the source rather than imported, because importing a TypeScript
 * module that pulls in `astro:assets` types needs the Astro toolchain; a
 * structural read of the literal is enough to catch an entry someone added in
 * a hurry, which is the failure mode this is for.
 * ------------------------------------------------------------------ */
{
  const KINDS = new Set(["capture", "concept", "art", "placeholder"]);
  const entries = manifestText
    .split(/\n\s*"[a-z0-9-]+":\s*\{/)
    .slice(1)
    .map((chunk) => chunk.split(/\n\s*\},?\s*\n/)[0]);

  ok("the manifest declares at least two entries", entries.length >= 2);

  let bad = [];
  for (const e of entries) {
    const kind = (e.match(/kind:\s*"([a-z]+)"/) || [])[1];
    const alt = (e.match(/alt:\s*"((?:[^"\\]|\\.)*)"/) || [])[1];
    const cap = (e.match(/caption:\s*"((?:[^"\\]|\\.)*)"/) || [])[1];
    const id = (e.match(/id:\s*"([a-z0-9-]+)"/) || [])[1] || "?";

    if (!kind || !KINDS.has(kind)) bad.push(`${id}: kind`);
    else if (kind !== "placeholder" && (!alt || alt.length < 20))
      bad.push(`${id}: alt too short`);
    if (!cap) bad.push(`${id}: caption`);
    if (
      kind &&
      kind !== "placeholder" &&
      !/dated:\s*"\d{4}-\d{2}-\d{2}"/.test(e)
    )
      bad.push(`${id}: dated`);
  }
  ok(
    "every entry declares kind, caption, alt and date",
    bad.length === 0,
    bad.join("; "),
  );
}

/* ------------------------------------------------------------------ *
 * 6. The provenance badge cannot be silently dropped.
 *
 * The whole value of declaring `concept` is that a visitor sees it. If the
 * figure ever stops rendering the label, the declaration becomes an internal
 * note and the site is back to publishing concept art as though it were the
 * game.
 * ------------------------------------------------------------------ */
if (fs.existsSync(FIGURE)) {
  const fig = fs.readFileSync(FIGURE, "utf8");
  ok(
    "MediaFigure renders the provenance label",
    /provenanceLabel\[item\.kind\]/.test(fig),
  );
  ok(
    "MediaFigure renders the provenance note for assistive tech",
    /provenanceNote\[item\.kind\]/.test(fig),
  );

  /*
   * A placeholder's reserved height comes from a stylesheet rule keyed on its
   * ratio, because the content security policy forbids the inline style
   * attribute that would otherwise carry it. A ratio with no rule renders as a
   * zero-height box that grows when real footage lands — the layout shift the
   * slot exists to prevent, arriving at exactly the moment nobody re-tests.
   */
  const ratios = [...manifestText.matchAll(/ratio:\s*"([^"]+)"/g)].map(
    (m) => m[1],
  );
  const unstyled = ratios.filter(
    (r) => !fig.includes(`.media__slot[data-ratio="${r}"]`),
  );
  ok(
    "every placeholder ratio has a stylesheet rule",
    unstyled.length === 0,
    unstyled.join(", "),
  );
  ok("no placeholder uses an inline style attribute", !/style=\{/.test(fig));
}

/* ------------------------------------------------------------------ *
 * 7. Built pages: every <img> has alt.
 *
 * Cheap, and it covers images that arrive by a route this file has not thought
 * of. Skipped when there is no build, so this check still runs usefully on a
 * bare checkout.
 * ------------------------------------------------------------------ */
{
  const DIST = path.join(ROOT, "web/dist");
  if (!fs.existsSync(DIST)) {
    console.log("SKIP  built <img> alt audit: web/dist not built.");
  } else {
    const html = walk(DIST).filter((f) => f.endsWith(".html"));
    const missing = [];
    for (const f of html) {
      const text = fs.readFileSync(f, "utf8");
      for (const tag of text.match(/<img\b[^>]*>/gi) || []) {
        if (!/\salt=/.test(tag)) missing.push(path.relative(DIST, f));
      }
    }
    ok(
      "every <img> in the build has an alt attribute",
      missing.length === 0,
      [...new Set(missing)].slice(0, 6).join(", "),
    );
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
