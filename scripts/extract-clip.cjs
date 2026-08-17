#!/usr/bin/env node
// Extract an animation from a rigged GLB into a shared .clip.json.
//
// Rigging services bake each animation into a complete GLB — mesh, skeleton and
// textures — which is ~20 MB for a walk cycle on a mesh we already ship. Every
// character in this game uses the same 24-bone skeleton, so the motion is the
// only new information in that file. This pulls it out.
//
// The output is rotation only. That is what lets one clip drive every actor:
// translation tracks carry the donor's limb proportions, so replaying them on a
// different rig drags it into the donor's build (see retargetable() in Model.ts,
// and the rest-pose warning verify-rig prints).
//
// Usage:
//   node scripts/extract-clip.cjs <input.glb> [--anim <name>] [--out <name>] [--fps 20]
//   node scripts/extract-clip.cjs <input.glb> --list
//
// Writes public/models/clips/<name>.clip.json. Run `npm test` afterwards:
// verify-rig checks the table size, that every quaternion is unit length, and
// that the clip's bones exist on every rigged skeleton we ship.
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "public", "models", "clips");

function parseGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
  const binLen = buf.readUInt32LE(20 + jsonLen);
  const bin = buf.slice(20 + jsonLen + 8, 20 + jsonLen + 8 + binLen);
  return { json, bin };
}

const COMPONENT = { 5126: ["readFloatLE", 4], 5123: ["readUInt16LE", 2], 5125: ["readUInt32LE", 4] };
const COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor({ json, bin }, index) {
  const a = json.accessors[index];
  const view = json.bufferViews[a.bufferView];
  const [reader, size] = COMPONENT[a.componentType];
  const n = COUNT[a.type];
  const start = (view.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Float64Array(a.count * n);
  for (let i = 0; i < out.length; i++) out[i] = bin[reader](start + i * size);
  return out;
}

/**
 * Sample a quaternion curve at an arbitrary time.
 *
 * Normalized lerp rather than true slerp: source keys are dense (30 fps or
 * better), so the arc between neighbours is small and the difference is not
 * visible. The sign flip matters though — q and -q are the same rotation, and
 * lerping across a sign boundary swings the bone the long way round.
 */
function sampleQuat(times, values, t) {
  const n = times.length;
  if (t <= times[0]) return [values[0], values[1], values[2], values[3]];
  if (t >= times[n - 1]) { const o = (n - 1) * 4; return [values[o], values[o + 1], values[o + 2], values[o + 3]]; }
  let hi = 1;
  while (hi < n - 1 && times[hi] < t) hi++;
  const lo = hi - 1;
  const span = times[hi] - times[lo];
  const f = span > 0 ? (t - times[lo]) / span : 0;

  const a = values.slice(lo * 4, lo * 4 + 4);
  let b = values.slice(hi * 4, hi * 4 + 4);
  if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0) b = b.map((v) => -v);

  const q = [0, 0, 0, 0];
  let len = 0;
  for (let i = 0; i < 4; i++) { q[i] = a[i] + (b[i] - a[i]) * f; len += q[i] * q[i]; }
  len = Math.sqrt(len) || 1;
  return q.map((v) => v / len);
}

function main() {
  const args = process.argv.slice(2);
  const file = args[0];
  if (!file) {
    console.error("usage: extract-clip.cjs <input.glb> [--anim <name>] [--out <name>] [--fps 20] [--list]");
    process.exit(2);
  }
  const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const glb = parseGlb(file);
  const { json } = glb;
  const anims = json.animations || [];

  if (args.includes("--list") || !anims.length) {
    console.log(`${path.basename(file)} — ${anims.length} animation(s)`);
    for (const a of anims) {
      let dur = 0;
      for (const s of a.samplers) { const acc = json.accessors[s.input]; if (acc.max) dur = Math.max(dur, acc.max[0]); }
      console.log(`  ${a.name}  ${a.channels.length} channels  ${dur.toFixed(2)}s`);
    }
    return;
  }

  const wanted = flag("anim");
  const anim = wanted ? anims.find((a) => a.name === wanted) : anims[0];
  if (!anim) throw new Error(`no animation named "${wanted}" (have: ${anims.map((a) => a.name).join(", ")})`);

  // Collect the rotation curve for every bone the clip actually turns.
  const curves = [];
  let duration = 0;
  for (const ch of anim.channels) {
    const sampler = anim.samplers[ch.sampler];
    const times = readAccessor(glb, sampler.input);
    duration = Math.max(duration, times[times.length - 1]);
    if (ch.target.path !== "rotation") continue;
    const values = readAccessor(glb, sampler.output);
    // A bone that holds one rotation for the whole clip carries no information.
    let moves = false;
    for (let i = 4; i < values.length && !moves; i++) if (Math.abs(values[i] - values[i % 4]) > 0.004) moves = true;
    if (!moves) continue;
    curves.push({ bone: json.nodes[ch.target.node].name, times, values });
  }
  if (!curves.length) throw new Error(`"${anim.name}" has no moving rotation tracks`);

  const fps = Number(flag("fps", 20));
  // Frames span [0, duration] inclusive; a looping clip's last frame is meant to
  // meet its first, which the mixer handles by wrapping.
  const frames = Math.max(2, Math.round(duration * fps) + 1);

  const table = new Int16Array(curves.length * frames * 4);
  let o = 0;
  for (const c of curves) {
    for (let f = 0; f < frames; f++) {
      const q = sampleQuat(c.times, c.values, (f / (frames - 1)) * duration);
      for (let i = 0; i < 4; i++) table[o++] = Math.round(Math.max(-1, Math.min(1, q[i])) * 32767);
    }
  }

  const name = flag("out", anim.name.replace(/[^A-Za-z0-9]+/g, "_").toLowerCase());
  const out = {
    name: anim.name,
    duration: +duration.toFixed(4),
    fps: +((frames - 1) / duration).toFixed(4),
    frames,
    bones: curves.map((c) => c.bone),
    quat: Buffer.from(table.buffer).toString("base64"),
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dest = path.join(OUT_DIR, `${name}.clip.json`);
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(
    `${name}.clip.json — ${curves.length} bones x ${frames} frames ` +
    `(${duration.toFixed(2)}s @ ${out.fps.toFixed(1)}fps), ${(fs.statSync(dest).size / 1024).toFixed(1)} kB`
  );
}

main();
