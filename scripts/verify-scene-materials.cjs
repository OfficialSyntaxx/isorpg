#!/usr/bin/env node
/**
 * Fails if any renderer in the bootstrap scene has no material.
 *
 * A missing material is Unity's magenta, and it is invisible everywhere a build
 * is normally checked: the build succeeds, the deploy succeeds, the headers
 * pass, the render pipeline is correctly assigned, and every material asset on
 * disk is valid. The only symptom is on screen. Three of the five reference
 * cubes shipped that way because Paint() deleted and recreated its material
 * asset per call, orphaning the references of every object that shared a name.
 *
 * This runs on the scene FILE, so it needs no Unity, no licence and no Editor —
 * which means it can gate every push in seconds rather than waiting for a
 * 20-minute build to tell us something a text file already knew.
 *
 * The count matters as much as the nulls: four cubes share ReferenceStone, so
 * the scene must carry SEVEN references to FOUR materials. A count of four
 * looks tidy and is exactly what the bug produced.
 */
const fs = require("fs");
const path = require("path");

const SCENE = "unity/Assets/Isoperia/Scenes/Bootstrap.unity";
const MATERIALS_DIR = "unity/Assets/Isoperia/Materials";

// URP's Lit.shader. Pinned because a material that silently falls back to the
// built-in Standard shader under URP renders magenta just as reliably as a
// missing one does.
const URP_LIT_GUID = "933532a4fcc9baf4fa0491de14d08ed7";

let failures = 0;
const fail = (msg) => { console.error(`FAIL  ${msg}`); failures++; };
const pass = (msg) => console.log(`PASS  ${msg}`);

if (!fs.existsSync(SCENE)) {
  console.error(`FAIL  ${SCENE} does not exist`);
  process.exit(1);
}

const scene = fs.readFileSync(SCENE, "utf8");

// Each renderer serializes an m_Materials list. Collect the entries following
// each one until the list ends (the next key at the same or lower indent).
const blocks = [];
const lines = scene.split("\n");
for (let i = 0; i < lines.length; i++) {
  if (!/^\s*m_Materials:/.test(lines[i])) continue;
  const entries = [];
  for (let j = i + 1; j < lines.length; j++) {
    const m = lines[j].match(/^\s*-\s*\{fileID:\s*(-?\d+)(?:,\s*guid:\s*([0-9a-f]+))?/);
    if (!m) break;
    entries.push({ fileID: m[1], guid: m[2] || null });
  }
  blocks.push(entries);
}

if (blocks.length === 0) fail("no m_Materials lists found — is this a scene file?");

const EXPECTED_RENDERERS = 7;   // ground + 5 cubes + capsule
const EXPECTED_REFS = 7;        // one per renderer; 4 of them share ReferenceStone

if (blocks.length === EXPECTED_RENDERERS) {
  pass(`${blocks.length} renderers in the scene`);
} else {
  fail(`expected ${EXPECTED_RENDERERS} renderers, found ${blocks.length}. ` +
       `If the scene legitimately changed, update EXPECTED_RENDERERS here — ` +
       `deliberately, so the count stays a real assertion.`);
}

let refs = 0;
blocks.forEach((entries, idx) => {
  if (entries.length === 0) {
    fail(`renderer #${idx} has no material slots — it would render magenta`);
    return;
  }
  entries.forEach((e, slot) => {
    if (e.fileID === "0" && !e.guid) {
      fail(`renderer #${idx} slot ${slot} is {fileID: 0} — no material, renders magenta. ` +
           `If several objects share a material name, check Paint is not ` +
           `recreating the asset and orphaning the earlier references.`);
    } else {
      refs++;
    }
  });
});

if (failures === 0) pass(`${refs} material references, none null`);

if (refs === EXPECTED_REFS) {
  pass(`${refs} references across ${EXPECTED_RENDERERS} renderers`);
} else if (failures === 0) {
  fail(`expected ${EXPECTED_REFS} material references, found ${refs}`);
}

// Every generated material must be on the URP Lit shader.
if (fs.existsSync(MATERIALS_DIR)) {
  const mats = fs.readdirSync(MATERIALS_DIR).filter((f) => f.endsWith(".mat"));
  if (mats.length === 0) fail(`${MATERIALS_DIR} contains no .mat files`);

  for (const name of mats) {
    const body = fs.readFileSync(path.join(MATERIALS_DIR, name), "utf8");
    const m = body.match(/m_Shader:\s*\{fileID:\s*-?\d+,\s*guid:\s*([0-9a-f]+)/);
    if (!m) {
      fail(`${name} has no shader reference`);
    } else if (m[1] !== URP_LIT_GUID) {
      fail(`${name} is on shader guid ${m[1]}, expected URP Lit (${URP_LIT_GUID}). ` +
           `A non-URP shader under URP renders magenta.`);
    }
  }
  if (failures === 0) pass(`all ${mats.length} materials on the URP Lit shader`);

  // Every guid the scene references must resolve to a material that exists.
  const known = new Set(
    mats.map((n) => {
      const meta = path.join(MATERIALS_DIR, `${n}.meta`);
      if (!fs.existsSync(meta)) return null;
      const m = fs.readFileSync(meta, "utf8").match(/^guid:\s*([0-9a-f]+)/m);
      return m ? m[1] : null;
    }).filter(Boolean)
  );

  const dangling = new Set();
  blocks.flat().forEach((e) => { if (e.guid && !known.has(e.guid)) dangling.add(e.guid); });

  if (dangling.size > 0) {
    fail(`scene references ${dangling.size} material guid(s) with no asset on disk: ` +
         `${[...dangling].join(", ")}. These render magenta.`);
  } else if (failures === 0) {
    pass("every referenced material guid resolves to an asset on disk");
  }
} else {
  fail(`${MATERIALS_DIR} does not exist`);
}

console.log(failures === 0 ? "\nscene materials OK" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
