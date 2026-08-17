#!/usr/bin/env node
// QC: inspect the rigged GLBs in public/models and verify that a character's
// separate per-clip files actually share one skeleton.
//
// The provider rigs ONE clip per generation, so a character's states arrive as
// several GLBs. Playing them on a single mixer only works if every file rigged
// the same source to the same bone names — each call re-rigs independently, so
// that is an assumption, not a guarantee. This checks it directly instead of
// waiting for a silently broken animation in game.
//
// Zero dependencies: reads the glTF JSON chunk straight out of the GLB header.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DIR = path.join(__dirname, "..", "public", "models");

function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
  const jsonLen = b.readUInt32LE(12);
  return JSON.parse(b.slice(20, 20 + jsonLen).toString("utf8"));
}

/** Ordered joint names for each skin — the thing clips bind to. */
function skeletonOf(gltf) {
  const nodes = gltf.nodes || [];
  const skins = gltf.skins || [];
  return skins.map((s) => (s.joints || []).map((j) => (nodes[j] && nodes[j].name) || `#${j}`));
}

function hashOf(joints) {
  return crypto.createHash("sha1").update(JSON.stringify(joints)).digest("hex").slice(0, 12);
}

/** Which node names a clip actually animates. */
function clipTargets(gltf, anim) {
  const nodes = gltf.nodes || [];
  const seen = new Set();
  for (const ch of anim.channels || []) {
    const n = ch.target && ch.target.node;
    if (n !== undefined) seen.add((nodes[n] && nodes[n].name) || `#${n}`);
  }
  return seen;
}

const rows = [];
const add = (n, ok, x = "") => rows.push(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  [" + x + "]" : ""}`);

if (!fs.existsSync(DIR)) {
  console.log(`SKIP  verify-rig: ${DIR} not found.`);
  process.exit(0);
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".glb")).sort();
if (!files.length) {
  console.log("SKIP  verify-rig: no .glb files.");
  process.exit(0);
}

console.log("Model inventory\n");
const info = {};
for (const f of files) {
  const full = path.join(DIR, f);
  let gltf;
  try { gltf = readGlb(full); } catch (e) {
    add(`${f} parses as GLB`, false, e.message);
    continue;
  }
  const anims = (gltf.animations || []).map((a) => a.name || "(unnamed)");
  const skel = skeletonOf(gltf);
  const joints = skel[0] || [];
  const sizeMb = (fs.statSync(full).size / 1048576).toFixed(1);
  info[f.replace(/\.glb$/, "")] = { gltf, anims, joints, hash: joints.length ? hashOf(joints) : null };
  console.log(
    `  ${f.padEnd(24)} ${sizeMb.padStart(5)} MB  ` +
    `skins:${skel.length}  joints:${joints.length}  ` +
    `skel:${joints.length ? hashOf(joints) : "none"}  ` +
    `anims:${anims.length ? anims.join(", ") : "NONE"}`
  );
}
console.log("");

// Every rigged model must have SOME animation available. A baked clip counts, and
// so does the shared clip library — a mesh generated purely to be driven by
// shared clips carries no animation of its own, and that is the preferred shape.
const sharedClipCount = fs.existsSync(path.join(DIR, "clips"))
  ? fs.readdirSync(path.join(DIR, "clips")).filter((f) => f.endsWith(".clip.json")).length
  : 0;
for (const [name, m] of Object.entries(info)) {
  if (!m.joints.length) continue; // a static prop is not expected to animate
  const via = m.anims.length ? m.anims.join(", ") : sharedClipCount ? `${sharedClipCount} shared clips` : "none";
  add(`${name}: has an animation source`, m.anims.length > 0 || sharedClipCount > 0, via);
}

// Per-character skeleton compatibility: files sharing a prefix must share bones.
const groups = {};
for (const name of Object.keys(info)) {
  const base = name.split("_")[0];
  (groups[base] = groups[base] || []).push(name);
}
for (const [base, members] of Object.entries(groups)) {
  const rigged = members.filter((m) => info[m].joints.length);
  if (rigged.length < 2) continue;
  const hashes = new Set(rigged.map((m) => info[m].hash));
  add(
    `${base}: all ${rigged.length} files share one skeleton`,
    hashes.size === 1,
    hashes.size === 1 ? rigged.join(" + ") : rigged.map((m) => `${m}=${info[m].hash}`).join(" ")
  );

  // Clips must target bones that exist in the base rig, or they animate nothing.
  const baseJoints = new Set(info[rigged[0]].joints);
  for (const m of rigged.slice(1)) {
    for (const anim of info[m].gltf.animations || []) {
      const targets = clipTargets(info[m].gltf, anim);
      const missing = [...targets].filter((t) => !baseJoints.has(t));
      add(
        `${base}: clip '${anim.name || "(unnamed)"}' from ${m} binds to the base rig`,
        missing.length === 0,
        missing.length ? `${missing.length} unknown bones: ${missing.slice(0, 3).join(",")}` : `${targets.size} bones`
      );
    }
  }
}

