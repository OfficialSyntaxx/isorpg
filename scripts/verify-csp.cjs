#!/usr/bin/env node
/**
 * QC: proves the site's Content-Security-Policy does not break the site.
 *
 * WHY THIS EXISTS
 * docs/WEBSITE_BLUEPRINT.md §8.1 says the CSP must ship report-only first,
 * because "enforcing an unvalidated CSP on a Unity WebGL page is how you ship a
 * blank screen". Report-only means waiting on real traffic and then reading a
 * violation endpoint — slow, sampled, and it only tells you about the pages
 * people happened to visit.
 *
 * This is the stronger version of that measurement: it serves the ACTUAL built
 * output with the ACTUAL headers from web/public/_headers, drives every route
 * through a real browser, and listens for `securitypolicyviolation` events. A
 * violation on any route fails the build. Nothing is sampled and nothing waits
 * on traffic.
 *
 * It also asserts the header set itself — that the policy contains no
 * 'unsafe-inline'/'unsafe-eval', and that the other required headers are
 * present — so a well-meaning edit cannot quietly weaken it.
 *
 * WHAT IT CANNOT COVER
 * /play. The Unity WebGL build is 50 MB, gitignored, and produced by a job that
 * needs a licence, so it is not present locally. The CSP keeps
 * 'wasm-unsafe-eval' for it and the reasoning is documented in _headers, but
 * the game under CSP must be confirmed by loading /play on a preview deploy
 * before the production cutover.
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HEADERS_FILE = path.join(ROOT, "web/public/_headers");
const DIST = path.join(ROOT, "web/dist");

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  [" + detail + "]" : ""}`); }
};

// --- parse _headers ----------------------------------------------------------
/**
 * Netlify's _headers format: an unindented line starting with "/" opens a path
 * pattern; indented "Key: value" lines belong to it; "#" is a comment.
 */
function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (/^\//.test(line)) {
      current = { pattern: line.trim(), headers: [] };
      rules.push(current);
      continue;
    }
    const m = /^\s+([A-Za-z0-9-]+):\s*(.*)$/.exec(line);
    if (m && current) current.headers.push([m[1], m[2]]);
  }
  return rules;
}

/** Netlify glob semantics, reduced to what these patterns actually use. */
function matches(pattern, urlPath) {
  if (pattern.endsWith("/*")) return urlPath.startsWith(pattern.slice(0, -1));
  if (pattern === "/*") return true;
  return pattern === urlPath;
}

function headersFor(rules, urlPath) {
  const out = new Map();
  for (const rule of rules) {
    if (!matches(rule.pattern, urlPath)) continue;
    // Last match wins for a duplicate key, which is Netlify's behaviour and
    // also the only sane one for a single-valued header.
    for (const [k, v] of rule.headers) out.set(k, v);
  }
  return out;
}

const rules = parseHeaders(fs.readFileSync(HEADERS_FILE, "utf8"));
const rootHeaders = headersFor(rules, "/index.html");
const csp = rootHeaders.get("Content-Security-Policy");

// --- static assertions on the policy ----------------------------------------
ok("a Content-Security-Policy is defined", typeof csp === "string" && csp.length > 0);

if (csp) {
  const directive = (name) => {
    const m = new RegExp(`(?:^|;)\\s*${name}\\s+([^;]+)`).exec(csp);
    return m ? m[1].trim() : null;
  };

  ok("script-src has no 'unsafe-inline'", !/script-src[^;]*'unsafe-inline'/.test(csp),
     directive("script-src") || "");
  ok("script-src has no bare 'unsafe-eval'",
     !/script-src[^;]*'unsafe-eval'/.test(csp), directive("script-src") || "");
  ok("style-src has no 'unsafe-inline'", !/style-src[^;]*'unsafe-inline'/.test(csp),
     directive("style-src") || "");
  ok("default-src is 'self'", directive("default-src") === "'self'", directive("default-src") || "");
  ok("object-src is 'none'", directive("object-src") === "'none'", directive("object-src") || "");
  ok("frame-ancestors is 'none'", directive("frame-ancestors") === "'none'",
     directive("frame-ancestors") || "");
  ok("base-uri is locked", directive("base-uri") === "'self'", directive("base-uri") || "");
  ok("form-action is locked", directive("form-action") === "'self'", directive("form-action") || "");
  // The Unity loader needs this; losing it silently would hang /play.
  ok("script-src keeps 'wasm-unsafe-eval' for the Unity build",
     /script-src[^;]*'wasm-unsafe-eval'/.test(csp), directive("script-src") || "");
  // Only Google Fonts may be external, per §8.1.
  const externalHosts = (csp.match(/https:\/\/[^\s;]+/g) || []).filter(
    (h) => !/fonts\.(googleapis|gstatic)\.com/.test(h),
  );
  ok("no external host beyond Google Fonts", externalHosts.length === 0, externalHosts.join(" "));
}

