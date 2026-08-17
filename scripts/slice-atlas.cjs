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
// Every generated sheet ships with a flat parchment-tan card behind each
// item (asking the model for a transparent background does not reliably
// produce real alpha — it just paints a checkerboard or white square). Cut
// that out here instead: classify every pixel by colour distance to a set
// of border-patch samples (binned to drop stray art-bleed outliers), force
// the card's own margin/outline into the cut unconditionally, then flood
// that classification inward from there so a background-coloured pixel
// trapped inside the object doesn't punch a stray hole. A sanity net bails
// out to the uncut original if the result looks like the object vanished
// too. See the comments on cutoutBackground() for the failed approaches
// this replaced. Pass --no-cutout to keep the card (useful for eyeballing a
// sheet before deciding the crop is right).
//
// Manifest shape (JSON):
//   {
//     "cols": 4, "rows": 4,
//     "cells": ["normal_log", "oak_log", ..., null, null]   // row-major,
//                                                             // null = skip
//   }
//
// Usage:
//   node scripts/slice-atlas.cjs <sheet.png> <manifest.json> <out-dir> [--size 64] [--no-cutout]
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
async function sliceSheet(sheetBuf, manifest, outSize, cutout = true) {
  let playwright;
  try { playwright = require("playwright"); } catch { return null; }
  const exe = process.env.CHROME_PATH || findChrome();
  const browser = await playwright.chromium.launch({
    args: ["--no-sandbox", "--headless=new"],
    ...(exe ? { executablePath: exe } : {}),
  });
  try {
    const page = await browser.newPage();
    page.on("console", (msg) => { if (msg.type() === "warning") console.warn(msg.text()); });
    const cells = manifest.cells.map((name, i) => ({ name, row: Math.floor(i / manifest.cols), col: i % manifest.cols }))
      .filter((c) => c.name);
    const out = await page.evaluate(async ({ data, cols, rows, cells, outSize, cutout }) => {
      const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
      const bmp = await createImageBitmap(blob);
      const cellW = Math.round(bmp.width / cols), cellH = Math.round(bmp.height / rows);

      // Cut the card background to transparent. First pass classifies every
      // pixel by colour distance to a handful of border-patch samples — NOT
      // chained neighbour-to-neighbour, on purpose: a first version did that
      // (a BFS "magic wand" growing through near-in-colour neighbours) and it
      // leaked straight through the object's own anti-aliased edge — a rim of
      // pixels blending tan into red is a chain of small steps even though
      // tan and red are nowhere near each other, so the fill walked right
      // into the object and ate it whole. Comparing every pixel against
      // fixed reference samples instead has no chain to leak through. Second
      // pass flood-fills *through that classification* from the border, so
      // a background-coloured pixel trapped inside the object (unlikely, but
      // possible by coincidence) doesn't punch a stray hole.
      function cutoutBackground(imgData, w, h) {
        const px = imgData.data;
        const THRESH = 46; // colour distance to the nearest reference sample
        const idx = (x, y) => y * w + x;
        const patch = (cx, cy) => {
          let r = 0, g = 0, b = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            const i = idx(x, y) * 4;
            r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
          }
          return [r / n, g / n, b / n];
        };
        // Dense reference set: every few pixels around the whole perimeter,
        // not a handful of fixed points — a vignette darkens gradually
        // around the edge, and 8 fixed samples missed enough of that
        // gradient to leave large uncut patches near cell corners.
        //
        // A single "reject outliers, collapse to one median colour" pass
        // (tried first) breaks whenever a cell legitimately has TWO
        // background populations on its border — e.g. the coins icon's
        // drop shadow occupies the entire bottom and right edges while the
        // top and left stay plain card tan. Rejecting either half as an
        // "outlier" from the other's median then makes half the real
        // background fail classification. Keeping every raw sample with no
        // rejection at all (tried second) breaks the other way: enough
        // metal/tan/pink items have SOME surface colour within THRESH of
        // some card sample that whole icons (pickaxes, potato, cooked meat)
        // got fully erased and fell back to the sanity net below.
        //
        // Middle ground: bin the raw samples by colour and keep only bins
        // that are a real population on this border (>=3% of samples) —
        // this keeps both a majority tan cluster AND a large minority
        // shadow cluster (legit multi-modal background), while dropping the
        // handful of stray samples where the item's own art happened to
        // bleed to the crop edge (too rare to form a real bin).
        //
        // One whole sheet (resources) draws every card with a thin (~4px)
        // dark rounded-rect outline stroke right at the crop edge — sampling
        // the literal edge picked up that stroke, not the tan fill behind
        // it, so every reference on that sheet was "dark outline" and
        // nothing on the card matched it (0% cut across all 16 icons).
        // Sample a few pixels inward instead: past any such stroke, still
        // well inside genuine background on sheets that have no stroke at
        // all.
        // 8px cleared the ~4px outline on the resources sheet but wasn't
        // enough for the misc/keys/pets sheet's ~10px outline — four items
        // there stayed uncut past the forced margin. 14px clears both with
        // room to spare and is still under 3% of a 512px cell.
        const INSET = 14;
        const rawRefs = [];
        const STEP = 3;
        for (let x = INSET; x < w - INSET; x += STEP) { rawRefs.push(patch(x, INSET)); rawRefs.push(patch(x, h - 1 - INSET)); }
        for (let y = INSET; y < h - INSET; y += STEP) { rawRefs.push(patch(INSET, y)); rawRefs.push(patch(w - 1 - INSET, y)); }
        const binKey = ([r, g, b]) => `${Math.round(r / 16)},${Math.round(g / 16)},${Math.round(b / 16)}`;
        const binCounts = new Map();
        for (const p of rawRefs) binCounts.set(binKey(p), (binCounts.get(binKey(p)) ?? 0) + 1);
        const minBin = Math.max(3, rawRefs.length * 0.03);
        const refs = rawRefs.filter((p) => binCounts.get(binKey(p)) >= minBin);
        const nearRef = (i) => {
          const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
          let best = Infinity;
          for (const [rr, rg, rb] of refs) {
            const d = Math.sqrt((r - rr) ** 2 + (g - rg) ** 2 + (b - rb) ** 2);
            if (d < best) { best = d; if (best <= THRESH) break; }
          }
          return best <= THRESH;
        };
        const candidate = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) if (nearRef(i)) candidate[i] = 1;

        // Flood-fill from the border. The whole INSET-wide margin is forced
        // into the cut unconditionally, not gated on `candidate` — sheets
        // that draw a thin dark card outline right at the crop edge put a
        // colour there for the outline's full ~4px width that (correctly)
        // doesn't match the tan fill. Seeding only the literal 1px edge and
        // gating growth on candidate() got the flood stuck immediately: the
        // very next pixel inward was still outline, so it could never step
        // past that ring to reach the real tan candidates on the other
        // side. The outline is decorative card chrome, never the item, so
        // it's always safe to remove outright. Past that forced margin,
        // growth into the interior still only steps onto a candidate pixel
        // — that's what keeps a coincidental interior match from becoming a
        // hole, without reintroducing the chain-leak above.
        const bg = new Uint8Array(w * h);
        const queue = [];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (x < INSET || x >= w - INSET || y < INSET || y >= h - INSET) {
              const i = idx(x, y);
              bg[i] = 1;
              queue.push(i);
            }
          }
        }
        let head = 0;
        while (head < queue.length) {
          const i = queue[head++];
          if (!bg[i]) continue;
          const x = i % w, y = (i / w) | 0;
          for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = idx(nx, ny);
            if (bg[ni] || !candidate[ni]) continue;
            bg[ni] = 1; queue.push(ni);
          }
        }

        // Second pass: a soft drop shadow under the item is a desaturated,
        // darkened patch of background that often doesn't touch the card's
        // own edge (the item sits on top of it), so pass one never reaches
        // it. Grow once more from the cut region into low-saturation
        // neighbours within a looser tolerance — shadows qualify, saturated
        // item colours don't.
        const sat = (i) => {
          const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          return mx === 0 ? 0 : (mx - mn) / mx;
        };
        const shadowQueue = [...queue].filter((i) => bg[i]);
        head = 0;
        while (head < shadowQueue.length) {
          const i = shadowQueue[head++];
          const x = i % w, y = (i / w) | 0;
          for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = idx(nx, ny);
            if (bg[ni]) continue;
            if (sat(ni) < 0.18 && nearRefLoose(ni)) { bg[ni] = 1; shadowQueue.push(ni); }
          }
        }
        function nearRefLoose(i) {
          const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
          for (const [rr, rg, rb] of refs) {
            if (Math.sqrt((r - rr) ** 2 + (g - rg) ** 2 + (b - rb) ** 2) <= THRESH * 1.8) return true;
          }
          return false;
        }
        // Feather: an opaque pixel touching a background one loses partial
        // alpha, so the cut edge anti-aliases instead of stair-stepping.
        const alpha = new Float32Array(w * h).fill(1);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = idx(x, y);
            if (bg[i]) { alpha[i] = 0; continue; }
            let bgNeighbors = 0;
            for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              if (bg[idx(nx, ny)]) bgNeighbors++;
            }
            if (bgNeighbors > 0) alpha[i] = 1 - bgNeighbors * 0.22;
          }
        }
        for (let i = 0; i < w * h; i++) px[i * 4 + 3] = Math.round(px[i * 4 + 3] * Math.max(0, alpha[i]));

        // Sanity net: bin-filtering the reference set (above) still isn't
        // bulletproof against art bleeding into the border — bail out to
        // the original (uncut) pixels rather than ship a fully-erased icon.
        // The threshold has to stay very low, though: a handful of seeds or
        // a small pet scattered on a big card is a legitimate icon that
        // rightly leaves well under 8% of the cell opaque, and an 8% floor
        // was bailing those out as if they were failures. 0.5% only catches
        // the genuine "the whole card matched and the object vanished too"
        // case.
        let opaque = 0;
        for (let i = 0; i < w * h; i++) if (bg[i] === 0) opaque++;
        if (opaque / (w * h) < 0.005) return null;
        return imgData;
      }

      const results = {};
      for (const { name, row, col } of cells) {
        const native = document.createElement("canvas");
        native.width = cellW; native.height = cellH;
        const nctx = native.getContext("2d");
        nctx.drawImage(bmp, col * cellW, row * cellH, cellW, cellH, 0, 0, cellW, cellH);
        if (cutout) {
          const imgData = nctx.getImageData(0, 0, cellW, cellH);
          const cut = cutoutBackground(imgData, cellW, cellH);
          if (cut) nctx.putImageData(cut, 0, 0);
          else console.warn(`slice-atlas: cutout looked like a false positive for "${name}" (<8% opaque) — kept the card background`);
        }
        const out = document.createElement("canvas");
        out.width = outSize; out.height = outSize;
        out.getContext("2d").drawImage(native, 0, 0, cellW, cellH, 0, 0, outSize, outSize);
        results[name] = out.toDataURL("image/png").split(",")[1];
      }
      return results;
    }, { data: sheetBuf.toString("base64"), cols: manifest.cols, rows: manifest.rows, cells, outSize, cutout });
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
  const cutout = !process.argv.includes("--no-cutout");

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

  const bufs = await sliceSheet(sheetBuf, manifest, outSize, cutout);
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
