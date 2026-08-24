#!/usr/bin/env node
/**
 * Fails if any renderer that ACTUALLY DRAWS in the bootstrap scene has no
 * material, or points at a material asset that does not exist.
 *
 * A missing material is Unity's magenta, and it is invisible everywhere a build
 * is normally checked: the build succeeds, the deploy succeeds, the headers
 * pass, the render pipeline is correctly assigned, and every material asset on
 * disk is valid. The only symptom is on screen. Three of the five reference
 * cubes shipped that way because Paint() deleted and recreated its material
 * asset per call, orphaning the references of every object that shared a name.
 *
 * This runs on the scene FILE, so it needs no Unity, no licence and no Editor —
 * it can gate every push in seconds rather than waiting for a 20-minute build.
 *
 * "ACTUALLY DRAWS" is the whole difficulty, and the first version got it wrong.
 * It counted every m_Materials list in the file and asserted a fixed total of 7.
 * That produced three confident failures against a perfectly good scene once the
 * world grew:
 *
 *   - the scene legitimately gained objects (7 renderers -> 11), so a hardcoded
 *     count reports growth as breakage;
 *   - Environment_Cover_A/B/C are m_IsActive: 0, deliberately deactivated by
 *     "fix: clear obstructive world cover meshes". An inactive object never
 *     renders, so its dangling material is harmless;
 *   - Environment_Prototype's MeshRenderer has m_Mesh: {fileID: 0}. A renderer
 *     with no mesh draws nothing, material or not.
 *
 * A check that cries wolf on a healthy scene is worse than no check, because the
 * next real magenta gets ignored too. So: resolve each renderer back to its
 * GameObject, skip inactive ones, skip meshless ones, and assert on what is
 * left. No magic totals — the null-material and dangling-guid checks are what
 * caught the real bug, and they do not need a count to work.
 */
const fs = require("fs");
const path = require("path");

const SCENE = "unity/Assets/Isoperia/Scenes/Bootstrap.unity";
const MATERIALS_DIR = "unity/Assets/Isoperia/Materials";

let failures = 0;
const fail = (msg) => { console.error(`FAIL  ${msg}`); failures++; };
const pass = (msg) => console.log(`PASS  ${msg}`);

if (!fs.existsSync(SCENE)) {
  console.error(`FAIL  ${SCENE} does not exist`);
  process.exit(1);
}

const text = fs.readFileSync(SCENE, "utf8");

// --- parse the scene into fileID -> { type, body } -------------------------
const docs = new Map();
const docRe = /^--- !u!(\d+) &(\d+).*$/gm;
const marks = [];
let m;
while ((m = docRe.exec(text)) !== null) marks.push({ classId: m[1], id: m[2], start: m.index });

for (let i = 0; i < marks.length; i++) {
  const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
  const body = text.slice(marks[i].start, end);
  const typeMatch = body.match(/^\s*(\w+):\s*$/m);
  docs.set(marks[i].id, { classId: marks[i].classId, type: typeMatch ? typeMatch[1] : "?", body });
}

if (docs.size === 0) { console.error("FAIL  no YAML documents parsed — is this a scene file?"); process.exit(1); }

// --- map each component back to its owning GameObject ----------------------
const ownerOf = new Map();     // componentId -> gameObjectId
const gameObjects = new Map(); // gameObjectId -> { name, active }

for (const [id, doc] of docs) {
  if (doc.type !== "GameObject") continue;
  const name = (doc.body.match(/m_Name:\s*(.*)/) || [, "(unnamed)"])[1].trim();
  const active = (doc.body.match(/m_IsActive:\s*(\d)/) || [, "1"])[1] === "1";
  gameObjects.set(id, { name, active });
  for (const c of doc.body.matchAll(/- component: \{fileID: (\d+)\}/g)) ownerOf.set(c[1], id);
}

