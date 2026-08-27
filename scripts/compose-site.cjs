#!/usr/bin/env node
/**
 * Composes the landing site and the Unity WebGL build into ONE publish
 * directory, so that `netlify deploy --dir` can put the marketing site at the
 * root and the game at /play in a single atomic deploy.
 *
 * WHY THIS EXISTS
 * Netlify's `--dir` deploy replaces the entire site every time. There is no
 * "add a page". So the moment the site root stops being the Unity build, every
 * deploy — landing-only or game-only — has to publish the full composed tree,
 * or it wipes the other half. That is the single highest-severity risk in
 * docs/WEBSITE_BLUEPRINT.md, and this script is the mitigation.
 *
 * WHY IT REWRITES _headers RATHER THAN THE UNITY TEMPLATE
 * The template's _headers anchors its rules at the root:
 *
 *     /Build/*.wasm.br
 *       Content-Type: application/wasm
 *       Content-Encoding: br
 *
 * That resolves today only because the Unity build IS the site root. Serve it
 * from /play/ and every rule silently stops matching, the wasm goes out with no
 * Content-Encoding, and the loader dies on "Unable to parse" or hangs at 90% —
 * the exact failure UPDATES.md records for 2026-08-26.
 *
 * The blueprint originally proposed parameterising the template with a macro.
 * Doing it here instead is strictly better:
 *   - No C# change, so no Unity licence and no 30-minute build to test it.
 *   - The Unity build stays independently deployable at the root, which keeps
 *     the pre-cutover rollback path (blueprint §2.5) working unchanged.
 *   - One place owns the prefixing, and scripts/verify-compose.cjs can prove it
 *     against the real template on every push.
 *
 * Netlify also reads ONLY the root _headers. A second one at play/_headers is
 * not merged — it is ignored and served as a public text file. So the game's
 * rules are folded into the root file and the nested copy is deleted.
 *
 * Usage:
 *   node scripts/compose-site.cjs
 *   node scripts/compose-site.cjs --site web/dist --game unity/WebGLBuild \
 *                                 --out dist-site --prefix play
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

// --- arguments ---------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    site: "web/dist",
    game: "unity/WebGLBuild",
    out: "dist-site",
    prefix: "play",
    allowNoGame: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--allow-no-game") { opts.allowNoGame = true; continue; }
    const m = /^--(site|game|out|prefix)$/.exec(a);
    if (m) {
      const v = argv[++i];
      if (v === undefined) fatal(`${a} needs a value`);
      opts[m[1]] = v;
      continue;
    }
    fatal(`unknown argument: ${a}`);
  }
  // A prefix is a single path segment. Anything else ("/play", "play/",
  // "a/b") makes the header rewrite below ambiguous, so reject it early
  // rather than emitting subtly wrong rules.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(opts.prefix)) {
    fatal(`--prefix must be one lowercase path segment, got "${opts.prefix}"`);
  }
  return opts;
}

function fatal(msg) {
  console.error(`compose-site: ${msg}`);
  process.exit(1);
}

const abs = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));

// --- input validation --------------------------------------------------------
/**
 * Refuses to compose a tree that would ship a broken site. Every check here
 * corresponds to a way a deploy has gone wrong or could go wrong silently:
 * a missing game directory (expired CI artifact) would publish a landing page
 * with no /play and take the game offline, reported as a successful deploy.
 */
function validateInputs(opts) {
  const siteDir = abs(opts.site);
  const gameDir = abs(opts.game);

  if (!fs.existsSync(siteDir)) fatal(`site directory not found: ${opts.site}`);
  if (!fs.existsSync(path.join(siteDir, "index.html"))) {
    fatal(`site directory has no index.html: ${opts.site}`);
  }

  const hasGame = fs.existsSync(gameDir);
  if (!hasGame) {
    if (!opts.allowNoGame) {
      fatal(
        `game directory not found: ${opts.game}\n` +
        `  Publishing without it would take ${opts.prefix}/ offline. If that is\n` +
        `  genuinely what you want, pass --allow-no-game.`
      );
    }
    console.warn(`compose-site: WARNING composing with no game — /${opts.prefix} will 404`);
    return { siteDir, gameDir, hasGame: false };
  }

  if (!fs.existsSync(path.join(gameDir, "index.html"))) {
    fatal(`game directory has no index.html: ${opts.game}`);
  }
  const buildDir = path.join(gameDir, "Build");
  if (!fs.existsSync(buildDir)) fatal(`game directory has no Build/: ${opts.game}`);
  const payload = fs.readdirSync(buildDir).filter((f) => /\.(wasm|data)\.(br|gz)$/.test(f));
  if (payload.length === 0) {
    fatal(
      `game Build/ contains no compressed wasm/data payload: ${opts.game}/Build\n` +
      `  An uncompressed build needs different _headers rules than the ones\n` +
      `  this script rewrites, so refusing rather than shipping a dead loader.`
    );
  }
  return { siteDir, gameDir, hasGame: true };
}

