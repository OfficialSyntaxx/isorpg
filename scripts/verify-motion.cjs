#!/usr/bin/env node
/**
 * QC: the motion layer actually moves.
 *
 * WHY THIS EXISTS
 * Rewriting the world map to sit on the illustrated overworld silently deleted
 * five self-drawing route paths. Every other check stayed green — the build
 * passed, the CSP passed, Lighthouse went UP, accessibility stayed at 100 — and
 * a documented animation had simply stopped existing. Nothing in this repository
 * could tell the difference between "the routes draw themselves" and "there are
 * no routes".
 *
 * That is the general shape of the problem. A broken animation is not an error.
 * Nothing throws, nothing 404s, no score moves; the page just quietly becomes a
 * static document, and the only detector is a person who remembers what it used
 * to do. Motion is the one part of this site with no natural alarm, which is
 * exactly why it needs a deliberate one.
 *
 * WHAT IT ASSERTS
 * Behaviour, in a real browser, against the built site — not the presence of
 * source code that would produce it:
 *
 *   - reveals start hidden and end shown, and EVERY one of them arrives;
 *   - the route paths and the experience curve draw themselves;
 *   - the parallax layer moves against the scroll;
 *   - the pillar run engages and travels sideways;
 *   - the counters climb to the real numbers in the markup;
 *   - the ambient tint changes region as you travel down the page;
 *   - the header condenses;
 *   - and a floor on the number of motion hooks per route, which is the
 *     assertion that would have caught the deleted routes.
 *
 * And the other half of the contract, which matters more: under
 * prefers-reduced-motion every element is revealed anyway and nothing moves. A
 * motion layer that hides content from someone who turned motion off is worse
 * than no motion layer.
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { requireBrowser } = require("./lib/browser.cjs");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "web/dist");

/*
 * The floor.
 *
 * Not an exact count — adding a section should not be a failing build. A drop
 * to zero, or below what the design calls for, is the regression this catches.
 */