// Cross-character clip sharing: same bone NAMES is not enough. Meshy emits an
// identical 24-bone humanoid for every mesh, but each rig keeps the source's
// limb proportions in its rest pose — and every clip animates translation on all
// 24 bones, so those lengths are baked per-frame. Playing one character's clip
// on another therefore squashes it into the donor's proportions. Reported here
// so the constraint stays visible when planning which clips to buy.
{
  const rigged = Object.entries(info).filter(([, m]) => m.joints.length);
  const restOf = (gltf) => {
    const joints = (gltf.skins?.[0]?.joints) || [];
    return joints.map((j) => (gltf.nodes[j].translation || [0, 0, 0]).map((v) => +v.toFixed(3)));
  };
  const byBase = {};
  for (const [name, m] of rigged) {
    const base = name.split("_")[0];
    (byBase[base] = byBase[base] || []).push([name, restOf(m.gltf)]);
  }
  const bases = Object.keys(byBase);
  if (bases.length > 1) {
    const sig = (r) => JSON.stringify(r);
    const first = byBase[bases[0]][0];
    const shareable = bases.every((b) => sig(byBase[b][0][1]) === sig(first[1]));
    console.log(shareable
      ? "NOTE  rest poses match across characters — clips are directly shareable."
      : "NOTE  rest poses DIFFER across characters — a clip bought for one actor cannot be\n      reused verbatim on another (translation tracks would retarget its proportions).\n      Strip translation tracks at load to share motions across rigs.");
    console.log("");
  }
}

// Shared clips (public/models/clips/*.clip.json). These are rotation-only
// quaternion tables meant to drive ANY rigged actor, so the checks that matter
// are: the table is the size the header claims, every quaternion is a unit
// quaternion (a truncated or misaligned decode shows up here immediately), and
// every bone the clip drives exists on every rigged skeleton we ship.
{
  const CLIPS = path.join(DIR, "clips");
  const clipFiles = fs.existsSync(CLIPS)
    ? fs.readdirSync(CLIPS).filter((f) => f.endsWith(".clip.json")).sort()
    : [];
  const riggedBones = Object.entries(info)
    .filter(([, m]) => m.joints.length)
    .map(([name, m]) => [name, new Set(m.joints)]);

  for (const f of clipFiles) {
    const name = f.replace(/\.clip\.json$/, "");
    const c = JSON.parse(fs.readFileSync(path.join(CLIPS, f), "utf8"));
    const buf = Buffer.from(c.quat, "base64");
    const expect = c.bones.length * c.frames * 4 * 2;
    add(`clip ${name}: table matches header`, buf.length === expect, `${buf.length}/${expect}`);
    if (buf.length !== expect) continue;

    const q = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
    let worst = 0;
    for (let i = 0; i < q.length; i += 4) {
      let sum = 0;
      for (let k = 0; k < 4; k++) { const v = q[i + k] / 32767; sum += v * v; }
      worst = Math.max(worst, Math.abs(Math.sqrt(sum) - 1));
    }
    add(`clip ${name}: quaternions are unit length`, worst < 0.01, `max err ${worst.toFixed(4)}`);

    // Loop seam: a cycle clip's last frame is meant to meet its first, and the
    // mixer wraps straight from one to the other. A large gap is a visible pop
    // every cycle — which is how a 4.2s "casual walk" take was caught reading as
    // a limp (5.5 degrees on LeftLeg) next to a true 1s cycle's 0.9.
    let seam = 0, seamBone = "";
    for (let i = 0; i < c.bones.length; i++) {
      const first = i * c.frames * 4;
      const last = first + (c.frames - 1) * 4;
      let dot = 0;
      for (let k = 0; k < 4; k++) dot += (q[first + k] / 32767) * (q[last + k] / 32767);
      const deg = (2 * Math.acos(Math.min(1, Math.abs(dot))) * 180) / Math.PI;
      if (deg > seam) { seam = deg; seamBone = c.bones[i]; }
    }
    add(`clip ${name}: loops without a pop`, seam < 3, `${seam.toFixed(1)}deg on ${seamBone}`);

    for (const [actor, bones] of riggedBones) {
      const missing = c.bones.filter((b) => !bones.has(b));
      add(`clip ${name}: drives ${actor}`, missing.length === 0,
        missing.length ? `${missing.length} unknown: ${missing.slice(0, 3).join(",")}` : `${c.bones.length} bones`);
    }
  }
}

console.log(rows.join("\n"));
const fails = rows.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${rows.length - fails}/${rows.length} rig checks passed`);
process.exit(fails ? 1 : 0);