// --- _headers handling -------------------------------------------------------
/**
 * Rewrites root-anchored path patterns in a Netlify _headers file so they match
 * the game's new mount point.
 *
 * Netlify's format: an unindented line beginning with "/" opens a path pattern;
 * indented lines below it are that pattern's headers; "#" opens a comment.
 * Only the pattern lines move.
 */
function prefixHeaderRules(source, prefix) {
  const out = [];
  let rewritten = 0;
  for (const line of source.split("\n")) {
    // Pattern lines are unindented and start with "/". Header lines are
    // indented, so a leading-whitespace test is enough to tell them apart.
    if (/^\/\S*\s*$/.test(line)) {
      out.push(`/${prefix}${line.trimEnd()}`);
      rewritten++;
    } else {
      out.push(line);
    }
  }
  return { text: out.join("\n"), rewritten };
}

/**
 * Builds the single root _headers.
 *
 * Order matters. Netlify applies every matching rule and, where two rules set
 * the same header, the LAST match wins. The site's broad "/*" rules therefore
 * go first and the game's specific "/play/..." rules after, so the game keeps
 * its own Cache-Control and Content-Encoding where the two overlap.
 */
function mergeHeaders({ siteHeaders, gameHeaders, prefix }) {
  const parts = [];
  parts.push(
    "# GENERATED by scripts/compose-site.cjs — do not edit by hand.",
    "#",
    "# Netlify reads only the _headers at the publish root, so the landing",
    "# site's rules and the Unity build's rules have to live in one file. The",
    "# game's rules below were rewritten from root-anchored paths to",
    `# /${prefix}/... — without that rewrite the wasm ships with no`,
    "# Content-Encoding and the Unity loader dies. See docs/WEBSITE_BLUEPRINT.md §2.3.",
    ""
  );

  if (siteHeaders !== null) {
    parts.push("# ---- landing site ----------------------------------------------------", "");
    parts.push(siteHeaders.trimEnd(), "");
  }

  if (gameHeaders !== null) {
    parts.push(`# ---- game, mounted at /${prefix} -------------------------------------`, "");
    parts.push(gameHeaders.trimEnd(), "");
  }

  return parts.join("\n");
}

// --- CSP hashes for the game's inline blocks ---------------------------------
/**
 * The Unity WebGL template is not ours to restructure the way the Astro site
 * was: it ships one inline <script> and one inline <style>, and Unity's loader
 * depends on them. Under `script-src 'self'` the browser blocks both and the
 * game never starts — verified, not assumed: the first run of
 * verify-deployed-play.cjs caught exactly this, with "script-src-elem blocked
 * inline" and a progress bar that never advanced.
 *
 * So those two blocks are allowed by sha256 hash.
 *
 * WHY THIS IS NOT THE STALE-HASH FOOTGUN THE SITE AVOIDS ELSEWHERE
 * The site's own scripts are external precisely so no hash has to be
 * maintained. These hashes are different in kind: they are computed HERE, at
 * compose time, from the exact bytes about to be deployed, in the same step
 * that deploys them. They cannot drift, because there is no interval during
 * which they could. The template's inline script even embeds __BUILD_ID__, so
 * its hash genuinely changes every build — a hand-written hash would be wrong
 * immediately, and a generated one is right by construction.
 *
 * One policy still covers the whole site (see _headers): a hash is additive and
 * harmless on pages that have no inline blocks, which avoids the two-policy
 * intersection hazard that would silently re-break the loader.
 */
function inlineHashes(html) {
  const sha = (content) =>
    `'sha256-${crypto.createHash("sha256").update(content, "utf8").digest("base64")}'`;

  const scripts = [];
  const styles = [];

  // Inline only: a <script src=...> is covered by 'self'.
  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (m[1].trim() !== "") scripts.push(sha(m[1]));
  }
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (m[1].trim() !== "") styles.push(sha(m[1]));
  }

  return { scripts: [...new Set(scripts)], styles: [...new Set(styles)] };
}

