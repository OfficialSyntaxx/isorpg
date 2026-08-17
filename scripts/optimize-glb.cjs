#!/usr/bin/env node
// Shrink a rigged GLB for a game where actors render ~40 px tall.
//
// Character GLBs from rigging services are overwhelmingly texture: a 2048px PNG
// is routinely 90%+ of the file. Recompressing to a 512px JPEG took this
// project's model set from 21.5 MB to 1.53 MB with no visible change — every
// material here is alphaMode OPAQUE, so there is no alpha to lose.
//
// Baked animations are dropped by default: clips ship separately as .clip.json
// (see extract-clip.cjs), so a mesh only needs its skin.
//
// Decoding happens in headless Chromium, which is already present for the smoke
// test — no native image toolchain to install, and it reads every format the
// browser will read at runtime, which is the only compatibility that matters.
//
// Usage:
//   node scripts/optimize-glb.cjs <in.glb> <out.glb> [--size 512] [--quality 0.85] [--keep-anims]
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

function parseGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
  const binLen = buf.readUInt32LE(20 + jsonLen);
  return { json, bin: buf.slice(20 + jsonLen + 8, 20 + jsonLen + 8 + binLen), size: buf.length };
}

function writeGlb(json, bin, dest) {
  let js = Buffer.from(JSON.stringify(json), "utf8");
  if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
  const binPad = bin.length % 4 ? Buffer.alloc(4 - (bin.length % 4)) : Buffer.alloc(0);
  const chunk = (len, tag) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(tag, 4); return h; };
  const body = Buffer.concat([
    chunk(js.length, 0x4e4f534a), js,
    chunk(bin.length + binPad.length, 0x004e4942), bin, binPad,
  ]);
  const head = Buffer.alloc(12);
  head.write("glTF", 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + body.length, 8);
  fs.writeFileSync(dest, Buffer.concat([head, body]));
}

async function recompress(images, maxSize, quality) {
  let playwright;
  try { playwright = require("playwright"); } catch { return null; }
  const exe = process.env.CHROME_PATH || findChrome();
  const browser = await playwright.chromium.launch({
    args: ["--no-sandbox", "--headless=new"],
    ...(exe ? { executablePath: exe } : {}),
  });
  try {
    const page = await browser.newPage();
    const out = [];
    for (const img of images) {
      const b64 = await page.evaluate(async ({ data, mime, maxSize, quality }) => {
        const blob = await (await fetch(`data:${mime};base64,${data}`)).blob();
        const bmp = await createImageBitmap(blob);
        const s = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(bmp.width * s));
        c.height = Math.max(1, Math.round(bmp.height * s));
        const ctx = c.getContext("2d");
        // JPEG has no alpha; paint white first so any transparent pixel lands on
        // a defined colour instead of whatever the encoder leaves behind.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(bmp, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", quality).split(",")[1];
      }, { data: img.toString("base64"), mime: "image/png", maxSize, quality });
      out.push(Buffer.from(b64, "base64"));
    }
    return out;
  } finally {
    await browser.close();
  }
}

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("usage: optimize-glb.cjs <in.glb> <out.glb> [--size 512] [--quality 0.85] [--keep-anims]");
    process.exit(2);
  }
  const flag = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
  const maxSize = Number(flag("size", 512));
  const quality = Number(flag("quality", 0.85));
  const keepAnims = process.argv.includes("--keep-anims");

  const { json, bin, size } = parseGlb(input);
  const views = json.bufferViews;
  const images = json.images || [];

  const source = images.map((i) => {
    const v = views[i.bufferView];
    return bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  });
  const packed = images.length ? await recompress(source, maxSize, quality) : [];
  if (images.length && !packed) {
    console.error("optimize-glb: playwright/chromium unavailable — cannot recompress textures.");
    process.exit(1);
  }

  if (!keepAnims) delete json.animations;

  // Keep only the bufferViews still referenced, then repack the binary chunk.
  const keep = new Set();
  for (const a of json.accessors || []) if (a.bufferView !== undefined) keep.add(a.bufferView);
  for (const i of images) keep.add(i.bufferView);
  const order = [...keep].sort((a, b) => a - b);
  const remap = new Map(order.map((v, i) => [v, i]));
  const imageAt = new Map(images.map((img, i) => [img.bufferView, i]));

  const parts = [];
  let off = 0;
  const newViews = order.map((idx) => {
    const v = views[idx];
    const data = imageAt.has(idx)
      ? packed[imageAt.get(idx)]
      : bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const pad = (4 - (off % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
    const nv = { buffer: 0, byteOffset: off, byteLength: data.length };
    if (v.byteStride !== undefined) nv.byteStride = v.byteStride;
    if (v.target !== undefined) nv.target = v.target;
    parts.push(data);
    off += data.length;
    return nv;
  });

  for (const a of json.accessors || []) if (a.bufferView !== undefined) a.bufferView = remap.get(a.bufferView);
  for (const i of images) { i.bufferView = remap.get(i.bufferView); i.mimeType = "image/jpeg"; delete i.uri; }
  json.bufferViews = newViews;
  const newBin = Buffer.concat(parts);
  json.buffers = [{ byteLength: newBin.length }];

  writeGlb(json, newBin, output);
  const after = fs.statSync(output).size;
  console.log(
    `${path.basename(input)} ${(size / 1048576).toFixed(2)} MB → ` +
    `${path.basename(output)} ${(after / 1024).toFixed(0)} kB ` +
    `(${(100 - (after / size) * 100).toFixed(0)}% smaller)`
  );
}

main().catch((e) => { console.error(e.message); process.exit(1); });
