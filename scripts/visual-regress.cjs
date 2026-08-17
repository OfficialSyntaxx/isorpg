#!/usr/bin/env node
// Compare the game's opening frame against a committed baseline.
//
// Both of Phase A's defects were purely visual and both shipped: water
// triangulating across the map as one self-intersecting polygon, and a camera
// that opened on the corner of the world instead of the hero. Unit tests could
// not see either. This can.
//
// Determinism comes from the app, not from luck: `?canonicalFrame=0` boots
// everything, waits for the rigged meshes, pins animation time and draws exactly
// one frame without ever starting the loop — so no tick has moved an actor and
// the same seed yields the same pixels.
//
// Usage:
//   node scripts/visual-regress.cjs            compare against the baseline
//   node scripts/visual-regress.cjs --update   accept the current frame as the baseline
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "public");
const BASELINE = path.join(ROOT, "tests", "baseline", "opening-frame.png");
const OUT_DIR = path.join(ROOT, ".visual");
const PORT = Number(process.env.VISUAL_PORT || 4191);

// Viewport is fixed: the frame is framed by the camera's aspect ratio, so a
// different size is a different picture, not the same picture scaled.
const WIDTH = 900;
const HEIGHT = 760;

// A pixel counts as changed above this per-channel distance, and the run fails
// above this fraction of changed pixels. Tolerant enough for GPU/driver dither
// between machines, tight enough that a moved camera or missing geometry — which
// move thousands of pixels — cannot slip through.
const CHANNEL_TOLERANCE = 24;
const MAX_CHANGED_FRACTION = 0.02;

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".glb": "model/gltf-binary",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
};

function findChrome() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers"].filter(Boolean);
  for (const root of roots) {
    let entries;
    try { entries = fs.readdirSync(root); } catch { continue; }
    for (const d of entries.filter((x) => x.startsWith("chromium")).sort().reverse()) {
      for (const rel of ["chrome-linux/chrome", "chrome-linux/headless_shell", "chrome"]) {
        const p = path.join(root, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

function serve() {
  return http.createServer((req, res) => {
    let url = decodeURIComponent(String(req.url).split("?")[0]);
    if (url === "/") url = "/index.html";
    for (const root of [DIST, PUBLIC]) {
      const file = path.join(root, url);
      if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        return res.end(fs.readFileSync(file));
      }
    }
    res.writeHead(404);
    res.end("not found");
  });
}

/** Decode two PNGs in the page and count pixels that differ meaningfully. */
async function comparePngs(page, aBuf, bBuf) {
  return page.evaluate(async ({ a, b, channelTolerance }) => {
    const load = async (data) => {
      const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      c.getContext("2d").drawImage(bmp, 0, 0);
      return { w: bmp.width, h: bmp.height, px: c.getContext("2d").getImageData(0, 0, bmp.width, bmp.height) };
    };
    const A = await load(a);
    const B = await load(b);
    if (A.w !== B.w || A.h !== B.h) {
      return { sizeMismatch: true, a: `${A.w}x${A.h}`, b: `${B.w}x${B.h}` };
    }
    const diff = document.createElement("canvas");
    diff.width = A.w; diff.height = A.h;
    const dctx = diff.getContext("2d");
    const out = dctx.createImageData(A.w, A.h);
    let changed = 0;
    for (let i = 0; i < A.px.data.length; i += 4) {
      const dr = Math.abs(A.px.data[i] - B.px.data[i]);
      const dg = Math.abs(A.px.data[i + 1] - B.px.data[i + 1]);
      const db = Math.abs(A.px.data[i + 2] - B.px.data[i + 2]);
      const hit = Math.max(dr, dg, db) > channelTolerance;
      if (hit) changed++;
      // Changed pixels in magenta over a dimmed copy of the new frame.
      out.data[i] = hit ? 255 : B.px.data[i] >> 2;
      out.data[i + 1] = hit ? 0 : B.px.data[i + 1] >> 2;
      out.data[i + 2] = hit ? 255 : B.px.data[i + 2] >> 2;
      out.data[i + 3] = 255;
    }
    dctx.putImageData(out, 0, 0);
    return {
      changed,
      total: A.w * A.h,
      fraction: changed / (A.w * A.h),
      diffPng: diff.toDataURL("image/png").split(",")[1],
    };
  }, { a: aBuf.toString("base64"), b: bBuf.toString("base64"), channelTolerance: CHANNEL_TOLERANCE });
}

async function main() {
  const update = process.argv.includes("--update");

  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.error("visual-regress: no dist/ — run `npm run build` first.");
    process.exit(1);
  }

  let playwright;
  try { playwright = require("playwright"); } catch {
    console.log("SKIP  visual-regress: playwright not installed (optional).");
    process.exit(0);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = serve();
  await new Promise((r) => server.listen(PORT, r));

  const exe = process.env.CHROME_PATH || findChrome();
  const browser = await playwright.chromium.launch({
    args: ["--no-sandbox", "--headless=new"],
    ...(exe ? { executablePath: exe } : {}),
  });

  let failed = false;
  try {
    // deviceScaleFactor 1: a baseline is only comparable at one pixel density.
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message || e)));

    await page.goto(`http://localhost:${PORT}/?canonicalFrame=0`, { waitUntil: "load" });
    // main.ts stamps this only after the frame is drawn, so there is no sleep to
    // guess at and no race to lose.
    await page.waitForSelector("body[data-canonical-frame]", { timeout: 30000 });

    const frame = await page.screenshot();
    fs.writeFileSync(path.join(OUT_DIR, "opening-frame.png"), frame);

    if (errors.length) {
      console.log(`FAIL  visual: page errors during the canonical frame\n      ${errors.slice(0, 3).join("\n      ")}`);
      failed = true;
    }

    if (update || !fs.existsSync(BASELINE)) {
      fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
      fs.writeFileSync(BASELINE, frame);
      console.log(`${update ? "UPDATED" : "CREATED"}  baseline: ${path.relative(ROOT, BASELINE)} (${(frame.length / 1024).toFixed(0)} kB)`);
      console.log("        Review it visually — a baseline is only as good as the frame you accepted.");
    } else {
      const r = await comparePngs(page, fs.readFileSync(BASELINE), frame);
      if (r.sizeMismatch) {
        console.log(`FAIL  visual: frame size changed  [baseline ${r.a}, now ${r.b}]`);
        failed = true;
      } else {
        const pct = (r.fraction * 100).toFixed(2);
        const ok = r.fraction <= MAX_CHANGED_FRACTION;
        console.log(`${ok ? "PASS" : "FAIL"}  visual: opening frame matches the baseline  [${pct}% of pixels changed, limit ${(MAX_CHANGED_FRACTION * 100).toFixed(0)}%]`);
        if (!ok) {
          fs.writeFileSync(path.join(OUT_DIR, "diff.png"), Buffer.from(r.diffPng, "base64"));
          fs.copyFileSync(BASELINE, path.join(OUT_DIR, "baseline.png"));
          console.log(`      Wrote ${path.relative(ROOT, OUT_DIR)}/{baseline,opening-frame,diff}.png (changes in magenta).`);
          console.log("      If the change is intended: node scripts/visual-regress.cjs --update");
          failed = true;
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
