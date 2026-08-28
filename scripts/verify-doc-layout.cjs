#!/usr/bin/env node
/**
 * QC: asserts a long document page's contents list never paints on top of its
 * prose.
 *
 * WHY THIS EXISTS
 * /wiki and /roadmap shipped with their table of contents overlapping the
 * document body on a phone: two complete layers of text drawn in the same
 * space, unreadable, on every scroll position past the top of the page. A real
 * device screenshot caught it. Nothing in CI did.
 *
 * The cause was `position: sticky` declared on `.toc` unconditionally. The
 * sidebar layout it was written for only exists at 64rem and up; below that the
 * TOC is a full-width block in a single column, and Chrome lets a sticky grid
 * item travel past its own grid area, so it pins itself over the prose
 * scrolling underneath. The fix is that sticky belongs inside the media query
 * that creates the sidebar.
 *
 * A NOTE ON MEASURING THIS, because the first version of this check passed
 * against the broken build and nearly certified the bug as fixed:
 * `html { scroll-behavior: smooth }` makes `window.scrollTo` animate. Reading
 * rectangles a hundred milliseconds later measures a page that has barely
 * moved, and an unscrolled page has no overlap. The scroll behaviour is forced
 * to `auto` below and the check waits for `scrollY` to actually arrive. Without
 * those two lines this file is decoration.
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { requireBrowser } = require("./lib/browser.cjs");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "web/dist");

const ROUTES = ["/wiki/", "/roadmap/"];
const WIDTHS = [360, 390, 430, 1280];
const SCROLLS = [0, 600, 1400, 2600];

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

if (!fs.existsSync(DIST)) {
  console.log(`SKIP  doc-layout: ${path.relative(ROOT, DIST)} not built.`);
  process.exit(0);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".avif": "image/avif",
  ".xml": "application/xml",
  ".txt": "text/plain",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath.endsWith("/")) urlPath += "index.html";
  const file = path.join(DIST, urlPath);
  if (
    !file.startsWith(DIST) ||
    !fs.existsSync(file) ||
    fs.statSync(file).isDirectory()
  ) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
  });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  const { chromium, executablePath } = requireBrowser("doc-layout");

  const port = 4419;
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox"],
  });

  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto(`http://localhost:${port}${route}`, {
        waitUntil: "load",
      });
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        document.documentElement.style.scrollBehavior = "auto";
      });

      let worst = 0;
      let worstAt = 0;
      for (const y of SCROLLS) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await page
          .waitForFunction(
            (yy) => {
              const max =
                document.documentElement.scrollHeight - window.innerHeight;
              return (
                Math.abs(window.scrollY - Math.min(yy, Math.max(0, max))) < 2
              );
            },
            y,
            { timeout: 5000 },
          )
          .catch(() => {});
        await page.waitForTimeout(60);

        const area = await page.evaluate(() => {
          const toc = document.querySelector(".toc");
          const prose = document.querySelector(".prose");
          if (!toc || !prose) return -1;
          const a = toc.getBoundingClientRect();
          const b = prose.getBoundingClientRect();
          const x = Math.max(
            0,
            Math.min(a.right, b.right) - Math.max(a.left, b.left),
          );
          const yy = Math.max(
            0,
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
          );
          return Math.round(x * yy);
        });

        if (area < 0) {
          worst = -1;
          break;
        }
        if (area > worst) {
          worst = area;
          worstAt = y;
        }
      }

      if (worst < 0) {
        ok(
          `${route} @${width}: has a contents list and a body`,
          false,
          "selector missing",
        );
      } else {
        ok(
          `${route} @${width}: contents never overlaps the body`,
          worst === 0,
          `${worst}px² at scrollY ${worstAt}`,
        );
      }

      await page.close();
    }
  }

  // Cumulative layout shift on a phone.
  //
  // The contents list used to ship OPEN and get closed by script on narrow
  // viewports, which jumped the whole document up by around 700px on every
  // mobile load. Lighthouse measured /wiki at a CLS of 0.37 against a "good"
  // threshold of 0.1, and CLS is a quarter of the mobile performance score.
  //
  // The markup ships closed now. This is the check that says so in a number,
  // because the visual difference between "collapsed immediately" and
  // "collapsed a moment after paint" is exactly one frame nobody reviews.
  for (const route of ROUTES) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const cls = await page.evaluate.bind(page);
    await page.addInitScript(() => {
      window.__cls = 0;
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries())
            if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
      } catch {
        window.__cls = -1;
      }
    });
    await page.goto(`http://localhost:${port}${route}`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const score = await cls(() => window.__cls);
    if (score < 0) {
      console.log(`SKIP  ${route}: layout-shift observer unavailable.`);
    } else {
      ok(
        `${route} @390: cumulative layout shift under 0.1`,
        score < 0.1,
        `CLS ${score.toFixed(3)}`,
      );
    }
    await page.close();
  }

  // The disclosure must not be a trap: a reader who opens it on a phone has to
  // be able to close it again, and it must be open where it is the sidebar.
  {
    const phone = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await phone.goto(`http://localhost:${port}/wiki/`, { waitUntil: "load" });
    await phone.waitForTimeout(300);
    const collapsed = await phone.evaluate(() => {
      const t = document.querySelector("[data-toc]");
      return t
        ? { open: t.open, h: Math.round(t.getBoundingClientRect().height) }
        : null;
    });
    ok(
      "wiki contents is collapsed on a phone",
      collapsed !== null && collapsed.open === false,
    );
    ok(
      "collapsed contents costs under 80px",
      collapsed !== null && collapsed.h > 0 && collapsed.h < 80,
      collapsed ? `${collapsed.h}px` : "",
    );
    await phone.close();

    const desk = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await desk.goto(`http://localhost:${port}/wiki/`, { waitUntil: "load" });
    await desk.waitForTimeout(300);
    const open = await desk.evaluate(() => {
      const t = document.querySelector("[data-toc]");
      if (!t) return null;
      return { open: t.open, links: t.querySelectorAll("a").length };
    });
    ok(
      "wiki contents is open and complete in the sidebar",
      open !== null && open.open === true && open.links > 10,
      open ? `open=${open.open} links=${open.links}` : "",
    );
    await desk.close();
  }

  await browser.close();
  await new Promise((r) => server.close(r));
  finish();
})().catch((e) => {
  console.error("verify-doc-layout: " + ((e && e.stack) || e));
  try {
    server.close();
  } catch {}
  process.exit(1);
});

function finish() {
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}
