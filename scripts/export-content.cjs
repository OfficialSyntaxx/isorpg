#!/usr/bin/env node
// Exports the game's content tables from src/data/*.ts to JSON for the Unity build.
//
// WHY JSON AND NOT ScriptableObjects:
// The same JSON feeds the Unity game AND gen-wiki, so the website's wiki page
// cannot drift from the build. ScriptableObjects would fork the source of truth
// and make the wiki a hand-maintained second copy.
//
// WHY EXPORTED AND NOT RETYPED:
// Two of this migration's worst bugs were transcription errors from data I
// retyped into C# instead of exporting. An invented building-type list omitted
// STORAGE_BIN and FARM_PLOT, which would have silently deleted every storage bin
// and farm plot on load. A fallback item catalog treated coins as a bulk
// resource and clamped an offline Town Hall payout of 2400 down to 500. Both
// looked correct in review. Exporting makes that entire class impossible.
//
// DETERMINISM:
// Keys are emitted in a stable order and the output ends with a newline, so
// re-running produces byte-identical files when the data has not changed. CI
// asserts exactly that (the "generated files are up to date" step), which is
// what turns "somebody forgot to re-export" into a failed build rather than a
// silent divergence between the wiki, the game and the port.
//
// Run: npm run export:content   (also runs as part of `npm test`)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { compileData, ROOT } = require("./lib/compile-data.cjs");

const EMIT = path.join(ROOT, ".content-emit");
// Under Resources/ so the Unity side can load these with no Addressables setup
// and no AssetDatabase (which does not exist in a player). 70 kB is small enough
// that always-included is exactly what we want; revisit only if content grows
// into the megabytes, which it will not — this is text.
const OUT = path.join(ROOT, "unity", "Assets", "Isoperia", "Resources", "Content");

const D = compileData(EMIT);

// What gets exported: DATA only, never functions.
//
// Functions in src/data (rollAffix, growthAt, selectWeapon, clueTierForItem…)
// are behaviour, and behaviour is ported to C# where it can be parity-tested
// against the TypeScript. Serialising them would be impossible anyway, but the
// line matters for a different reason: it keeps the boundary between "content a
// designer edits" and "rules a test pins" visible in the file layout.
// Content authored DIRECTLY in the Unity JSON, not in src/data/*.ts.
//
// This exporter was written when the TypeScript was the sole source of truth.
// It no longer is: Phase 3-5 content (the starter task chain, the Cinder Hollow
// route) was authored straight into the Unity JSON, because that is the game
// being built. Regenerating those files from the TypeScript DELETES that work —
// quests.json went from 6 quests back to 2, silently, with a valid-looking file,
// every time anyone ran `npm test`.
//
// Files listed here are left alone. The exporter also refuses to overwrite any
// OTHER file whose content has drifted, rather than assuming the TypeScript is
// right (see the drift check below) — so the next file authored in Unity fails
// loudly instead of being erased.
//
// This is a holding position, not the end state. The TypeScript data layer is
// deleted at Phase 9 and the wiki still generates from it, so quests are
// currently absent from the wiki. Flipping the whole pipeline to read the Unity
// JSON is Phase B work; losing content is not acceptable in the meantime.
const UNITY_AUTHORED = new Set([
  "quests.json",
]);

const EXPORTS = {
  "items.json":        () => pick(D("Items.js"), ["ITEMS", "ITEM_ICONS", "ITEM_ICON_IMAGE_IDS"]),
  "skills.json":       () => pick(D("Skills.js"), ["SKILLS", "SKILL_IDS", "CRAFT_SKILLS", "COMBAT_SKILLS", "RESOURCES"]),
  "combat.json":       () => pick(D("Combat.js"), [
                              "ATTACK_STYLES", "DEFAULT_ATTACK_STYLE", "BUFFS",
                              "RESOLVE_MAX", "RESOLVE_REGEN_PER_TICK", "RESOLVE_REGEN_RANGE",
                              "WEAPON_SPECIALS", "SPECIAL_MAX", "SPECIAL_REGEN_PER_TICK",
                              "AFFIXES", "AFFIX_CHANCE",
                              "WEAPONS", "MONSTERS", "MONSTER_STYLES", "FOODS"]),
  "recipes.json":      () => pick(D("Recipes.js"), ["RECIPES"]),
  "buildings.json":    () => pick(D("Buildings.js"), ["BUILDINGS", "BUILDING_TYPES", "MAX_BUILD_LEVEL"]),
  "achievements.json": () => pick(D("Achievements.js"), ["ACHIEVEMENTS"]),
  "xp.json":           () => pick(D("XPTable.js"), ["XP_TABLE"]),
  "npcs.json":         () => pick(D("Npcs.js"), ["VILLAGERS", "CRITTERS", "VETERAN_TIERS", "VILLAGER_SPECS"]),
  "quests.json":       () => pick(D("Quests.js"), ["QUESTS"]),
  "farming.json":      () => pick(D("Farming.js"), ["SEEDS", "SEED_IDS"]),
  "clues.json":        () => pick(D("Clues.js"), ["CLUE_TIERS", "CLUE_TIER_LIST"]),
  // STOCK was extracted out of src/systems/ShopSystem.ts, which imports three.js
  // and so can never be require()d here. It was the last piece of content that
  // would otherwise have had to be hand-transcribed into C#.
  "shop.json":         () => pick(D("Shop.js"), ["STOCK"]),
};

