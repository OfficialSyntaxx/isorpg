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
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = stable(v[k]);
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

for (const [file, build] of Object.entries(EXPORTS)) {
  const body = JSON.stringify(stable(build()), null, 2) + "\n";
  fs.writeFileSync(path.join(OUT, file), body);

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

console.log(`\ncontent: ${Object.keys(EXPORTS).length} files, ${(total / 1024).toFixed(1)} kB -> ${path.relative(ROOT, OUT)}`);