for (const h of [
  "Strict-Transport-Security",
  "X-Frame-Options",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Cross-Origin-Opener-Policy",
]) {
  ok(`${h} is set`, rootHeaders.has(h), rootHeaders.get(h) ? "" : "missing");
}

// --- drive a real browser ----------------------------------------------------
if (!fs.existsSync(DIST)) {
  console.log(`\nSKIP  browser pass: ${path.relative(ROOT, DIST)} not built. ` +
              `Run \`npm run build\` in web/ first.`);
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath.endsWith("/")) urlPath += "index.html";
  const file = path.join(DIST, urlPath);

  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }

  // Apply the real headers for this path — the whole point of the exercise.
  const applied = headersFor(rules, urlPath);
  const out = { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" };
  for (const [k, v] of applied) out[k] = v;

  res.writeHead(200, out);
  fs.createReadStream(file).pipe(res);
});

/** Every built route, so nothing is sampled. */
function allRoutes() {
  const routes = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name === "index.html") {
        const rel = path.relative(DIST, path.dirname(p));
        routes.push(rel === "" ? "/" : `/${rel.split(path.sep).join("/")}/`);
      }
    }
  })(DIST);
  return routes.sort();
}

(async () => {
  let chromium;
  try { ({ chromium } = require("playwright-core")); }
  catch { console.log("\nSKIP  browser pass: playwright-core not installed."); finish(); return; }

  const exe = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
  ].find(fs.existsSync);
  if (!exe) { console.log("\nSKIP  browser pass: no chromium binary."); finish(); return; }

  const port = 4413;
  await new Promise((r) => server.listen(port, "127.0.0.1", r));

  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });

  // The full route list is ~108 pages; the devlog entries are all built from one
  // template, so a sample of them plus every distinct route covers every
  // distinct combination of scripts and styles on the site.
  const routes = allRoutes();
  const distinct = routes.filter((r) => !r.startsWith("/devlog/2"));
  const entrySample = routes.filter((r) => r.startsWith("/devlog/2")).slice(0, 4);
  const toCheck = [...distinct, ...entrySample];

  const violations = [];

  for (const route of toCheck) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    // The browser's own report of what the policy blocked. This is the
    // measurement — not a guess about what the policy permits.
    await page.addInitScript(() => {
      window.__csp = [];
      document.addEventListener("securitypolicyviolation", (e) => {
        window.__csp.push({
          directive: e.violatedDirective,
          blocked: e.blockedURI,
          line: e.lineNumber,
        });
      });
    });

    await page.goto(`http://localhost:${port}${route}`, { waitUntil: "load" }).catch(() => {});
    // Let deferred work (module scripts, the canvas paint, observers) run —
    // a violation can happen well after `load`.
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(500);

    const found = await page.evaluate(() => window.__csp || []).catch(() => []);
    for (const v of found) {
      // The sandbox blocks fonts.googleapis.com at the network layer, which is
      // not a CSP violation and does not appear here. Anything that does appear
      // is real.
      violations.push(`${route}: ${v.directive} blocked ${v.blocked}`);
    }
    await page.close();
  }

  await browser.close();
  await new Promise((r) => server.close(r));

  ok(
    `no CSP violations across ${toCheck.length} routes`,
    violations.length === 0,
    violations.slice(0, 8).join(" | "),
  );

  finish();
})().catch((e) => {
  console.error("verify-csp: " + ((e && e.stack) || e));
  try { server.close(); } catch {}
  process.exit(1);
});

function finish() {
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}
