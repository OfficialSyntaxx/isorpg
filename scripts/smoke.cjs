#!/usr/bin/env node
// QC: real boot smoke test. Serves dist/ and loads the built game in a headless
// browser, asserting the canvas actually renders and the console is clean.
//
// Why this exists: `npm test` and `audit-ui.cjs` both passed for five phases
// while the game did not boot at all (P6.3 → P8.3). A unit suite constructs
// systems directly and never runs boot(); a static audit sees wiring but not
// ordering or runtime failure. Only a real page load catches "it doesn't start".
//
// No hard dependency: if no browser driver is installed this SKIPS with a note
// rather than failing, so it never blocks a machine that can't run one.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.SMOKE_PORT || 4188);

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary",
  ".mp3": "audio/mpeg", ".json": "application/json", ".svg": "image/svg+xml",
};

function loadDriver() {
  for (const name of ["playwright", "playwright-core", "puppeteer"]) {
    try { return { name, mod: require(name) }; } catch { /* try next */ }
  }
  return null;
}

function serve() {
  return http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    for (const base of [DIST, PUBLIC]) {
      const file = path.join(base, rel);
      if (file.startsWith(base) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        return fs.createReadStream(file).pipe(res);
      }
    }
    res.writeHead(404).end("not found");
  });
}

(async () => {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.log("SKIP  smoke: dist/ missing — run `npm run build` first.");
    process.exit(0);
  }
  const driver = loadDriver();
  if (!driver) {
    console.log("SKIP  smoke: no playwright/puppeteer installed (optional).");
    console.log("      Install one to enable the boot smoke test in CI.");
    process.exit(0);
  }

  const server = serve();
  await new Promise((r) => server.listen(PORT, r));
  const url = `http://localhost:${PORT}/`;
  const rows = [];
  const add = (n, ok, x = "") => rows.push(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  [" + x + "]" : ""}`);

  let browser;
  try {
    const launchOpts = { args: ["--no-sandbox", "--headless=new"] };
    if (process.env.CHROME_PATH) launchOpts.executablePath = process.env.CHROME_PATH;
    browser = driver.name === "puppeteer"
      ? await driver.mod.launch(launchOpts)
      : await driver.mod.chromium.launch(launchOpts);

    const page = await (driver.name === "puppeteer" ? browser.newPage() : browser.newPage({ viewport: { width: 900, height: 900 } }));
    const errors = [];
    const badUrls = [];
    page.on("pageerror", (e) => errors.push(String(e.message || e)));
    page.on("console", (m) => {
      // Resource-load console errors carry no URL in their text; they're tracked
      // by URL below instead, so drop them here to avoid an unactionable failure.
      if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text());
    });
    page.on("response", (r) => { if (r.status() >= 400 && !/favicon/i.test(r.url())) badUrls.push(`${r.status()} ${r.url()}`); });

    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForSelector("#bottom-bar", { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 5000)); // let the world build + first frames land

    // 1) The boot-failure overlay must not be present.
    const fatal = await page.$("[data-boot-error]");
    add("boot: no fatal overlay", !fatal);

    // 2) No uncaught errors, and no failed asset fetches.
    add("boot: no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
    add("boot: all assets load", badUrls.length === 0, badUrls.slice(0, 3).join(" | "));

    // 3) The canvas must actually have drawn a scene.
    //    The WebGL context uses preserveDrawingBuffer:false, so reading the
    //    canvas back in-page yields a blank buffer. A compositor screenshot sees
    //    the real frame — and a rendered 3D scene will not PNG-compress anywhere
    //    near as small as a flat fill, which is the signal used here.
    const shot = await page.screenshot({ clip: { x: 0, y: 120, width: 820, height: 600 } });
    // Measured: a live world frame ≈ 240 kB; a dead boot showing only the
    // fatal overlay ≈ 39 kB. 120 kB sits well clear of both.
    add("boot: canvas rendered a scene", shot.length > 120000, `${Math.round(shot.length / 1024)} kB frame`);

    // 4) The world actually populated (spawn logs are the cheapest proof).
    const spawned = await page.evaluate(() => document.querySelectorAll("#bottom-bar .bar-btn").length);
    add("boot: HUD panels present", spawned >= 8, `${spawned} buttons`);
  } catch (err) {
    add("smoke harness ran", false, String(err && err.message ? err.message : err));
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }

  rows.forEach((r) => console.log(r));
  const fails = rows.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${rows.length - fails}/${rows.length} smoke checks passed`);
  process.exit(fails ? 1 : 0);
})();
