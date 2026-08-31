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

/** Samples a canvas and reduces it to one number. */
const HASH = (sel) => {
  const c = document.querySelector(sel);
  if (!c) return -1;
  const g = c.getContext("2d");
  const d = g.getImageData(0, 0, c.width, Math.min(240, c.height)).data;
  let h = 0;
  for (let i = 0; i < d.length; i += 617) h = (h * 31 + d[i]) >>> 0;
  return h;
};

const LIFE = "[data-hero-life]";
const TERRAIN = "[data-hero-terrain]";

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

    const a = await page.evaluate(HASH, LIFE);
    const terrainA = await page.evaluate(HASH, TERRAIN);
    await page.waitForTimeout(900);
    const b = await page.evaluate(HASH, LIFE);
    await page.waitForTimeout(900);
    const c = await page.evaluate(HASH, LIFE);
    const terrainB = await page.evaluate(HASH, TERRAIN);
    ok(
      "the scene is still animating after the entrance",
      a !== b && b !== c,
      `${a} ${b} ${c}`,
    );

    // The performance design, asserted rather than assumed: the terrain is
    // painted once and the loop must never touch it again. Repainting it per
    // frame is what cost 2825ms of every 3000ms before the split.
    ok(
      "the terrain layer is not repainted by the loop",
      terrainA === terrainB && terrainA !== -1,
      `${terrainA} vs ${terrainB}`,
    );

    // Scroll the hero fully out of view; the loop must stop.
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, window.innerHeight * 3);
    });
    await page.waitForTimeout(900);
    const d = await page.evaluate(HASH, LIFE);
    await page.waitForTimeout(900);
    const e = await page.evaluate(HASH, LIFE);
    ok(
      "the loop stops when the hero is scrolled out of view",
      d === e,
      `${d} vs ${e}`,
    );

    // And restarts when it comes back.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    const f = await page.evaluate(HASH, LIFE);
    await page.waitForTimeout(900);
    const g = await page.evaluate(HASH, LIFE);
    ok("it resumes when the hero returns to view", f !== g, `${f} vs ${g}`);

    ok(
      "no uncaught errors from the hero",
      errors.length === 0,
      errors.slice(0, 2).join(" | "),
    );
    await page.close();
  }

  // --- the cost of running ---------------------------------------------------
  //
  // The check that would have caught the regression this file was written after.
  // The animated hero once consumed 2825ms of every 3000ms of main thread on a
  // throttled phone profile — a 62ms long task every frame — and every other
  // assertion here passed happily throughout, because a hero that is animating
  // beautifully and a hero that is eating the device look identical from the
  // outside. Long-task time under CPU throttling is the number that separates
  // them.
  {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });
    const cdp = await page.context().newCDPSession(page);
    // The same 4x throttle Lighthouse applies to its mobile profile.
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto(`http://localhost:${port}/`, { waitUntil: "load" });
    // Past the entrance and into steady state; the entrance is allowed to be
    // busy, a permanent loop is not.
    await page.waitForTimeout(4000);

    const blocked = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const seen = [];
          try {
            const o = new PerformanceObserver((l) => {
              for (const e of l.getEntries()) seen.push(e.duration);
            });
            o.observe({ entryTypes: ["longtask"] });
          } catch {
            resolve(-1);
            return;
          }
          setTimeout(() => resolve(seen.reduce((a, c) => a + c, 0)), 3000);
        }),
    );

    if (blocked < 0) {
      console.log(
        "SKIP  long-task budget: PerformanceObserver longtask unavailable.",
      );
    } else {
      // 600ms of 3000ms is 20% of a throttled main thread. Generous — the
      // measured figure after the two-canvas split is 0 — but it is the
      // difference between "a background" and "a background that owns the CPU".
      ok(
        "steady-state main-thread cost is within budget",
        blocked <= 600,
        `${Math.round(blocked)}ms of long tasks per 3000ms (budget 600)`,
      );
    }
    await page.close();
  }

  /* --- the living settlement ----------------------------------------------
   *
   * Two assertions, and the second is the one that matters. "Something moved"
   * was already true of this hero before anyone lived in it — the water has
   * shimmered since the first version. What is new is that PEOPLE move, and
   * that they move on the engine's 600ms tick rather than drifting.
   */
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://localhost:${port}/?world=abcxyz`, { waitUntil: "load" });
    await page.waitForTimeout(2600);

    // Villager pixels and where their centre of mass is, by cloak tint. The
    // scene uses no other colours in this range.
    const SCAN = () => {
      const c = document.querySelector("[data-hero-life]");
      const g = c.getContext("2d", { willReadFrequently: true });
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const TINTS = [
        [60, 76, 107],
        [107, 60, 66],
        [75, 90, 60],
        [90, 68, 104],
        [200, 169, 138],
      ];
      let n = 0;
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue;
        for (const t of TINTS) {
          if (
            Math.abs(d[i] - t[0]) < 16 &&
            Math.abs(d[i + 1] - t[1]) < 16 &&
            Math.abs(d[i + 2] - t[2]) < 16
          ) {
            const px = i / 4;
            sx += px % c.width;
            sy += Math.floor(px / c.width);
            n++;
            break;
          }
        }
      }
      return { n, x: n ? sx / n : 0, y: n ? sy / n : 0 };
    };

    const first = await page.evaluate(SCAN);
    ok(
      "the settlement is inhabited",
      first.n > 40,
      `${first.n} villager pixels`,
    );

    await page.waitForTimeout(1500);
    const later = await page.evaluate(SCAN);
    const moved = Math.hypot(later.x - first.x, later.y - first.y);
    ok(
      "the villagers walk",
      later.n > 40 && moved > 1.5,
      `centre of mass moved ${moved.toFixed(1)}px in 1500ms`,
    );

    /* THEY STEP, THEY DO NOT GLIDE.
     *
     * This is the assertion that protects the idea rather than its side
     * effects. Everything else here would still pass if the villagers drifted
     * at constant speed — the obvious implementation, and the one this
     * replaced.
     *
     * A walker eases across the first ~72% of each 600ms tick and then stands
     * still, and every walker shares the tick, so movement binned by PHASE
     * WITHIN THE TICK is large early and near zero late. A glide is flat across
     * every bin.
     *
     * The first version of this compared the busiest quarter of intervals with
     * the quietest and used no phase at all. It PASSED a control that replaced
     * the step with a literal constant glide: the centre of mass of four
     * walkers turning at route ends is noisy enough to produce that spread on
     * its own. Binning by tick phase and averaging over ten ticks is what
     * removes the noise — and it works only because the walkers are offset by
     * whole ticks and therefore pause together.
     */
    const walk = await page.evaluate(async () => {
      const c = document.querySelector("[data-hero-life]");
      const g = c.getContext("2d", { willReadFrequently: true });
      const TINTS = [
        [60, 76, 107],
        [107, 60, 66],
        [75, 90, 60],
        [90, 68, 104],
        [200, 169, 138],
      ];
      const at = () => {
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        let sx = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 200) continue;
          for (const t of TINTS) {
            if (
              Math.abs(d[i] - t[0]) < 16 &&
              Math.abs(d[i + 1] - t[1]) < 16 &&
              Math.abs(d[i + 2] - t[2]) < 16
            ) {
              sx += (i / 4) % c.width;
              n++;
              break;
            }
          }
        }
        return n ? sx / n : null;
      };
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));

      /* TWO BUCKETS WITH A GUARD BAND, NOT SIX EQUAL BINS.
       *
       * The walker eases across the first 72% of the tick and stands still for
       * the rest. Six equal bins put that boundary inside bin 4 (66.7-83.3%),
       * so bin 4 was half movement and half pause, and the comparison leaned on
       * bin 5 alone. Under load — a parallel build on the same machine, or a
       * shared CI runner — dropped frames smear samples across bins and the
       * ratio collapsed to 1.9 against a 2.5 threshold. Measured: it failed
       * beside a running gate and passed immediately on an idle machine.
       *
       * A check that depends on how busy the host is will eventually fail on
       * work that did not break it, and "flake" is not a root cause. So the
       * samples that fall in the 72-82% transition are discarded and the two
       * unambiguous phases are compared directly, which also puts far more
       * samples in each bucket.
       */
      const MOVING_END = 0.72;
      const PAUSED_START = 0.82;
      const sum = [0, 0];
      const hits = [0, 0];
      let prev = at();
      let prevT = performance.now();
      for (let i = 0; i < 120; i++) {
        await wait(50);
        const now = performance.now();
        const x = at();
        if (x !== null && prev !== null) {
          const phase = ((prevT + now) / 2 % 600) / 600;
          const b = phase < MOVING_END ? 0 : phase >= PAUSED_START ? 1 : -1;
          if (b >= 0) {
            // Per millisecond: setTimeout is not exact and intervals vary.
            sum[b] += Math.abs(x - prev) / Math.max(1, now - prevT);
            hits[b]++;
          }
        }
        prev = x;
        prevT = now;
      }
      return { avg: sum.map((v, k) => (hits[k] ? v / hits[k] : 0)), hits };
    });
    const [moving, paused] = walk.avg;
    ok(
      "the walk is stepped on the tick, not a constant glide",
      Math.min(...walk.hits) > 8 && moving > paused * 2.5,
      `during the step ${moving.toFixed(4)}px/ms vs ${paused.toFixed(4)} after it ` +
        `(need 2.5x; ${walk.hits[0]}/${walk.hits[1]} samples)`,
    );

    await page.close();
  }

  /* NOBODY WALKS OVER A ROOF.
     *
     * The life canvas always paints on top of the terrain, and the houses live
     * in the terrain, so a walker passing behind one would be drawn over its
     * roof. The fix is not to repaint the house — the life layer renders at
     * device-pixel-ratio 1 on purpose and a half-resolution house over its own
     * crisp copy is a permanent ghost — but to prefer routes that run in front
     * of everything and fade a walker out over the depth boundary otherwise.
     *
     * Measured directly: villager pixels on the life canvas that land on roof
     * colour in the terrain beneath. With the fade disabled this reaches 37-45%
     * on some seeds; with it, 0-0.6%. The remainder is legitimate — a walker in
     * front of one house may correctly overlap the roof of another BEHIND it —
     * so the bound is a small percentage rather than zero.
     */
  {
    /* A DIFFERENT SEED ON PURPOSE.
     *
     * The walk assertions above use abcxyz, which has plenty of villager
     * pixels. It is the wrong fixture for THIS check: on abcxyz every route
     * already runs in front of every house, so the measurement reads 0.00% with
     * the fade enabled AND 0.00% with it disabled — an assertion that cannot
     * fail. 4kd0p puts a route behind a roof: 37% without the fade, 0.05% with.
     * Both numbers measured before this was written.
     */
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://localhost:${port}/?world=4kd0p`, { waitUntil: "load" });
    await page.waitForTimeout(2600);

    const roofs = await page.evaluate(async () => {
      const T = document.querySelector("[data-hero-terrain]");
      const L = document.querySelector("[data-hero-life]");
      const tg = T.getContext("2d", { willReadFrequently: true });
      const lg = L.getContext("2d", { willReadFrequently: true });
      const td = tg.getImageData(0, 0, T.width, T.height).data;
      // The terrain canvas is at DPR 2 and the life canvas at 1.
      const sc = T.width / L.width;
      const ROOF = [
        [115, 62, 41],
        [138, 75, 50],
        [166, 92, 60],
      ];
      const TINTS = [
        [60, 76, 107],
        [107, 60, 66],
        [75, 90, 60],
        [90, 68, 104],
        [200, 169, 138],
      ];
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      let onRoof = 0;
      let total = 0;
      // Across a full traversal, not one frame: a walker is only behind a
      // house for part of its route.
      for (let f = 0; f < 30; f++) {
        const ld = lg.getImageData(0, 0, L.width, L.height).data;
        for (let i = 0; i < ld.length; i += 4) {
          if (ld[i + 3] < 200) continue;
          let hit = false;
          for (const t of TINTS) {
            if (
              Math.abs(ld[i] - t[0]) < 16 &&
              Math.abs(ld[i + 1] - t[1]) < 16 &&
              Math.abs(ld[i + 2] - t[2]) < 16
            ) {
              hit = true;
              break;
            }
          }
          if (!hit) continue;
          total++;
          const px = (i / 4) % L.width;
          const py = Math.floor(i / 4 / L.width);
          const ti = (Math.round(py * sc) * T.width + Math.round(px * sc)) * 4;
          for (const t of ROOF) {
            if (
              Math.abs(td[ti] - t[0]) < 14 &&
              Math.abs(td[ti + 1] - t[1]) < 14 &&
              Math.abs(td[ti + 2] - t[2]) < 14
            ) {
              onRoof++;
              break;
            }
          }
        }
        await wait(120);
      }
      return { onRoof, total };
    });
    const pct = roofs.total ? (100 * roofs.onRoof) / roofs.total : 0;
    ok(
      "no villager is drawn over a roof in front of them",
      roofs.total > 200 && pct < 5,
      `${pct.toFixed(2)}% of ${roofs.total} villager pixels landed on roof colour`,
    );

    await page.close();
  }

  // --- reduced motion ------------------------------------------------------
  {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
    });
    // Pinned. Without a seed this block gets a RANDOM world on every run, so
    // any assertion about what the still frame contains is a coin toss — the
    // "still frame has people in it" check passed and failed on alternate runs
    // before this line existed.
    await page.goto(`http://localhost:${port}/?world=abcxyz`, { waitUntil: "load" });
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

    const a = await page.evaluate(HASH, LIFE);
    await page.waitForTimeout(1200);
    const b = await page.evaluate(HASH, LIFE);
    ok("reduced motion holds the frame still", a === b, `${a} vs ${b}`);

    /* THE STILL FRAME MUST BE INHABITED.
     *
     * `settle()` used to hand-pick which draw functions ran, and had already
     * drifted: the animated sky has four birds and the reduced-motion sky had
     * none, because nobody updated the subset when birds were added. It now
     * calls renderFrame(0) instead, so the subset cannot drift again — and this
     * asserts the thing that matters, which is that somebody is home.
     *
     * A settlement frozen with nobody in it would tell a reduced-motion visitor
     * the world is uninhabited: the exact opposite of what the scene says to
     * everyone else, and a worse bug than the missing birds.
     */
    const folk = await page.evaluate(() => {
      const c = document.querySelector("[data-hero-life]");
      if (!c) return -1;
      const g = c.getContext("2d", { willReadFrequently: true });
      const d = g.getImageData(0, 0, c.width, c.height).data;
      /* The villager cloak tints and the skin tone.
       *
       * NEAR-OPAQUE ONLY, AND A TIGHT CUBE. The first version accepted alpha
       * over 40 within +/-26 of a tint, and that matched antialiased water and
       * bird edges — dark teal blends around (55,85,88) that sit inside the
       * cube for two of the four cloaks. They were single pixels, but enough of
       * them summed past a threshold of 8, so this check PASSED against a build
       * with the villagers removed entirely. Reproduced, then fixed here.
       *
       * Villager bodies are filled at full alpha, so requiring 200+ excludes
       * every blended edge in the scene, and 16 excludes the near misses.
       */
      const TINTS = [
        [60, 76, 107],
        [107, 60, 66],
        [75, 90, 60],
        [90, 68, 104],
        [200, 169, 138],
      ];
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue;
        for (const t of TINTS) {
          if (
            Math.abs(d[i] - t[0]) < 16 &&
            Math.abs(d[i + 1] - t[1]) < 16 &&
            Math.abs(d[i + 2] - t[2]) < 16
          ) {
            n++;
            break;
          }
        }
      }
      return n;
    });
    ok(
      "the still frame has people in it",
      folk > 40,
      `${folk} villager pixels in the reduced-motion frame`,
    );
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
