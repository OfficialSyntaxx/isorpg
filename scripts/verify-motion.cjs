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
 *   - the hero's departure runs on its scroll timeline — text first, then the
 *     land, then dusk and the horizon — and composes with the parallax handler
 *     underneath it rather than overriding it;
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
    // 5, not 6: the experience curve moved off initPathDraw onto a scroll
    // timeline in A4, so it is no longer a [data-draw] path. It is asserted
    // directly instead — a floor that quietly absorbed the change would have
    // been worse than one that had to be edited.
    "[data-draw]": 5,
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

    // Measured as computed OPACITY, not as the absence of a class.
    //
    // An earlier version of this counted elements carrying .is-revealed, which
    // only proves the observer has not fired yet. Deleting the [data-js] flag
    // that gates the offset state would leave every element permanently visible
    // — the entire scroll-reveal effect gone — and that class-based assertion
    // passed against exactly that, tested. Opacity is the thing a reader sees,
    // so opacity is the thing to assert.
    const before = await page.evaluate(() => {
      const els = [...document.querySelectorAll("[data-reveal]")];
      const below = els.filter(
        (e) => e.getBoundingClientRect().top > window.innerHeight,
      );
      return {
        below: below.length,
        visibleBelow: below.filter(
          (e) => Number(getComputedStyle(e).opacity) > 0.99,
        ).length,
      };
    });
    ok(
      "reveals below the fold start hidden",
      before.below > 0 && before.visibleBelow === 0,
      `${before.visibleBelow}/${before.below} already at full opacity`,
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
    const heres = new Set();
    const bars = new Set();
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
        // A5: the same signal, published on <html> and consumed by chrome that
        // sits outside every section.
        here: document.documentElement.getAttribute("data-here"),
        bar: getComputedStyle(document.documentElement).scrollbarColor,
      }));
      regions.add(s.region);
      trackShifts.add(s.track);
      heres.add(s.here);
      bars.add(s.bar);
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

    // A5. Two assertions, not one: the attribute reaching <html> proves the
    // signal is published, and the scrollbar colour changing proves something
    // outside the sections is actually consuming it. The first passed while the
    // second did not — a replacement in components.css silently failed to match
    // after prettier collapsed the rule onto one line, so the scrollbar stayed
    // bound to the old value and two of six regions rendered identically.
    ok(
      "the region you are in is published to the whole document",
      heres.size >= 3 && !heres.has(null),
      [...heres].join(" → "),
    );
    ok(
      "chrome outside the sections takes its colour from that region",
      bars.size >= 3,
      `${bars.size} distinct scrollbar colours: ${[...bars].join(" | ")}`,
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

  // ---------------------------------------------- layout shift, every route
  //
  // WHY THIS IS IN THE MOTION CHECK
  // Because every regression it has caught was a motion feature. A2 named the
  // hero's world in a paragraph that shipped `hidden` and was filled in once the
  // generator returned a seed — a line of text added to the hero a second after
  // load, which took cumulative layout shift on the landing page from 0.005 to
  // 0.307 and cost 16 points of mobile performance. The production Lighthouse
  // gate caught it; nothing here did, and nothing visible did either, because a
  // shift that happens before you scroll is invisible unless it is measured.
  //
  // verify-doc-layout.cjs already measures CLS on the two document routes. This
  // covers the rest, which is where the animated work actually lands.
  {
    const ROUTES = [
      "/",
      "/world/",
      "/features/",
      "/bestiary/",
      "/save/",
    ];
    for (const route of ROUTES) {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
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
      /*
       * CPU THROTTLED, BECAUSE UNTHROTTLED THIS CHECK IS BLIND.
       *
       * The first version ran at full speed and passed at under 0.1 while
       * production measured 0.295 on the same commit. The shift it missed was
       * the hero sun: a script set the time of day after load, changing the
       * sun's top/right/width/height on an already-painted page. Unthrottled,
       * that script finishes so early the move lands before anything worth
       * measuring; at 4x it lands after paint, exactly as it does on a phone.
       *
       * 4x is the rate Lighthouse's mobile profile emulates, and verify-hero.cjs
       * already uses it for the same reason.
       */
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

      await page.goto(url(route), { waitUntil: "load" });
      // Long enough to include the hero's generator, which starts on an idle
      // callback with a 1200ms timeout and is the slowest thing that can shift.
      await page.waitForTimeout(4200);
      const cls = await page.evaluate(() => window.__cls);
      if (cls < 0) {
        console.log(`SKIP  ${route}: no layout-shift observer.`);
      } else {
        ok(
          `${route} @390: cumulative layout shift under 0.1`,
          cls < 0.1,
          `CLS ${cls.toFixed(3)}`,
        );
      }
      await page.close();
    }
  }

  // ------------------------------------- the page works when scripts do not
  //
  // This is first because it is the one that was actually broken.
  //
  // The reveal primitive hides [data-reveal] and waits for a module script to
  // un-hide it. When that script did not run, the landing page rendered a
  // COMPLETELY BLANK hero — no headline, no lede, no buttons — and the comment
  // above the CSS asserted the opposite, which is why it survived review. The
  // offset state is now gated on [data-js], set by theme-init.js before first
  // paint, so a document that cannot animate never hides anything.
  //
  // HOW THIS IS MEASURED, AND WHY NOT THE OBVIOUS WAY
  // The obvious way is a context with javaScriptEnabled: false. Do not use it
  // here. With page scripting off there is no page.evaluate, so a computed
  // style cannot be read, and what is left to measure does not discriminate:
  // innerText happily returns text from an element at opacity 0, and a hero
  // screenshot is mostly gradient either way. The first draft of this check
  // asserted exactly those two things and PASSED against the bug when it was
  // deliberately reintroduced — it was decoration.
  //
  // Blocking every script at the network layer reproduces the same state — no
  // theme-init.js, so no [data-js], so nothing hidden — while leaving page
  // scripting available to measure it. It is also the more common real-world
  // case: a blocked request, a failed CDN, an extension.
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await ctx.route(/\.js(\?.*)?$/, (route) => route.abort());
    const page = await ctx.newPage();
    await page.goto(url("/"), { waitUntil: "load" });
    await page.waitForTimeout(400);

    const state = await page.evaluate(() => {
      const all = [...document.querySelectorAll("[data-reveal]")];
      const h1 = document.querySelector("h1");
      return {
        scriptRan: document.documentElement.hasAttribute("data-js"),
        total: all.length,
        hidden: all.filter((e) => Number(getComputedStyle(e).opacity) < 0.99)
          .length,
        headlineVisible: Number(getComputedStyle(h1).opacity) > 0.99,
        headlineWidth: Math.round(h1.getBoundingClientRect().width),
      };
    });

    ok(
      "the scripts really were blocked",
      state.scriptRan === false,
      "theme-init.js ran anyway, so the next two assertions prove nothing",
    );
    ok(
      "no content is hidden when the scripts do not run",
      state.total > 0 && state.hidden === 0,
      `${state.hidden}/${state.total} elements left at opacity 0`,
    );
    ok(
      "the headline still renders when the scripts do not run",
      state.headlineVisible && state.headlineWidth > 200,
      `visible=${state.headlineVisible} width=${state.headlineWidth}`,
    );
    await ctx.close();
  }

  // -------------------------------------------------- M12, the split headline
  //
  // The headline is split into words and characters at BUILD time and animated
  // by CSS, so there is no script to check — only markup that must exist and an
  // animation that must run. Both are asserted, because the split is invisible
  // in a settled screenshot: a headline that never animates and a headline that
  // finished animating look identical.
  {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    // `commit` rather than `load`: the entrance starts at first paint, and
    // waiting for load would routinely miss it.
    await page.goto(url("/"), { waitUntil: "commit" });
    await page.waitForTimeout(160);

    const rising = await page.evaluate(() => {
      const chars = [...document.querySelectorAll(".split__char")];
      const offsets = chars.map((c) => {
        const m = new DOMMatrixReadOnly(getComputedStyle(c).transform);
        return Math.round(m.f);
      });
      return {
        n: chars.length,
        displaced: offsets.filter((y) => y !== 0).length,
      };
    });
    ok(
      "the headline is split into characters and starts below its mask",
      rising.n >= 15 && rising.displaced === rising.n,
      `${rising.displaced}/${rising.n} displaced`,
    );

    await page.waitForTimeout(2200);
    const settled = await page.evaluate(() => {
      const chars = [...document.querySelectorAll(".split__char")];
      return chars.filter((c) => {
        const m = new DOMMatrixReadOnly(getComputedStyle(c).transform);
        return Math.round(m.f) !== 0;
      }).length;
    });
    ok("every character lands", settled === 0, `${settled} still displaced`);

    // The stagger is what separates this from a single fade. If the custom
    // properties stopped inheriting — or the nth-child ladder were deleted —
    // every character would carry the same delay and nothing would look wrong
    // in a still.
    const delays = await page.evaluate(() => [
      ...new Set(
        [...document.querySelectorAll(".split__char")].map(
          (c) => getComputedStyle(c).animationDelay,
        ),
      ),
    ]);
    ok(
      "characters are staggered rather than moving as one",
      delays.length >= 8,
      `${delays.length} distinct delays`,
    );

    // The accessible name must be the sentence, once — not a run of glyphs and
    // not the sentence twice. Read from the accessibility tree, because
    // textContent counts the aria-hidden copy and would pass either way.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Accessibility.enable");
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const h1 = nodes.find(
      (n) =>
        n.role &&
        n.role.value === "heading" &&
        (n.properties || []).some(
          (p) => p.name === "level" && p.value.value === 1,
        ),
    );
    ok(
      "the split headline's accessible name is the sentence, once",
      h1 && h1.name && h1.name.value === "The world builds itself.",
      h1 && h1.name
        ? JSON.stringify(h1.name.value)
        : "no level-1 heading found",
    );

    await page.close();
  }

  // -------------------------------------------------- M11, the departure
  //
  // The signature scroll moment: the hero leaves as a camera move rather than a
  // section scrolling off. Four layers on one scroll timeline, at four rates.
  //
  // This is the assertion that is easiest to lose. The whole effect lives
  // inside `@supports (animation-timeline: scroll())`, and a browser without
  // support is SUPPOSED to render the hero exactly as it did before — so
  // "nothing moved" is a correct result there and a silent failure everywhere
  // else. The support state is therefore established first and reported out
  // loud, rather than inferred from the measurements.
  {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(url("/"), { waitUntil: "load" });
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
    });
    await page.waitForTimeout(1600);

    const supported = await page.evaluate(() =>
      CSS.supports("animation-timeline", "scroll()"),
    );

    const sample = () =>
      page.evaluate(() => {
        const g = (sel, prop) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el)[prop] : null;
        };
        return {
          contentOpacity: Number(g("[data-hero-content]", "opacity")),
          contentTransform: g("[data-hero-content]", "transform"),
          depth: g("[data-hero-depth]", "transform"),
          dusk: Number(g("[data-hero-dusk]", "opacity")),
          horizon: Number(g("[data-hero-horizon]", "opacity")),
        };
      });

    const top = await sample();
    ok(
      "the hero rests undeparted at the top of the page",
      top.contentOpacity === 1 && top.dusk === 0 && top.horizon === 0,
      `content ${top.contentOpacity}, dusk ${top.dusk}, horizon ${top.horizon}`,
    );

    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(400);
    const gone = await sample();

    if (!supported) {
      console.log(
        "SKIP  the hero departure: this browser has no scroll timelines, so the " +
          "hero is expected to be unchanged. Support is required to test it.",
      );
      ok(
        "without scroll timelines the hero is left exactly as it was",
        gone.contentOpacity === 1 && gone.dusk === 0 && gone.horizon === 0,
        "the @supports guard is not holding",
      );
    } else {
      ok(
        "the hero text departs first",
        gone.contentOpacity < 0.2 &&
          gone.contentTransform !== top.contentTransform,
        `opacity ${top.contentOpacity} -> ${gone.contentOpacity}`,
      );
      ok(
        "the land keeps travelling after the text has gone",
        gone.depth !== top.depth && gone.depth !== "none",
        `${top.depth} -> ${gone.depth}`,
      );
      ok(
        "dusk closes and the horizon opens",
        gone.dusk > 0.25 && gone.horizon > 0.5,
        `dusk ${gone.dusk.toFixed(2)}, horizon ${gone.horizon.toFixed(2)}`,
      );

      // The camera move and the parallax are two different mechanisms — a
      // timeline and a scroll handler — on nested elements. Put on the same
      // element the animation would override the inline transform and delete
      // the parallax silently, which is the failure this pins down.
      const parallax = await page.evaluate(
        () =>
          getComputedStyle(document.querySelector("[data-parallax]")).transform,
      );
      ok(
        "the departure and the parallax compose rather than cancel",
        parallax !== "none" && parallax !== gone.depth,
        `layer ${parallax} vs depth ${gone.depth}`,
      );
    }

    await page.close();
  }

  // ------------------------------------------- A4, the curve is climbed
  //
  // The experience curve is scrubbed against scroll rather than drawn on a
  // timer, so the fact the section exists to land — half the experience to 99
  // sits above level 92 — arrives as the reader climbs it.
  //
  // pathLength="1" normalises the polyline so the dash offset runs 1 -> 0 with
  // no measuring, which is what lets this work with no script.
  {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(url("/"), { waitUntil: "load" });
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
    });
    await page.waitForTimeout(700);

    const offsets = [];
    const top = await page.evaluate(
      () =>
        document.querySelector(".line").getBoundingClientRect().top +
        window.scrollY,
    );
    for (let d = -700; d <= 900; d += 200) {
      await page.evaluate(
        (y) => window.scrollTo(0, y),
        Math.max(0, top - 450 + d),
      );
      await page.waitForTimeout(150);
      offsets.push(
        await page.evaluate(() =>
          parseFloat(
            getComputedStyle(document.querySelector(".line")).strokeDashoffset,
          ),
        ),
      );
    }
    const distinct = new Set(offsets.map((o) => o.toFixed(2)));
    ok(
      "the experience curve is climbed rather than played",
      distinct.size >= 4 &&
        offsets[0] > 0.9 &&
        offsets[offsets.length - 1] === 0,
      offsets.map((o) => o.toFixed(2)).join(" -> "),
    );
    await page.close();

    // Resting state is DRAWN. A reader with reduced motion, or a browser with
    // no scroll timelines, must get the finished chart — an undrawn curve is
    // not a calmer chart, it is a missing one.
    const still = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    await still.goto(url("/"), { waitUntil: "load" });
    await still.waitForTimeout(600);
    const rest = await still.evaluate(() =>
      parseFloat(
        getComputedStyle(document.querySelector(".line")).strokeDashoffset,
      ),
    );
    ok(
      "reduced motion shows the whole curve",
      rest === 0,
      `dashoffset ${rest}`,
    );
    await still.close();
  }

  // ------------------------------------------- A6, the travel lantern
  //
  // Mouse only, by design: on a touch screen a light that appears where you
  // tapped and stays there is a smudge. The pointerType guard is why this needs
  // a script at all, and why the assertion drives a real mouse.
  {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
    });
    await page.goto(url("/world/"), { waitUntil: "load" });
    await page.waitForTimeout(1100);
    const fig = page.locator(".world__atlas figure");
    await fig.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const box = await fig.boundingBox();

    const read = () =>
      page.evaluate(() => ({
        on: document
          .querySelector("[data-map]")
          .hasAttribute("data-lantern-on"),
        cx: document.querySelector("[data-lantern]").getAttribute("cx"),
        cy: document.querySelector("[data-lantern]").getAttribute("cy"),
        opacity: Number(
          getComputedStyle(document.querySelector("[data-lantern]")).opacity,
        ),
      }));

    const before = await read();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.75);
    await page.waitForTimeout(250);
    const during = await read();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2);
    await page.waitForTimeout(250);
    const moved = await read();
    await page.mouse.move(box.x + box.width / 2, box.y - 220);
    await page.waitForTimeout(300);
    const after = await read();

    ok(
      "the lantern is dark until a mouse is over the map",
      before.on === false && before.opacity === 0,
      JSON.stringify(before),
    );
    ok(
      "the lantern follows the pointer across the artwork",
      during.on === true &&
        during.opacity === 1 &&
        Math.abs(Number(during.cx) - 25) < 2 &&
        Math.abs(Number(during.cy) - 75) < 2 &&
        Math.abs(Number(moved.cx) - 80) < 2 &&
        Math.abs(Number(moved.cy) - 20) < 2,
      `${during.cx},${during.cy} then ${moved.cx},${moved.cy}`,
    );
    ok(
      "the lantern goes out when the pointer leaves",
      after.on === false && after.opacity === 0,
      JSON.stringify(after),
    );
    await page.close();
  }

  // ------------------------------------- A2 and A3, the hero's world and hour
  //
  // A2: the terrain generator is seeded per visitor and reproducible from the
  // URL. Two assertions are needed because they can fail independently — a
  // generator that ignores its seed reproduces nothing, and a generator that
  // ignores the URL gives everyone a different world with no way to share one.
  //
  // A3: the scene reads the visitor's own clock. Asserted against a faked Date
  // rather than whatever hour CI happens to run at, because a check that only
  // passes between 08:00 and 17:00 is not a check.
  {
    const canvasTail = (page) =>
      page.evaluate(() =>
        document
          .querySelector("[data-hero-terrain]")
          .toDataURL("image/png")
          .slice(-3000),
      );

    // Two unpinned visits must land in different worlds.
    const labels = [];
    for (let i = 0; i < 2; i++) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(url("/"), { waitUntil: "load" });
      await page.waitForTimeout(2600);
      labels.push(
        await page.evaluate(
          () =>
            document.querySelector("[data-hero-world] a")?.textContent ?? null,
        ),
      );
      await page.close();
    }
    ok(
      "each visitor gets their own world, and it is named on the page",
      labels[0] && labels[1] && labels[0] !== labels[1],
      labels.join(" vs "),
    );

    // A pinned world must reproduce exactly, and a different pin must not.
    const pinned = [];
    for (const seed of ["abcxyz", "abcxyz", "zzz111"]) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(url(`/?world=${seed}`), { waitUntil: "load" });
      await page.waitForTimeout(2600);
      pinned.push({
        seed,
        label: await page.evaluate(
          () =>
            document.querySelector("[data-hero-world] a")?.textContent ?? null,
        ),
        tail: await canvasTail(page),
      });
      await page.close();
    }
    ok(
      "?world= reproduces the same world, pixel for pixel",
      pinned[0].tail === pinned[1].tail && pinned[0].label === "#abcxyz",
      `${pinned[0].label} / ${pinned[1].label}, tails ${pinned[0].tail === pinned[1].tail ? "match" : "differ"}`,
    );
    ok(
      "a different ?world= is a different world",
      pinned[2].tail !== pinned[0].tail,
      "two seeds produced identical terrain",
    );

    /* An over-long ?world= must FALL BACK, not silently truncate.
     *
     * A world is a 32-bit seed, and an out-of-range base-36 string was being
     * put through `>>> 0`, which does not reject it — it keeps the low 32 bits.
     * So `?world=isoperia` parsed to 2.4e12, truncated, and the page labelled
     * itself `#1w4vzya`: a world the visitor never asked for and cannot get
     * back to from what they typed.
     *
     * The check is the general property, not the specific wrong answer.
     * Asserting the label round-trips does NOT catch this — `#1w4vzya` is only
     * seven characters and re-parses to itself perfectly well; reproduced.
     * Asserting the label is not `#1w4vzya` catches it but hardcodes one magic
     * output of one magic input.
     *
     * What is actually true of a correct fallback: EVERY out-of-range seed
     * lands on the same documented world. Under truncation they scatter, and
     * two different over-long strings give two different worlds.
     */
    {
      const over = [];
      for (const seed of ["isoperia", "hearthvalerules", "abcxyz"]) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await page.goto(url(`/?world=${seed}`), { waitUntil: "load" });
        await page.waitForTimeout(2600);
        over.push({
          seed,
          label:
            (await page.evaluate(
              () => document.querySelector("[data-hero-world] a")?.textContent ?? null,
            )) ?? "",
          tail: await canvasTail(page),
        });
        await page.close();
      }
      ok(
        "every over-long ?world= falls back to the same world",
        over[0].tail === over[1].tail && over[0].label === over[1].label,
        `${over[0].seed} -> ${over[0].label}, ${over[1].seed} -> ${over[1].label}`,
      );
      ok(
        "the fallback is not just any world — an in-range seed still wins",
        over[2].label === "#abcxyz" && over[2].tail !== over[0].tail,
        `${over[2].seed} -> ${over[2].label}`,
      );
      ok(
        "an over-long seed's label re-parses to the world it labels",
        /^#[0-9a-z]{1,6}$/.test(over[0].label),
        `label was ${over[0].label}`,
      );
    }

    /*
     * A structural check beside the behavioural ones, because they cannot do
     * this job.
     *
     * The generator seeds three things: the terrain noise, the settlement and
     * the birds. The assertions above compare whole canvases, so they prove
     * "the world responds to the seed" — the user-visible contract — and cannot
     * tell WHICH of the three sites is wired. Reverting the terrain to a
     * constant while leaving the settlement seeded still produces a different
     * canvas per seed, and passed all three; tested.
     *
     * So the wiring is checked at the source instead: no seed call may take a
     * bare numeric literal. DEFAULT_WORLD is the one allowed constant, and it
     * is a fallback rather than a seed.
     */
    {
      const src = fs.readFileSync(
        path.join(ROOT, "web/src/scripts/hero-terrain.ts"),
        "utf8",
      );
      // Every seed call must mention `world`. Checking for a bare numeric
      // literal is not enough: the regression this is for is someone reverting
      // a seed to a NAMED constant — `makeNoise(DEFAULT_WORLD)` — which a
      // literal-only pattern happily allows, and which passed all four of the
      // assertions above when tested.
      // `seed` / `seed: number` are the two function signatures and the one
      // pass-through inside makeNoise — plumbing, not seed choices. Everything
      // else that seeds a generator has to derive from `world`.
      const calls = [...src.matchAll(/\b(?:rng|makeNoise)\(([^)]*)\)/g)]
        .map((m) => m[1].trim())
        .filter((arg) => arg.length > 0 && !/^seed(\s*:\s*number)?$/.test(arg))
        .filter((arg) => !/\bworld\b/.test(arg));
      ok(
        "every generator seed is derived from this visitor's world",
        calls.length === 0,
        calls.map((c) => `seeded with "${c}"`).join("; "),
      );
    }

    // A3. The hour layer sits ABOVE the scrim for a measured reason: driven
    // under it, the scrim repainted the page colour back over the night and the
    // picture barely changed while every computed style was correct.
    const hours = [
      ["dawn", "2026-08-28T06:30:00"],
      ["day", "2026-08-28T12:00:00"],
      ["dusk", "2026-08-28T18:30:00"],
      ["night", "2026-08-28T23:30:00"],
    ];
    const wrong = [];
    const opacities = {};
    for (const [expected, iso] of hours) {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      await ctx.addInitScript(`{ const F = Date; const fixed = new F("${iso}").getTime();
        class D extends F {
          constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
          static now() { return fixed; }
        }
        window.Date = D; }`);
      const page = await ctx.newPage();
      await page.goto(url("/?world=abcxyz"), { waitUntil: "load" });
      await page.waitForTimeout(2400);
      const seen = await page.evaluate(() => ({
        // On <html>, not the hero: it is set by the pre-paint blocking script
        // so the sun's geometry is right on the first frame. Setting it after
        // load moved a 429x429 element and cost 0.29 of CLS.
        part: document.documentElement.getAttribute("data-daypart"),
        hour: Number(
          getComputedStyle(document.querySelector("[data-hero-hour]")).opacity,
        ),
      }));
      if (seen.part !== expected)
        wrong.push(`${iso} -> ${seen.part}, expected ${expected}`);
      opacities[expected] = seen.hour;
      await ctx.close();
    }
    ok(
      "the hero reads the visitor's own hour",
      wrong.length === 0,
      wrong.join("; "),
    );
    ok(
      "night actually darkens the world and day adds nothing",
      opacities.day === 0 && opacities.night > 0.5 && opacities.dusk > 0.3,
      JSON.stringify(opacities),
    );
  }

  // -------------------------------------------- M13, the creature cards
  //
  // Opening a region shows the creature that lives there, with its real numbers
  // from the combat export. Three things can rot independently: the card can
  // stop appearing, the numbers can stop matching the game, and the portraits
  // can go back to loading on the click instead of ahead of it.
  {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
    });
    await page.goto(url("/world/"), { waitUntil: "load" });
    await page.waitForTimeout(2600);

    // Warmed on idle. They live inside panels that ship `hidden`, so a lazy
    // image never intersects anything and never loads — measured at zero of
    // four before this warming existed.
    const warmed = await page.evaluate(
      () =>
        [...document.querySelectorAll(".threat__plate img")].filter(
          (i) => i.complete && i.naturalWidth > 0,
        ).length,
    );
    ok(
      "the creature portraits are fetched before anyone clicks",
      warmed === 4,
      `${warmed}/4 loaded`,
    );

    // The numbers must be the game's, not prose. Checked against the export
    // that the page itself reads, so a balance change moves both together.
    const combat = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "unity/Assets/Isoperia/Resources/Content/combat.json"),
        "utf8",
      ),
    );
    const expected = {
      wildwood: "dire_wolf",
      frostwatch: "frost_imp",
      miregate: "bog_husk",
      cinder: "cave_slasher",
    };

    const wrong = [];
    for (const [region, id] of Object.entries(expected)) {
      await page.click(`[data-district="${region}"]`);
      await page.waitForTimeout(260);
      const card = await page.evaluate((r) => {
        const el = document.querySelector(`[data-body="${r}"] .threat`);
        if (!el) return null;
        const dd = [...el.querySelectorAll(".threat__stats dd")].map((d) =>
          Number(d.textContent.trim()),
        );
        return {
          name: el.querySelector(".threat__name").textContent.trim(),
          level: dd[0],
          hp: dd[1],
          maxHit: dd[2],
          badge: el.querySelector(".media__badge").textContent.trim(),
          visible: el.getBoundingClientRect().height > 0,
        };
      }, region);

      const m = combat.MONSTERS[id];
      if (
        !card ||
        !card.visible ||
        card.name !== m.name ||
        card.level !== m.level ||
        card.hp !== m.hp ||
        card.maxHit !== m.maxHit
      ) {
        wrong.push(
          `${region}: ${card ? JSON.stringify(card) : "no card"} vs ${m.name} L${m.level} ${m.hp}hp ${m.maxHit}max`,
        );
      } else if (card.badge !== "Project asset") {
        wrong.push(`${region}: badge "${card.badge}"`);
      }
    }
    ok(
      "every region's creature card matches the combat export",
      wrong.length === 0,
      wrong.join(" | "),
    );

    // The badge is absolutely positioned over a thumbnail narrower than its own
    // label. Unclipped it escaped the picture and painted over the level next to
    // it — a card that silently lost a number. The figure clips now.
    const overflow = await page.evaluate(() => {
      const bad = [];
      for (const fig of document.querySelectorAll(".threat__plate")) {
        const f = fig.getBoundingClientRect();
        const b = fig.querySelector(".media__badge").getBoundingClientRect();
        if (b.right > f.right + 1 || b.bottom > f.bottom + 1) {
          bad.push(Math.round(b.right - f.right));
        }
      }
      return bad;
    });
    ok(
      "the provenance badge stays inside its thumbnail",
      overflow.length === 0,
      `overflowing by ${overflow.join(", ")}px`,
    );

    // Hearthvale and Sunmere have no creature, and say so rather than showing an
    // empty card.
    const safe = await page.evaluate(() => {
      const out = {};
      for (const r of ["hearthvale", "sunmere"]) {
        const p = document.querySelector(`[data-body="${r}"] .district__safe`);
        out[r] = p ? p.textContent.trim().length : 0;
      }
      return out;
    });
    ok(
      "the two safe regions say so instead of showing a blank card",
      safe.hearthvale > 10 && safe.sunmere > 10,
      JSON.stringify(safe),
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

    // The departure needs its own reduced-motion assertion, and it is the one
    // most likely to rot. Every other animation in this project is built on the
    // duration tokens, which tokens.css collapses to 0.01ms under this media
    // query — so they are covered by construction. A scroll-driven animation
    // has no duration to collapse: its progress comes from the scroll position,
    // so it runs at full strength unless a media query explicitly says
    // otherwise. Delete that block and nothing else in this file notices.
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(400);
    const held = await page.evaluate(() => {
      const g = (sel, prop) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el)[prop] : null;
      };
      return {
        content: Number(g("[data-hero-content]", "opacity")),
        depth: g("[data-hero-depth]", "transform"),
        dusk: Number(g("[data-hero-dusk]", "opacity")),
        horizon: Number(g("[data-hero-horizon]", "opacity")),
      };
    });
    const stillSplit = await page.evaluate(() => {
      const chars = [...document.querySelectorAll(".split__char")];
      return {
        n: chars.length,
        displaced: chars.filter((c) => {
          const m = new DOMMatrixReadOnly(getComputedStyle(c).transform);
          return Math.round(m.f) !== 0;
        }).length,
      };
    });
    ok(
      "reduced motion shows the headline already assembled",
      stillSplit.n > 0 && stillSplit.displaced === 0,
      `${stillSplit.displaced}/${stillSplit.n} still below the mask`,
    );

    ok(
      "reduced motion cancels the hero departure entirely",
      held.content === 1 &&
        held.depth === "none" &&
        held.dusk === 0 &&
        held.horizon === 0,
      `content ${held.content}, depth ${held.depth}, dusk ${held.dusk}, horizon ${held.horizon}`,
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