function pick(mod, names) {
  const out = {};
  for (const n of names) {
    if (!(n in mod)) {
      console.error(`FATAL  ${n} is not exported by its module. Renamed or removed?`);
      process.exit(1);
    }
    if (typeof mod[n] === "function") {
      console.error(`FATAL  ${n} is a function. Only data is exported; port behaviour to C#.`);
      process.exit(1);
    }
    out[n] = mod[n];
  }
  return out;
}

// Stable stringify: object keys sorted, so a re-export diffs only on real change.
// Insertion order is not stable across a TS refactor and would produce noisy
// diffs that hide the one line that actually moved.
function stable(v, where = "root") {
  if (Array.isArray(v)) return v.map((x, i) => stable(x, `${where}[${i}]`));

  // Set and Map are NOT plain objects and JSON.stringify turns both into {}.
  // ITEM_ICON_IMAGE_IDS is a Set of 62 ids and exported as an empty object on
  // the first run of this script — silently, with a valid-looking file. Handle
  // them explicitly, and treat any OTHER exotic object as fatal below rather
  // than letting the next one through the same hole.
  if (v instanceof Set) return [...v].map(String).sort();
  if (v instanceof Map) {
    const out = {};
    for (const k of [...v.keys()].sort()) out[String(k)] = stable(v.get(k), `${where}.${k}`);
    return out;
  }

  if (v && typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      console.error(`FATAL  ${where} is a ${v.constructor && v.constructor.name} — ` +
                    `JSON.stringify would silently emit {} or lose fields. ` +
                    `Add explicit handling in stable().`);
      process.exit(1);
    }
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = stable(v[k], `${where}.${k}`);
    return out;
  }
  if (typeof v === "number" && !Number.isFinite(v)) {
    console.error(`FATAL  non-finite number ${v} in the content — JSON cannot represent it.`);
    process.exit(1);
  }
  return v;
}

fs.mkdirSync(OUT, { recursive: true });

const manifest = {};
let total = 0;

let skipped = 0;
let blocked = 0;

for (const [file, build] of Object.entries(EXPORTS)) {
  const dest = path.join(OUT, file);
  const body = JSON.stringify(stable(build()), null, 2) + "\n";

  if (UNITY_AUTHORED.has(file)) {
    if (!fs.existsSync(dest)) {
      console.error(`FATAL  ${file} is marked Unity-authored but does not exist. ` +
                    `Either restore it from git or remove it from UNITY_AUTHORED.`);
      process.exit(1);
    }
    const existing = fs.readFileSync(dest, "utf8");
    manifest[file] = {
      bytes: existing.length,
      sha256: crypto.createHash("sha256").update(existing).digest("hex"),
      authored: "unity",
    };
    total += existing.length;
    skipped++;
    console.log(`  ${file.padEnd(20)} ${String(existing.length).padStart(7)} bytes  (Unity-authored, left alone)`);
    continue;
  }

  // Refuse to clobber a file that has drifted from what this script last wrote.
  // The point is not to be clever about merging — it is that DELETING somebody's
  // content should never be the silent default.
  if (fs.existsSync(dest)) {
    const existing = fs.readFileSync(dest, "utf8");
    if (existing !== body) {
      console.error(`\nFATAL  ${file} differs from what this exporter would write.`);
      console.error(`       Either src/data changed (then this is fine — rerun with`);
      console.error(`       ISOPERIA_FORCE_EXPORT=1 to accept), or the file was edited`);
      console.error(`       directly in Unity (then add it to UNITY_AUTHORED instead,`);
      console.error(`       or your edits are about to be deleted).`);
      if (!process.env.ISOPERIA_FORCE_EXPORT) {
        blocked++;
        continue;
      }
      console.error(`       ISOPERIA_FORCE_EXPORT set — overwriting.`);
    }
  }

  fs.writeFileSync(dest, body);

  manifest[file] = {
    bytes: body.length,
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
  };
  total += body.length;
  console.log(`  ${file.padEnd(20)} ${String(body.length).padStart(7)} bytes`);
}

// The manifest lets the C# side assert it loaded the content it was built
// against. A half-updated Addressables group or a stale cached bundle otherwise
// presents as subtly wrong balance rather than as an error.
fs.writeFileSync(
  path.join(OUT, "manifest.json"),
  JSON.stringify(stable({ files: manifest, generated_by: "scripts/export-content.cjs" }), null, 2) + "\n"
);

fs.rmSync(EMIT, { recursive: true, force: true });

console.log(`\ncontent: ${Object.keys(EXPORTS).length} files, ${(total / 1024).toFixed(1)} kB -> ${path.relative(ROOT, OUT)}` +
            (skipped ? `  (${skipped} Unity-authored)` : ""));

if (blocked > 0) {
  console.error(`\n${blocked} file(s) NOT written because they would have lost content.`);
  process.exit(1);
}
