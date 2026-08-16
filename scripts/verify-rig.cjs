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

// Every model that is meant to animate must actually carry a clip.
for (const [name, m] of Object.entries(info)) {
  if (name === "hero") continue; // the un-rigged original is a known static mesh
  add(`${name}: has at least one animation clip`, m.anims.length > 0, m.anims.join(", ") || "none");
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

console.log(rows.join("\n"));
const fails = rows.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${rows.length - fails}/${rows.length} rig checks passed`);
process.exit(fails ? 1 : 0);
