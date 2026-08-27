#!/usr/bin/env node
/**
 * QC: the hero's generated world animates, and stops when it should.
 *
 * WHY THIS EXISTS
 * The hero used to paint one frame and stop, which was cheap and lifeless. It
 * now runs a continuous animation loop, and a continuous loop on a landing page
 * is a promise about someone's battery. This check holds that promise to three
 * things that are easy to get wrong and invisible when they break:
 *
 *   1. It actually animates. A silent exception in the loop leaves a perfectly
 *      good still frame, which looks fine and is the bug.
 *   2. It stops when scrolled out of view. Nothing about a still hero looks
 *      different from a hero that is quietly rendering below the fold forever.
 *   3. It respects prefers-reduced-motion — and, just as importantly, still
 *      PAINTS. The previous version bailed out entirely and left an empty
 *      canvas, which obeyed the setting by deleting the artwork.
 *
 * Animation is detected by hashing pixels out of the canvas at intervals: two
 * different hashes mean the picture changed, which is the only definition of
 * "animating" that cannot be faked by the code under test.
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { requireBrowser } = require("./lib/browser.cjs");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "web/dist");

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
  console.log(`SKIP  hero: ${path.relative(ROOT, DIST)} not built.`);
  process.exit(0);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".xml": "application/xml",
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(DIST, p);
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

/** Samples the canvas and reduces it to one number. */
const HASH = () => {
  const c = document.querySelector("[data-hero-terrain]");
  if (!c) return -1;
  const g = c.getContext("2d");
  const d = g.getImageData(0, 0, c.width, Math.min(240, c.height)).data;
  let h = 0;
  for (let i = 0; i < d.length; i += 617) h = (h * 31 + d[i]) >>> 0;
  return h;
};

(async () => {
  const { chromium, executablePath } = requireBrowser("hero");

  const port = 4421;
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox"],
  });

  // --- motion allowed ------------------------------------------------------
  {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${port}/`, { waitUntil: "load" });
    // Past the ~1.1s entrance, into the ambient loop.
    await page.waitForTimeout(2200);

    const painted = await page.evaluate(() => {
      const c = document.querySelector("[data-hero-terrain]");
      return c ? c.hasAttribute("data-painted") && c.width > 0 : false;
    });
    ok("the hero canvas paints", painted);

    const a = await page.evaluate(HASH);
    await page.waitForTimeout(900);
    const b = await page.evaluate(HASH);
    await page.waitForTimeout(900);
    const c = await page.evaluate(HASH);
    ok(
      "the scene is still animating after the entrance",
      a !== b && b !== c,
      `${a} ${b} ${c}`,
    );

    // Scroll the hero fully out of view; the loop must stop.
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, window.innerHeight * 3);
    });
    await page.waitForTimeout(900);
    const d = await page.evaluate(HASH);
    await page.waitForTimeout(900);
    const e = await page.evaluate(HASH);
    ok(
      "the loop stops when the hero is scrolled out of view",
      d === e,
      `${d} vs ${e}`,
    );

    // And restarts when it comes back.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    const f = await page.evaluate(HASH);
    await page.waitForTimeout(900);
    const g = await page.evaluate(HASH);
    ok("it resumes when the hero returns to view", f !== g, `${f} vs ${g}`);

    ok(
      "no uncaught errors from the hero",
      errors.length === 0,
      errors.slice(0, 2).join(" | "),
    );
    await page.close();
  }

  // --- reduced motion ------------------------------------------------------
  {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
    });
    await page.goto(`http://localhost:${port}/`, { waitUntil: "load" });
    await page.waitForTimeout(1800);

    const painted = await page.evaluate(() => {
      const c = document.querySelector("[data-hero-terrain]");
      return c ? c.hasAttribute("data-painted") : false;
    });
    ok("reduced motion still paints the world", painted);

    // Not blank: an empty canvas would also be perfectly still.
    const ink = await page.evaluate(() => {
      const c = document.querySelector("[data-hero-terrain]");
      const g = c.getContext("2d");
      const d = g.getImageData(0, 0, c.width, Math.min(240, c.height)).data;
      let opaque = 0;
      for (let i = 3; i < d.length; i += 4 * 137) if (d[i] > 8) opaque++;
      return opaque;
    });
    ok(
      "reduced motion's canvas is not blank",
      ink > 50,
      `${ink} sampled opaque pixels`,
    );

    const a = await page.evaluate(HASH);
    await page.waitForTimeout(1200);
    const b = await page.evaluate(HASH);
    ok("reduced motion holds the frame still", a === b, `${a} vs ${b}`);
    await page.close();
  }

  await browser.close();
  await new Promise((r) => server.close(r));
  finish();
})().catch((e) => {
  console.error("verify-hero: " + ((e && e.stack) || e));
  try {
    server.close();
  } catch {}
  process.exit(1);
});

function finish() {
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}
