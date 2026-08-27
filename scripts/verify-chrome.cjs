#!/usr/bin/env node
/**
 * QC: asserts the site's persistent chrome does not eat the viewport.
 *
 * WHY THIS EXISTS
 * The sticky header shipped 208px tall on a phone — a quarter of the screen,
 * on every page, permanently. It happened because the nav sat in a
 * `flex-wrap: wrap` row with no room, so each link wrapped onto its own line.
 *
 * Every automated check in this repo missed it. They measured HORIZONTAL
 * overflow, page structure, contrast and CSP; none of them measured how much
 * vertical space the chrome costs. It took a screenshot from a real phone.
 *
 * So this measures the thing that was missed. It is deliberately about layout
 * cost rather than appearance: a header that grows silently is a regression
 * nobody notices in a desktop browser.
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "web/dist");

// A phone viewport is 844px tall. 130px at rest is two comfortable rows; 80px
// once condensed. Past that the chrome is taking the content's space.
const MAX_AT_REST = 130;
const MAX_CONDENSED = 80;
const MOBILE_WIDTHS = [360, 390, 430];

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  [" + detail + "]" : ""}`); }
};

if (!fs.existsSync(DIST)) {
  console.log(`SKIP  chrome: ${path.relative(ROOT, DIST)} not built.`);
  process.exit(0);
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath.endsWith("/")) urlPath += "index.html";
  const file = path.join(DIST, urlPath);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("not found"); return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const headerHeight = (page) =>
  page.evaluate(() => {
    const h = document.querySelector(".site-header");
    return h ? Math.round(h.getBoundingClientRect().height) : -1;
  });

(async () => {
  let chromium;
  try { ({ chromium } = require("playwright-core")); }
  catch { console.log("SKIP  chrome: playwright-core not installed."); finish(); return; }

  const exe = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
  ].find(fs.existsSync);
  if (!exe) { console.log("SKIP  chrome: no chromium binary."); finish(); return; }

  const port = 4417;
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });

  const routes = ["/", "/features/", "/wiki/", "/devlog/"];

  for (const width of MOBILE_WIDTHS) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(`http://localhost:${port}${route}`, { waitUntil: "load" });
      await page.waitForTimeout(250);

      const atRest = await headerHeight(page);
      ok(
        `${route} @${width}: header <= ${MAX_AT_REST}px at rest`,
        atRest > 0 && atRest <= MAX_AT_REST,
        `${atRest}px (${Math.round((atRest / 844) * 100)}% of a phone screen)`,
      );

      // Scroll down far enough to pass the condense and hide-nav thresholds.
      await page.evaluate(() => window.scrollTo(0, 700));
      await page.waitForTimeout(500);
      const condensed = await headerHeight(page);
      ok(
        `${route} @${width}: header <= ${MAX_CONDENSED}px while scrolling`,
        condensed > 0 && condensed <= MAX_CONDENSED,
        `${condensed}px`,
      );

      // And the nav must come back — collapsing it permanently would be worse
      // than the bug this replaces.
      await page.evaluate(() => window.scrollTo(0, 200));
      await page.waitForTimeout(500);
      const restored = await headerHeight(page);
      ok(
        `${route} @${width}: nav returns on scroll up`,
        restored > condensed,
        `${condensed}px -> ${restored}px`,
      );

      await page.close();
    }
  }

  // The specific mechanism that failed: the nav must never wrap.
  {
    const page = await browser.newPage({ viewport: { width: 360, height: 844 } });
    await page.goto(`http://localhost:${port}/`, { waitUntil: "load" });
    await page.waitForTimeout(200);
    const nav = await page.evaluate(() => {
      const n = document.querySelector(".site-header__nav");
      if (!n) return null;
      const cs = getComputedStyle(n);
      const links = Array.from(n.querySelectorAll("a"));
      // Distinct vertical offsets means the links are on more than one line.
      const rows = new Set(links.map((a) => Math.round(a.getBoundingClientRect().top)));
      return { wrap: cs.flexWrap, rows: rows.size, links: links.length };
    });
    ok("header nav does not wrap", nav !== null && nav.wrap === "nowrap", nav ? nav.wrap : "no nav");
    ok(
      "header nav links sit on ONE row",
      nav !== null && nav.rows === 1,
      nav ? `${nav.rows} rows for ${nav.links} links` : "",
    );
    await page.close();
  }

  // Anchor jumps must clear the sticky header. The wiki's contents list is the
  // reason: 51 links that would otherwise land underneath it.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://localhost:${port}/wiki/`, { waitUntil: "load" });
    await page.waitForTimeout(300);
    const result = await page.evaluate(async () => {
      const link = document.querySelector(".toc a[href^='#']");
      if (!link) return { ok: false, why: "no toc link" };
      const id = link.getAttribute("href").slice(1);
      const target = document.getElementById(id);
      if (!target) return { ok: false, why: "toc target missing" };
      target.scrollIntoView();
      await new Promise((r) => setTimeout(r, 400));
      const header = document.querySelector(".site-header");
      const hb = header.getBoundingClientRect();
      const tb = target.getBoundingClientRect();
      return { ok: tb.top >= hb.bottom - 1, headerBottom: Math.round(hb.bottom), targetTop: Math.round(tb.top) };
    });
    ok(
      "an in-page anchor lands below the sticky header",
      result.ok === true,
      result.why || `target top ${result.targetTop}px vs header bottom ${result.headerBottom}px`,
    );
    await page.close();
  }

  await browser.close();
  await new Promise((r) => server.close(r));
  finish();
})().catch((e) => {
  console.error("verify-chrome: " + ((e && e.stack) || e));
  try { server.close(); } catch {}
  process.exit(1);
});

function finish() {
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}
