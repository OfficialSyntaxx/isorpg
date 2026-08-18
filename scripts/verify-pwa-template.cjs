#!/usr/bin/env node
/**
 * QC: proves the Unity WebGL PWA template shell works BEFORE Unity is involved.
 *
 * Why this exists: the template's job — loading screen, progress, iOS audio
 * unlock, safe-area probe, service worker, offline relaunch — is all plain web
 * code that Unity merely copies. Waiting for a real Unity build to find a typo
 * in it means a 10-minute build per iteration, on a machine that has the Editor.
 * This runs in about a second, anywhere.
 *
 * It does three things:
 *   1. Emulates Unity's template macro processing ({{{ EXPR }}} and #if/#endif),
 *      which also validates that our macro usage is well-formed.
 *   2. Stubs createUnityInstance so the shell can be driven through a full
 *      load -> ready -> tap-to-play cycle without a 30 MB payload.
 *   3. Drives it in headless Chromium and asserts on real DOM state.
 *
 * Skips (does not fail) when no browser driver is available.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const TEMPLATE = path.join(ROOT, "unity/Assets/WebGLTemplates/IsoperiaPWA");
const PORT = Number(process.env.PWA_PORT || 4199);

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  [" + detail + "]" : ""}`); }
};

// ---------------------------------------------------------------------------
// 1. Unity template macro processing
// ---------------------------------------------------------------------------
const VARS = {
  PRODUCT_NAME: "Isoperia",
  COMPANY_NAME: "Isoperia",
  PRODUCT_VERSION: "0.1.0",
  LOADER_FILENAME: "web.loader.js",
  DATA_FILENAME: "web.data.br",
  FRAMEWORK_FILENAME: "web.framework.js.br",
  CODE_FILENAME: "web.wasm.br",
  MEMORY_FILENAME: "",
  SYMBOLS_FILENAME: "",
  BACKGROUND_FILENAME: "",
  WIDTH: 960,
  HEIGHT: 600,
};

/** Mirrors Unity's own template preprocessor closely enough to catch our bugs. */
function processTemplate(src) {
  // #if VAR ... #else ... #endif  (directives occupy their own line)
  const lines = src.split("\n");
  const out = [];
  const stack = [];
  for (const line of lines) {
    const t = line.trim();
    const mIf = /^#if\s+(.+)$/.exec(t);
    const mElse = /^#else$/.exec(t);
    const mEnd = /^#endif$/.exec(t);
    if (mIf) {
      let v;
      try { v = evalExpr(mIf[1]); } catch { v = false; }
      stack.push(!!v);
      continue;
    }
    if (mElse) { stack[stack.length - 1] = !stack[stack.length - 1]; continue; }
    if (mEnd) { stack.pop(); continue; }
    if (stack.every(Boolean)) out.push(line);
  }
  let text = out.join("\n");

  // {{{ EXPR }}}
  text = text.replace(/\{\{\{([\s\S]*?)\}\}\}/g, (_, expr) => String(evalExpr(expr)));
  return text;
}

function evalExpr(expr) {
  const names = Object.keys(VARS);
  const vals = names.map((n) => VARS[n]);
  // eslint-disable-next-line no-new-func
  return new Function(...names, `"use strict"; return (${expr});`)(...vals);
}

