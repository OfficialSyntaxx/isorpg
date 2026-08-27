#!/usr/bin/env node
/**
 * QC: loads the DEPLOYED game at <site>/play/ in a real browser and proves it
 * still boots under the site's Content Security Policy.
 *
 * WHY THIS EXISTS
 * Phase 7 shipped an enforcing CSP, and the Unity WebGL loader needs
 * 'wasm-unsafe-eval' from it. Everything about that reasoning is sound and none
 * of it is evidence. The local CSP harness cannot cover /play, because the
 * Unity build is 50 MB, gitignored, and produced by a licensed job.
 *
 * scripts/deploy-report.sh already checks the wasm's Content-Type and
 * Content-Encoding, but headers being right is not the same as the game
 * starting: a CSP that blocks WebAssembly compilation returns perfectly correct
 * headers and then hangs on the progress bar.
 *
 * So this runs on the CI runner, which can reach the deploy, and asserts what
 * actually matters: the loader appears, progress advances, WebAssembly is
 * permitted, and no CSP violation fires.
 *
 * Usage:  node scripts/verify-deployed-play.cjs https://example.netlify.app
 */
"use strict";

const fs = require("fs");

const site = (process.argv[2] || "").replace(/\/+$/, "");
if (!site) {
  console.error("usage: verify-deployed-play.cjs <site-url>");
  process.exit(2);
}

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? "  [" + detail + "]" : ""}`); }
};

(async () => {
  let chromium;
  try { ({ chromium } = require("playwright-core")); }
  catch {
    try { ({ chromium } = require("playwright")); }
    catch {
      console.log("SKIP  deployed-play: no playwright available.");
      process.exit(0);
    }
  }

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const cspViolations = [];
  const pageErrors = [];
  const failedRequests = [];

  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`);
    });
  });

  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("requestfailed", (r) => {
    const f = r.failure();
    failedRequests.push(`${r.url()} (${f ? f.errorText : "unknown"})`);
  });

  // --- the landing page first -----------------------------------------------
  const landing = await page.goto(`${site}/`, { waitUntil: "load", timeout: 60000 });
  ok("landing page responds 200", landing !== null && landing.status() === 200,
     landing ? String(landing.status()) : "no response");

  const cspHeader = landing ? landing.headers()["content-security-policy"] : undefined;
  ok("landing page is served with a CSP", typeof cspHeader === "string" && cspHeader.length > 0);
  ok("the deployed CSP has no 'unsafe-inline'",
     !!cspHeader && !/'unsafe-inline'/.test(cspHeader));
  await page.waitForTimeout(800);

  // --- the game -------------------------------------------------------------
  const playResp = await page
    .goto(`${site}/play/`, { waitUntil: "domcontentloaded", timeout: 90000 })
    .catch(() => null);

  ok("/play responds 200", playResp !== null && playResp.status() === 200,
     playResp ? String(playResp.status()) : "no response");

  const playCsp = playResp ? playResp.headers()["content-security-policy"] : undefined;
  ok("/play is served with a CSP", typeof playCsp === "string" && playCsp.length > 0);
  ok("/play's CSP permits WebAssembly compilation",
     !!playCsp && /'wasm-unsafe-eval'/.test(playCsp),
     playCsp ? playCsp.slice(0, 120) : "");

  // The Unity template renders a loading bar whose width it advances. Watching
  // it advance is the difference between "the page loaded" and "the game is
  // starting".
  const progressed = await page
    .waitForFunction(
      () => {
        const bar = document.querySelector("#bar-fill");
        if (!bar) return false;
        const w = parseFloat(bar.style.width || "0");
        return w > 0;
      },
      { timeout: 90000 },
    )
    .then(() => true)
    .catch(() => false);

  ok("the Unity loader appears and its progress bar advances", progressed);

  // WebAssembly.compile is what 'wasm-unsafe-eval' governs. If the CSP were
  // wrong this throws a CompileError/EvalError rather than resolving.
  const wasmOk = await page.evaluate(async () => {
    try {
      // The smallest valid wasm module: magic + version only.
      const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
      await WebAssembly.compile(bytes);
      return "ok";
    } catch (e) {
      return String(e);
    }
  });
  ok("WebAssembly.compile is permitted by the policy", wasmOk === "ok", String(wasmOk));

  // Give the real payload time to get well into loading before judging.
  await page.waitForTimeout(20000);

  const violations = await page.evaluate(() => window.__csp || []).catch(() => []);
  ok("no CSP violations on /play", violations.length === 0, violations.slice(0, 6).join(" | "));

  const realErrors = pageErrors.filter((e) => !/ResizeObserver/.test(e));
  ok("no uncaught page errors on /play", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

  const realFailures = failedRequests.filter((r) => !/favicon/.test(r));
  ok("no failed requests on /play", realFailures.length === 0, realFailures.slice(0, 4).join(" | "));

  const shot = process.env.PLAY_SCREENSHOT;
  if (shot) {
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    if (fs.existsSync(shot)) console.log(`\nscreenshot: ${shot}`);
  }

  await browser.close();

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("verify-deployed-play: " + ((e && e.stack) || e));
  process.exit(1);
});
