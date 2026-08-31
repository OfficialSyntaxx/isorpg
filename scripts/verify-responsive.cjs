#!/usr/bin/env node
/**
 * QC: no page scrolls sideways, at any width, on any route.
 *
 * WHY THIS EXISTS
 * Phase 4 recorded "responsive 360 → 1920, verified at six widths: zero
 * horizontal overflow at every one". That was true when it was written and
 * nothing re-checked it afterwards, which is the same shape as the nav that
 * silently hid four links while a height check went on passing.
 *
 * It caught its first bug immediately. /quests hand-wrote `.table-wrap` around
 * a clue table, but the stylesheet scoped that rule to `.prose .table-wrap` —
 * so outside prose it was a div with a class and no behaviour, and a 457px
 * table sat in a 360px viewport pushing the whole page 115px sideways. A
 * horizontally scrolling page on a phone is among the most obvious defects
 * there is, and it shipped through ten green checks.
 *
 * WHY THE CULPRIT SEARCH SKIPS SCROLL CONTAINERS
 * An element inside `overflow-x: auto` is *supposed* to extend past the
 * viewport. Reporting those named the header nav as the cause of the /quests
 * overflow — sending the first diagnosis to the wrong file entirely — when the
 * nav was behaving correctly and a table was not. Only elements with no
 * scrollable ancestor can actually widen the page.
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { requireBrowser } = require("./lib/browser.cjs");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "web", "dist");

/** One route per template. The eight devlog entries share one, so one stands in. */
const ROUTES = [
  "/",
  "/features/",
  "/world/",
  "/bestiary/",
  "/items/",
  "/items/bronze_bar/",
  "/quests/",
  "/devlog/",
  "/wiki/",
  "/save/",
  "/press/",
  "/roadmap/",
  "/legal/privacy/",
  "/404.html",
];
/** 360 is the narrowest phone worth supporting; 1920 the widest common desktop. */
const WIDTHS = [360, 390, 768, 1280, 1920];

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".xml": "application/xml",
  ".json": "application/json",
  ".txt": "text/plain",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split("?")[0]);
  if (u.endsWith("/")) u += "index.html";
  const file = path.join(DIST, u);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
  });
  fs.createReadStream(file).pipe(res);
});

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
  }
}

(async () => {
  if (!fs.existsSync(DIST)) {
    console.log("FAIL  the site is built");
    process.exit(1);
  }
  const { chromium, executablePath } = requireBrowser("chrome");
  const port = 4461;
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });

  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 100)));
      await page.goto(`http://localhost:${port}${route}`, { waitUntil: "load" });
      await page.waitForTimeout(1200);

      const r = await page.evaluate(() => {
        const de = document.documentElement;
        const vw = de.clientWidth;
        const inScroller = (el) => {
          for (let n = el.parentElement; n; n = n.parentElement) {
            const o = getComputedStyle(n).overflowX;
            if (o === "auto" || o === "scroll" || o === "hidden") return true;
          }
          return false;
        };
        const culprits = [];
        if (de.scrollWidth - vw > 1) {
          for (const el of document.querySelectorAll("body *")) {
            const b = el.getBoundingClientRect();
            if (b.width > 0 && b.right > vw + 1 && !inScroller(el)) {
              const cls =
                typeof el.className === "string" && el.className.trim()
                  ? "." + el.className.trim().split(/\s+/)[0]
                  : "";
              culprits.push(`${el.tagName.toLowerCase()}${cls} w=${Math.round(b.width)}`);
              if (culprits.length >= 3) break;
            }
          }
        }
        const broken = [...document.querySelectorAll("img")]
          .filter((i) => i.complete && i.naturalWidth === 0)
          .map((i) => (i.currentSrc || i.src).split("/").pop());
        return { over: de.scrollWidth - vw, culprits, broken };
      });

      ok(`${route} @${width}: no horizontal overflow`, r.over <= 1, `${r.over}px — ${r.culprits.join(" | ")}`);
      ok(`${route} @${width}: every image loaded`, r.broken.length === 0, r.broken.slice(0, 3).join(", "));
      ok(`${route} @${width}: no uncaught errors`, errors.length === 0, errors[0]);
      await page.close();
    }
  }

  await browser.close();
  await new Promise((r) => server.close(r));
  console.log(`\n${pass}/${pass + failures.length} passed`);
  process.exit(failures.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error("verify-responsive: " + ((e && e.stack) || e));
  process.exit(1);
});