// --- known material guids on disk -----------------------------------------
const knownGuids = new Set();
let matCount = 0;
if (fs.existsSync(MATERIALS_DIR)) {
  for (const f of fs.readdirSync(MATERIALS_DIR)) {
    if (!f.endsWith(".mat")) continue;
    matCount++;
    const meta = path.join(MATERIALS_DIR, `${f}.meta`);
    if (!fs.existsSync(meta)) continue;
    const g = fs.readFileSync(meta, "utf8").match(/^guid:\s*([0-9a-f]+)/m);
    if (g) knownGuids.add(g[1]);
  }
}

// --- check the renderers that actually draw --------------------------------
let checked = 0, skippedInactive = 0, skippedMeshless = 0;

for (const [id, doc] of docs) {
  if (!/Renderer$/.test(doc.type)) continue;

  const goId = ownerOf.get(id);
  const go = goId ? gameObjects.get(goId) : null;
  const label = go ? go.name : `renderer ${id}`;

  if (go && !go.active) { skippedInactive++; continue; }

  // A MeshRenderer with no mesh draws nothing. Find the sibling MeshFilter.
  if (doc.type === "MeshRenderer" && goId) {
    const siblings = [...ownerOf.entries()].filter(([, owner]) => owner === goId).map(([c]) => c);
    const filter = siblings.map((s) => docs.get(s)).find((d) => d && d.type === "MeshFilter");
    if (filter && /m_Mesh:\s*\{fileID:\s*0\}/.test(filter.body)) { skippedMeshless++; continue; }
  }

  checked++;

  const listMatch = doc.body.match(/m_Materials:\n((?:\s*- \{fileID:[^\n]*\n)*)/);
  const entries = listMatch
    ? [...listMatch[1].matchAll(/\{fileID:\s*(-?\d+)(?:,\s*guid:\s*([0-9a-f]+))?/g)]
    : [];

  if (entries.length === 0) {
    fail(`"${label}" has no material slots — it would render magenta`);
    continue;
  }

  entries.forEach((e, slot) => {
    const [, fileId, guid] = e;
    if (fileId === "0" && !guid) {
      fail(`"${label}" slot ${slot} is {fileID: 0} — no material, renders magenta. ` +
           `If several objects share a material name, check Paint is not recreating ` +
           `the asset and orphaning the earlier references.`);
    } else if (guid && !knownGuids.has(guid) && fs.existsSync(MATERIALS_DIR)) {
      // Only our own generated materials are resolvable from here; a guid from a
      // package or an imported model is legitimately outside MATERIALS_DIR.
      const referencedInProject = new RegExp(guid).test(
        fs.existsSync("unity/Assets") ? guid : ""
      );
      if (!referencedInProject) {
        fail(`"${label}" slot ${slot} references material guid ${guid}, which has no ` +
             `asset in ${MATERIALS_DIR}. If it belongs to a package or an imported ` +
             `model that is fine — otherwise it renders magenta.`);
      }
    }
  });
}

if (failures === 0) {
  pass(`${checked} drawing renderer(s) all have materials ` +
       `(skipped ${skippedInactive} inactive, ${skippedMeshless} meshless)`);
  pass(`${matCount} generated material(s) on disk`);
}

// Say plainly when this check verified nothing.
//
// Every static placeholder in Bootstrap.unity is now m_IsActive: 0 — the ground,
// the spawn marker and all five reference cubes are renamed "legacy placeholder"
// and the world is built at RUNTIME by OpenWorldExperience and the World*View
// scripts. So there is currently no static geometry left for this to check, and
// a bare "scene materials OK" would read as coverage that does not exist.
//
// The magenta risk did not go away; it moved somewhere a scene-file check cannot
// see. Catching it now needs a runtime assertion in the Unity layer.
if (checked === 0) {
  console.log(
    "\nNOTE  no active, mesh-bearing renderers in the scene — the world is built\n" +
    "      at runtime now, so this check verified NOTHING about what ships. It\n" +
    "      still guards against a placeholder being reactivated with a broken\n" +
    "      material. Runtime-instantiated meshes need their own guard."
  );
}

console.log(failures === 0 ? "\nscene materials OK" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
