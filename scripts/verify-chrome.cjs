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
const { requireBrowser } = require("./lib/browser.cjs");

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
  const { chromium, executablePath } = requireBrowser("chrome");

  const port = 4417;
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });

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

  /* THE ASSERTION THAT WAS MISSING, AND WHY THE OLD ONES ALL PASSED.
   *
   * Everything above measures the header's HEIGHT. Phase 14 added three nav
   * items, the header stayed 109px — comfortably inside budget — and every
   * check here went green while the nav quietly became 619px of links inside a
   * 324px box with three of them off-screen. Height was never the thing that
   * mattered; reachability was, and nothing asked about it.
   *
   * Two questions, at the two narrowest real phone widths:
   *   1. Can every link actually be brought fully into view?
   *   2. If the nav overflows, does the page SAY SO?
   */
  for (const width of [360, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.goto(`http://localhost:${port}/`, { waitUntil: "load" });
    await page.waitForTimeout(250);

    const nav = await page.evaluate(() => {
      const n = document.querySelector(".site-header__nav");
      if (!n) return null;
      n.scrollLeft = 0;
      const links = Array.from(n.querySelectorAll("a")).map((a) => ({
        label: (a.textContent || "").trim(),
        // Offset within the nav's scrollable content, independent of scroll.
        left: a.offsetLeft,
        width: a.getBoundingClientRect().width,
      }));
      return {
        client: n.clientWidth,
        scroll: n.scrollWidth,
        overflows: n.scrollWidth > n.clientWidth + 1,
        links,
      };
    });

    ok(`nav exists @${width}`, nav !== null, "");

    if (nav) {
      // A link wider than the box can never be shown whole, however far you
      // scroll. That is the failure a scroller cannot fix and a rename can.
      const tooWide = nav.links.filter((l) => l.width > nav.client);
      ok(
        `@${width}: every nav link fits the nav box`,
        tooWide.length === 0,
        tooWide.length
          ? `${tooWide.map((l) => `${l.label} ${Math.round(l.width)}px`).join(", ")} in ${nav.client}px`
          : `${nav.links.length} links, widest ${Math.round(
              Math.max(...nav.links.map((l) => l.width)),
            )}px in ${nav.client}px`,
      );

      // And each one lands inside the scrollable content, so scrolling reaches
      // it. A link past scrollWidth is unreachable at any scroll position.
      const unreachable = nav.links.filter((l) => l.left + l.width > nav.scroll + 1);
      ok(
        `@${width}: every nav link is reachable by scrolling`,
        unreachable.length === 0,
        unreachable.length
          ? unreachable.map((l) => l.label).join(", ")
          : `${nav.links.length} links within ${nav.scroll}px of scroll`,
      );

      // The affordance. Only meaningful when there IS overflow — a nav that
      // fits must not be greyed at its edge for nothing.
      const fade = await page.evaluate(async () => {
        const n = document.querySelector(".site-header__nav");
        // A scroll timeline is sampled by the compositor, so a computed value
        // read in the same task as the scroll is the value from BEFORE it. Read
        // without this wait, the fade appears never to clear — which is how
        // this assertion first failed against a mechanism that worked.
        const settle = () =>
          new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const read = () => getComputedStyle(n).getPropertyValue("--nav-fade").trim();
        n.scrollLeft = 0;
        await settle();
        const at0 = read();
        n.scrollLeft = n.scrollWidth;
        await settle();
        const atEnd = read();
        return { at0, atEnd };
      });

      if (nav.overflows) {
        ok(
          `@${width}: overflowing nav shows a fade at the start`,
          Number.parseFloat(fade.at0) > 0,
          `--nav-fade: ${fade.at0} (nav ${nav.scroll}px in ${nav.client}px)`,
        );
        ok(
          `@${width}: the fade clears once scrolled to the end`,
          Number.parseFloat(fade.atEnd) < 1,
          `--nav-fade: ${fade.atEnd}`,
        );
      } else {
        ok(
          `@${width}: nav fits, so no fade is drawn`,
          Number.parseFloat(fade.at0) === 0,
          `--nav-fade: ${fade.at0}`,
        );
      }
    }

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