/** Adds the hashes to script-src and style-src of an existing CSP header. */
function injectCspHashes(headersText, { scripts, styles }) {
  if (scripts.length === 0 && styles.length === 0) return headersText;

  let touched = false;
  const out = headersText.replace(
    /^(\s*Content-Security-Policy:\s*)(.+)$/gim,
    (_full, prefix, policy) => {
      touched = true;
      let p = policy;
      if (scripts.length > 0) {
        p = p.replace(/script-src ([^;]+)/i, (_m, v) => `script-src ${v.trim()} ${scripts.join(" ")}`);
      }
      if (styles.length > 0) {
        p = p.replace(/style-src ([^;]+)/i, (_m, v) => `style-src ${v.trim()} ${styles.join(" ")}`);
      }
      return prefix + p;
    },
  );

  if (!touched) {
    fatal(
      "the game has inline <script>/<style> blocks but the landing site's " +
        "_headers declares no Content-Security-Policy to add their hashes to.\n" +
        "  Publishing would either block the loader (if a CSP appears later) or " +
        "ship the game with no policy at all.",
    );
  }
  return out;
}

// --- copying -----------------------------------------------------------------
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(src), dst);
    else fs.copyFileSync(src, dst);
  }
}

function countFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
    else n++;
  }
  return n;
}

// --- main --------------------------------------------------------------------
function compose(argv) {
  const opts = parseArgs(argv);
  const { siteDir, gameDir, hasGame } = validateInputs(opts);
  const outDir = abs(opts.out);

  // A stale composed tree is worse than none: it can carry a previous build's
  // Build/* files alongside the new ones, and the service worker would then
  // have two candidate payloads under one build id.
  fs.rmSync(outDir, { recursive: true, force: true });

  copyTree(siteDir, outDir);

  // The landing site's own _headers is consumed into the merged file, not
  // shipped as-is, so pull it out of the copied tree.
  const siteHeadersPath = path.join(outDir, "_headers");
  let siteHeaders = null;
  if (fs.existsSync(siteHeadersPath)) {
    siteHeaders = fs.readFileSync(siteHeadersPath, "utf8");
    fs.rmSync(siteHeadersPath);
  }

  let gameHeaders = null;
  let rewritten = 0;
  let cspHashes = { scripts: [], styles: [] };
  if (hasGame) {
    const mount = path.join(outDir, opts.prefix);
    if (fs.existsSync(mount)) {
      fatal(
        `the landing site already contains a "${opts.prefix}/" directory.\n` +
        `  Composing would overwrite it. Rename the site's directory or pass a\n` +
        `  different --prefix.`
      );
    }
    copyTree(gameDir, mount);

    const nested = path.join(mount, "_headers");
    if (fs.existsSync(nested)) {
      const raw = fs.readFileSync(nested, "utf8");
      const res = prefixHeaderRules(raw, opts.prefix);
      gameHeaders = res.text;
      rewritten = res.rewritten;
      // Delete it: Netlify ignores nested _headers files and would otherwise
      // serve this one as a public text file.
      fs.rmSync(nested);
    } else {
      fatal(
        `game build has no _headers: ${opts.game}/_headers\n` +
        `  IsoperiaBuild.cs lists it as a required template file, so a build\n` +
        `  without it is broken. Refusing to publish a game with no\n` +
        `  Content-Encoding rules.`
      );
    }

    // The game's inline blocks must be hashed into the site's CSP, or the
    // loader is blocked and the page hangs on the progress bar.
    const gameIndex = path.join(mount, "index.html");
    if (fs.existsSync(gameIndex) && siteHeaders !== null) {
      const hashes = inlineHashes(fs.readFileSync(gameIndex, "utf8"));
      cspHashes = hashes;
      siteHeaders = injectCspHashes(siteHeaders, hashes);
    }

    // vercel.json ships in the Unity template for a host we do not use. It is
    // dead weight at the root of a Netlify deploy and its rules would confuse
    // anyone reading the tree.
    const vercel = path.join(mount, "vercel.json");
    if (fs.existsSync(vercel)) fs.rmSync(vercel);
  }

  fs.writeFileSync(
    path.join(outDir, "_headers"),
    mergeHeaders({ siteHeaders, gameHeaders, prefix: opts.prefix })
  );

  const summary = {
    out: path.relative(ROOT, outDir),
    files: countFiles(outDir),
    game: hasGame ? `/${opts.prefix}` : "ABSENT",
    headerRulesRewritten: rewritten,
    cspScriptHashes: cspHashes.scripts.length,
    cspStyleHashes: cspHashes.styles.length,
  };
  console.log("compose-site: composed publish directory");
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`);
  return summary;
}

if (require.main === module) compose(process.argv.slice(2));

module.exports = { compose, prefixHeaderRules, mergeHeaders, inlineHashes, injectCspHashes };