const FLOOR = {
  "/": {
    "[data-reveal]": 12,
    "[data-draw]": 6,
    "[data-parallax]": 1,
    "[data-hscroll]": 1,
    "[data-ambient]": 5,
  },
  "/world/": { "[data-reveal]": 6, "[data-draw]": 5 },
  "/features/": { "[data-reveal]": 8, "[data-count]": 6 },
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

if (!fs.existsSync(DIST)) {
  console.log(`SKIP  motion: ${path.relative(ROOT, DIST)} not built.`);
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
  ".woff2": "font/woff2",
  ".json": "application/json",
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

const PORT = 4427;
const url = (r) => `http://localhost:${PORT}${r}`;

(async () => {
  const { chromium, executablePath } = requireBrowser("motion");
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox"],
  });

  // ---------------------------------------------------------------- floors
  for (const [route, hooks] of Object.entries(FLOOR)) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(url(route), { waitUntil: "load" });
    const counts = await page.evaluate(
      (sels) =>
        Object.fromEntries(
          sels.map((s) => [s, document.querySelectorAll(s).length]),
        ),
      Object.keys(hooks),
    );
    const short = Object.entries(hooks)
      .filter(([sel, min]) => counts[sel] < min)
      .map(([sel, min]) => `${sel} ${counts[sel]} < ${min}`);
    ok(`${route}: motion hooks present`, short.length === 0, short.join("; "));
    await page.close();
  }

  // ---------------------------------------------------------------- landing
  {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(url("/"), { waitUntil: "load" });
    // `scroll-behavior: smooth` is forced off before anything is measured. Left
    // on, `scrollTo` animates and every reading below describes a page that has
    // barely moved — the mistake that once made another check in this
    // repository pass against the bug it was written for.
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
    });
    await page.waitForTimeout(600);

    const before = await page.evaluate(() => {
      const els = [...document.querySelectorAll("[data-reveal]")];
      const below = els.filter(
        (e) => e.getBoundingClientRect().top > window.innerHeight,
      );
      return {
        below: below.length,
        revealedBelow: below.filter((e) => e.classList.contains("is-revealed"))
          .length,
      };
    });
    ok(
      "reveals below the fold start hidden",
      before.below > 0 && before.revealedBelow === 0,
      `${before.revealedBelow}/${before.below} already revealed`,
    );

    const parallax0 = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector("[data-parallax]")).transform,
    );
    const header0 = await page.evaluate(() =>
      document.querySelector("[data-header]")?.hasAttribute("data-condensed"),
    );

    // Sample the ambient region as we go, so a tint that never changes is a
    // failure rather than a thing nobody noticed.
    const regions = new Set();
    const trackShifts = new Set();
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
    });
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    for (let y = 0; y <= height; y += 700) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(200);
      const s = await page.evaluate(() => ({
        region:
          document
            .querySelector("[data-ambient][data-on]")
            ?.getAttribute("data-ambient") ?? "none",
        track: document.querySelector("[data-hscroll-track]")
          ? getComputedStyle(document.querySelector("[data-hscroll-track]"))
              .transform
          : "none",
      }));
      regions.add(s.region);
      trackShifts.add(s.track);
    }
    await page.evaluate((h) => window.scrollTo(0, h), height);
    await page.waitForTimeout(700);

    const after = await page.evaluate(() => {
      const els = [...document.querySelectorAll("[data-reveal]")];
      return {
        total: els.length,
        revealed: els.filter((e) => e.classList.contains("is-revealed")).length,
      };
    });
    ok(
      "every reveal arrives by the bottom of the page",
      after.total > 0 && after.revealed === after.total,
      `${after.revealed}/${after.total}`,
    );

    const parallax1 = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector("[data-parallax]")).transform,
    );
    ok(
      "the parallax layer moves against the scroll",
      parallax0 !== parallax1,
      `${parallax0} -> ${parallax1}`,
    );

    const header1 = await page.evaluate(() =>
      document.querySelector("[data-header]")?.hasAttribute("data-condensed"),
    );
    ok(
      "the header condenses once scrolled",
      header0 === false && header1 === true,
    );

    ok(
      "the ambient tint changes region down the page",
      regions.size >= 3,
      [...regions].join(" → "),
    );

    ok(
      "the pillar run travels sideways as you scroll",
      trackShifts.size >= 3,
      `${trackShifts.size} distinct transforms`,
    );

    // Self-drawing paths. initPathDraw sets an inline dasharray/dashoffset and
    // then transitions the offset to zero; a path left at its full offset is a
    // path that never drew.
    const drew = await page.evaluate(() => {
      const paths = [...document.querySelectorAll("[data-draw]")];
      return {
        total: paths.length,
        prepared: paths.filter((p) => p.style.strokeDasharray !== "").length,
        drawn: paths.filter((p) => Number(p.style.strokeDashoffset || 0) === 0)
          .length,
      };
    });
    ok(
      "every self-drawing path is prepared and finishes drawn",
      drew.total > 0 &&
        drew.prepared === drew.total &&
        drew.drawn === drew.total,
      `${drew.drawn} drawn / ${drew.prepared} prepared / ${drew.total} total`,
    );

    await page.close();
  }

  // ---------------------------------------------------------------- counters
  {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(url("/features/"), { waitUntil: "load" });
    await page.waitForTimeout(120);
    const start = await page.evaluate(() =>
      [...document.querySelectorAll("[data-count]")].map((e) =>
        Number(e.textContent.trim()),
      ),
    );
    await page.waitForTimeout(2000);
    const end = await page.evaluate(() =>
      [...document.querySelectorAll("[data-count]")].map((e) => ({
        shown: Number(e.textContent.trim()),
        real: Number(e.dataset.count),
      })),
    );
    ok(
      "the counters climb",
      start.length > 0 && start.some((v, i) => v < end[i].shown),
      `${start.join(",")} -> ${end.map((e) => e.shown).join(",")}`,
    );
    ok(
      "the counters land on the real numbers",
      end.length > 0 && end.every((e) => e.shown === e.real),
      end
        .filter((e) => e.shown !== e.real)
        .map((e) => `${e.shown}≠${e.real}`)
        .join(", "),
    );
    await page.close();
  }

  // ------------------------------------------------------- reduced motion
  //
  // The important half. Reveals default to their OFFSET state in CSS, so a
  // reduced-motion path that simply does nothing would leave the page blank —
  // obeying the setting by deleting the content.
  {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    await page.goto(url("/"), { waitUntil: "load" });
    await page.waitForTimeout(700);

    const shown = await page.evaluate(() => {
      const els = [...document.querySelectorAll("[data-reveal]")];
      return {
        total: els.length,
        revealed: els.filter((e) => e.classList.contains("is-revealed")).length,
        opaque: els.filter((e) => Number(getComputedStyle(e).opacity) > 0.99)
          .length,
      };
    });
    ok(
      "reduced motion reveals everything immediately",
      shown.total > 0 &&
        shown.revealed === shown.total &&
        shown.opaque === shown.total,
      `revealed ${shown.revealed}/${shown.total}, opaque ${shown.opaque}/${shown.total}`,
    );

    const p0 = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector("[data-parallax]")).transform,
    );
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, 1800);
    });
    await page.waitForTimeout(500);
    const p1 = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector("[data-parallax]")).transform,
    );
    ok(
      "reduced motion holds the parallax layer still",
      p0 === p1,
      `${p0} vs ${p1}`,
    );

    const undrawn = await page.evaluate(
      () =>
        [...document.querySelectorAll("[data-draw]")].filter(
          (p) => p.style.strokeDasharray !== "",
        ).length,
    );
    ok(
      "reduced motion leaves the paths drawn rather than animating them",
      undrawn === 0,
      `${undrawn} paths were prepared for drawing`,
    );

    await page.close();
  }

  await browser.close();
  await new Promise((r) => server.close(r));
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("verify-motion: " + ((e && e.stack) || e));
  try {
    server.close();
  } catch {}
  process.exit(1);
});