// Unprocessed macros left behind mean a syntax slip in the template.
function assertNoMacrosLeft(name, text) {
  const leftovers = text.match(/\{\{\{|\}\}\}|^#if |^#endif/gm);
  ok(`${name}: all macros resolved`, !leftovers, leftovers ? leftovers.join(" ") : "");
}

// ---------------------------------------------------------------------------
// 2. Build a servable copy with a stubbed Unity loader
// ---------------------------------------------------------------------------
const STAGE = path.join(ROOT, ".pwa-verify");
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(path.join(STAGE, "Build"), { recursive: true });
fs.mkdirSync(path.join(STAGE, "icons"), { recursive: true });

let indexHtml;
try {
  indexHtml = processTemplate(fs.readFileSync(path.join(TEMPLATE, "index.html"), "utf8"));
} catch (e) {
  console.log(`FAIL  index.html: macro processing threw  [${e.message}]`);
  process.exit(1);
}
assertNoMacrosLeft("index.html", indexHtml);
fs.writeFileSync(path.join(STAGE, "index.html"), indexHtml);

const sw = processTemplate(fs.readFileSync(path.join(TEMPLATE, "ServiceWorker.js"), "utf8"));
assertNoMacrosLeft("ServiceWorker.js", sw);
fs.writeFileSync(path.join(STAGE, "ServiceWorker.js"), sw);

fs.copyFileSync(path.join(TEMPLATE, "manifest.webmanifest"), path.join(STAGE, "manifest.webmanifest"));
for (const f of fs.readdirSync(path.join(TEMPLATE, "icons"))) {
  fs.copyFileSync(path.join(TEMPLATE, "icons", f), path.join(STAGE, "icons", f));
}

// Stub loader: drives progress then hands back a fake instance exposing the
// same Module.WEBAudio.audioContext shape the real one does.
fs.writeFileSync(path.join(STAGE, "Build", VARS.LOADER_FILENAME), `
window.__audioResumed = false;
window.__configSeen = null;
function createUnityInstance(canvas, config, onProgress) {
  window.__configSeen = config;
  return new Promise((resolve) => {
    let p = 0;
    const tick = () => {
      p += 0.25;
      onProgress(Math.min(p, 1));
      if (p < 1) setTimeout(tick, 10);
      else setTimeout(() => resolve({
        Module: {
          WEBAudio: {
            audioContext: {
              state: "suspended",
              resume() { window.__audioResumed = true; this.state = "running"; return Promise.resolve(); }
            }
          },
          devicePixelRatio: 1
        }
      }), 10);
    };
    setTimeout(tick, 10);
  });
}
`);

// ---------------------------------------------------------------------------
// 3. Serve + drive
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".png": "image/png",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const rel = urlPath === "/" ? "/index.html" : urlPath;
  const file = path.join(STAGE, rel);
  if (!file.startsWith(STAGE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("not found"); return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  let chromium;
  try { ({ chromium } = require("playwright-core")); }
  catch { console.log("SKIP  pwa: playwright-core not installed (optional)."); process.exit(0); }

  const exe = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
               "/opt/pw-browsers/chromium/chrome-linux/chrome"].find(fs.existsSync);
  if (!exe) { console.log("SKIP  pwa: no chromium binary found (optional)."); process.exit(0); }

  await new Promise((r) => server.listen(PORT, r));
  const base = `http://localhost:${PORT}`;

  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  // Collected only while the server is up. The offline-relaunch step below
  // deliberately kills it, so everything after that legitimately fails to load
  // and would drown a real regression in expected noise.
  const errors = [];
  let collecting = true;
  page.on("pageerror", (e) => { if (collecting) errors.push(String(e)); });
  page.on("console", (m) => { if (collecting && m.type() === "error") errors.push(m.text()); });

  await page.goto(base, { waitUntil: "load" });

  // --- loader appears and reports progress
  await page.waitForFunction(() => {
    const f = document.querySelector("#bar-fill");
    return f && parseFloat(f.style.width) > 0;
  }, { timeout: 5000 }).catch(() => {});
  ok("loading bar advances", await page.evaluate(() =>
    parseFloat(document.querySelector("#bar-fill").style.width) > 0));

  // --- config handed to Unity is well-formed
  const cfg = await page.evaluate(() => window.__configSeen);
  ok("loader config: build URLs set", !!(cfg && cfg.dataUrl && cfg.frameworkUrl && cfg.codeUrl),
     cfg ? JSON.stringify(Object.keys(cfg)) : "no config");
  ok("loader config: DPR capped at 2", cfg && cfg.devicePixelRatio <= 2, String(cfg && cfg.devicePixelRatio));
  ok("loader config: no empty optional URLs",
     cfg && !("memoryUrl" in cfg) && !("symbolsUrl" in cfg),
     "empty MEMORY/SYMBOLS macros must be omitted, not passed blank");

  // --- ready state: loader hidden, tap-to-play shown
  await page.waitForSelector("#start.show", { timeout: 5000 });
  ok("loader hides when ready", await page.evaluate(() =>
    document.querySelector("#loader").classList.contains("hidden")));
  ok("tap-to-play shown (iOS audio gate)", await page.evaluate(() =>
    document.querySelector("#start").classList.contains("show")));

  // --- the tap actually resumes the audio context
  await page.click("#start");
  ok("tap resumes AudioContext", await page.evaluate(() => window.__audioResumed === true));
  ok("tap dismisses the overlay", await page.evaluate(() =>
    !document.querySelector("#start").classList.contains("show")));

  // --- safe-area probe produced numbers for the C# side
  const sa = await page.evaluate(() => window.isoperiaSafeArea);
  ok("safe-area insets exported", sa && ["top", "right", "bottom", "left"]
     .every((k) => typeof sa[k] === "number"), JSON.stringify(sa));

  // --- manifest + icons actually resolve
  const manifestRes = await page.evaluate(async () => {
    const r = await fetch("manifest.webmanifest");
    if (!r.ok) return { ok: false };
    const j = await r.json();
    const icons = await Promise.all(j.icons.map(async (i) => (await fetch(i.src)).ok));
    return { ok: true, display: j.display, icons, hasMaskable: j.icons.some((i) => i.purpose === "maskable") };
  });
  ok("manifest fetches and parses", manifestRes.ok);
  ok("manifest display=standalone (fullscreen on home-screen launch)", manifestRes.display === "standalone");
  ok("every manifest icon resolves", manifestRes.icons && manifestRes.icons.every(Boolean),
     JSON.stringify(manifestRes.icons));
  ok("maskable icon present", !!manifestRes.hasMaskable);

  // --- service worker registers and reaches control
  const swState = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return "none";
    await navigator.serviceWorker.ready;
    return "ready";
  });
  ok("service worker registers", swState === "ready", swState);

  // Assert on a clean console BEFORE going offline, while every request should
  // still succeed.
  ok("no console/page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  // --- offline relaunch: kill the server, reload, still boots
  collecting = false;
  await new Promise((r) => server.close(r));
  await page.reload({ waitUntil: "load" }).catch(() => {});
  const offlineTitle = await page.evaluate(() =>
    document.querySelector("#loader h1") && document.querySelector("#loader h1").textContent);
  ok("offline relaunch serves the shell from cache", offlineTitle === "Isoperia", String(offlineTitle));

  await browser.close();
  fs.rmSync(STAGE, { recursive: true, force: true });

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("verify-pwa-template: " + (e && e.stack || e));
  try { server.close(); } catch {}
  process.exit(1);
});
