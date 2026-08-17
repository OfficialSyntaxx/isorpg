#!/usr/bin/env node
// Slice a generated grid-sheet image into named per-item icon PNGs.
//
// H.1 of the roadmap: one generated image containing a grid of icons is far
// cheaper and more visually consistent than generating 60+ items one at a
// time. This is the other half of that plan — turning one sheet into a set
// of files itemIcon() can serve, driven by a JSON manifest that says which
// grid cell is which item.
//
// Decoding happens in headless Chromium, the same trick optimize-glb.cjs
// uses for texture recompression: no native image library to install, and
// it reads whatever format the browser reads. Cropping is plain canvas
// drawImage with a source rect — nothing clever, which is the point; a
// wrong crop should be a manifest bug, not a math bug.
//
// Manifest shape (JSON):
//   {
//     "cols": 4, "rows": 4,
//     "cells": ["normal_log", "oak_log", ..., null, null]   // row-major,
//                                                             // null = skip
//   }
//
// Usage:
//   node scripts/slice-atlas.cjs <sheet.png> <manifest.json> <out-dir> [--size 64]
const fs = require("fs");
const path = require("path");

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

/** Crop every named cell out of `sheetBuf` and return { name: Buffer(png) }. */
async function sliceSheet(sheetBuf, manifest, outSize) {
  let playwright;
  try { playwright = require("playwright"); } catch { return null; }
  const exe = process.env.CHROME_PATH || findChrome();
  const browser = await playwright.chromium.launch({
    args: ["--no-sandbox", "--headless=new"],
    ...(exe ? { executablePath: exe } : {}),
  });
  try {
    const page = await browser.newPage();
    const cells = manifest.cells.map((name, i) => ({ name, row: Math.floor(i / manifest.cols), col: i % manifest.cols }))
      .filter((c) => c.name);
    const out = await page.evaluate(async ({ data, cols, rows, cells, outSize }) => {
      const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
      const bmp = await createImageBitmap(blob);
      const cellW = bmp.width / cols, cellH = bmp.height / rows;
      const results = {};
      for (const { name, row, col } of cells) {
        const c = document.createElement("canvas");
        c.width = outSize; c.height = outSize;
        const ctx = c.getContext("2d");
        ctx.drawImage(bmp, col * cellW, row * cellH, cellW, cellH, 0, 0, outSize, outSize);
        results[name] = c.toDataURL("image/png").split(",")[1];
      }
      return results;
    }, { data: sheetBuf.toString("base64"), cols: manifest.cols, rows: manifest.rows, cells, outSize });
    const bufs = {};
    for (const [name, b64] of Object.entries(out)) bufs[name] = Buffer.from(b64, "base64");
    return bufs;
  } finally {
    await browser.close();
  }
}

async function main() {
  const [sheetPath, manifestPath, outDir] = process.argv.slice(2);
  if (!sheetPath || !manifestPath || !outDir) {
    console.error("usage: slice-atlas.cjs <sheet.png> <manifest.json> <out-dir> [--size 64]");
    process.exit(2);
  }
  const flag = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
  const outSize = Number(flag("size", 64));

  const sheetBuf = fs.readFileSync(sheetPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest.cols || !manifest.rows || !Array.isArray(manifest.cells)) {
    console.error("slice-atlas: manifest needs cols, rows, and a cells array");
    process.exit(2);
  }
  if (manifest.cells.length !== manifest.cols * manifest.rows) {
    console.error(`slice-atlas: manifest declares ${manifest.cols}x${manifest.rows}` +
      ` = ${manifest.cols * manifest.rows} cells but lists ${manifest.cells.length}`);
    process.exit(2);
  }

  const bufs = await sliceSheet(sheetBuf, manifest, outSize);
  if (!bufs) {
    console.error("slice-atlas: playwright/chromium unavailable — cannot decode the sheet.");
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, buf] of Object.entries(bufs)) {
    fs.writeFileSync(path.join(outDir, `${name}.png`), buf);
  }
  console.log(`slice-atlas: wrote ${Object.keys(bufs).length} icon(s) to ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { sliceSheet };
