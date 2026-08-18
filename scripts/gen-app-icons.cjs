#!/usr/bin/env node
/**
 * Generates the PWA app icons as PNGs, with no image-library dependency.
 *
 * These are PLACEHOLDERS with the right shape, sizes and palette so the PWA
 * install flow is testable end to end in Phase 1. Replace the artwork before
 * launch — the generator stays useful for re-exporting whatever replaces it at
 * every required size.
 *
 * Design: an isometric tile — the game's core visual unit — drawn as a gold top
 * face with a darker extruded side, on the app's dark background. Rendered with
 * 4x supersampling because a hard-edged diamond aliases badly at 192px.
 *
 * Usage: node scripts/gen-app-icons.cjs [outDir]
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---------- palette (matches the WebGL template's CSS vars) ----------
const BG    = [0x1a, 0x16, 0x10];
const TOP   = [0xc9, 0xa2, 0x27];
const SIDE_L= [0x7a, 0x60, 0x16];   // left facet, in shadow
const SIDE_R= [0x9c, 0x7c, 0x1e];   // right facet, catching the sun
const EDGE  = [0xe8, 0xdc, 0xc8];

// ---------- PNG encoding ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array of size*size*4 */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  // Raw scanlines, each prefixed with filter type 0 (None).
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride)
      .copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- drawing ----------
/**
 * @param {number} size    output edge length in px
 * @param {number} inset   0..1 fraction of the canvas left as padding. Maskable
 *                         icons need a generous safe zone because launchers crop
 *                         them to a circle or squircle.
 */
function drawIcon(size, inset) {
  const SS = 4;                 // supersample factor
  const n = size * SS;
  const acc = new Float64Array(size * size * 4);

  const cx = n / 2;
  const cy = n / 2;
  const halfW = (n / 2) * (1 - inset);        // diamond half-width
  const halfH = halfW / 2;                     // 2:1 isometric
  const depth = halfH * 0.55;                  // extrusion depth
  const yOff = -depth / 2;                     // lift so the solid is centred

  const inDiamond = (x, y, ox, oy) =>
    Math.abs(x - cx) / halfW + Math.abs(y - (cy + oy)) / halfH <= 1;

  for (let sy = 0; sy < n; sy++) {
    for (let sx = 0; sx < n; sx++) {
      let c;

      const topFace = inDiamond(sx, sy, 0, yOff);
      // The extruded body is the top diamond swept downward by `depth`: a point
      // is on a side facet if it falls inside the diamond translated anywhere
      // between 0 and `depth`, which reduces to testing the lowest translate.
      const lowFace = inDiamond(sx, sy, 0, yOff + depth);

      if (topFace) {
        // Outline only the two upper facets. Carrying the highlight around the
        // bottom edges too would draw a bright seam between the top and the
        // sides, which reads as two stacked plates rather than one solid tile.
        const edgeDist = Math.abs(sx - cx) / halfW + Math.abs(sy - (cy + yOff)) / halfH;
        c = (edgeDist > 0.93 && sy <= cy + yOff) ? EDGE : TOP;
      } else if (lowFace && sy > cy + yOff) {
        // Two-tone sides: the classic isometric read of a solid volume comes
        // from the left and right facets differing in value, not from an outline.
        c = sx < cx ? SIDE_L : SIDE_R;
      } else {
        c = BG;
      }

      // Accumulate into the destination pixel.
      const dx = (sx / SS) | 0;
      const dy = (sy / SS) | 0;
      const di = (dy * size + dx) * 4;
      acc[di]     += c[0];
      acc[di + 1] += c[1];
      acc[di + 2] += c[2];
      acc[di + 3] += 255;
    }
  }

  const samples = SS * SS;
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(acc[i] / samples);
  return out;
}

// ---------- main ----------
const outDir = process.argv[2] || path.join(__dirname, "..", "unity", "Assets", "WebGLTemplates", "IsoperiaPWA", "icons");
fs.mkdirSync(outDir, { recursive: true });

// inset 0.10 for regular icons; 0.28 for maskable, whose outer ~20% can be cropped.
const targets = [
  { name: "icon-180.png", size: 180, inset: 0.10 },  // apple-touch-icon
  { name: "icon-192.png", size: 192, inset: 0.10 },
  { name: "icon-512.png", size: 512, inset: 0.10 },
  { name: "icon-maskable-512.png", size: 512, inset: 0.28 },
  { name: "favicon-32.png", size: 32, inset: 0.06 },
];

for (const t of targets) {
  const png = encodePng(t.size, drawIcon(t.size, t.inset));
  fs.writeFileSync(path.join(outDir, t.name), png);
  console.log(`icons: ${t.name.padEnd(24)} ${String(t.size).padStart(3)}px  ${(png.length / 1024).toFixed(1)} kB`);
}
console.log(`icons: wrote ${targets.length} files to ${path.relative(process.cwd(), outDir)}`);
