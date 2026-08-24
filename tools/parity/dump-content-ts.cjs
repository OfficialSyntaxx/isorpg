// The TypeScript half of the content parity check: emits the same canonical
// text as tools/parity/DumpContent.cs, read straight from src/data/*.ts.
//
// Deliberately reads the TypeScript, NOT the exported JSON. Comparing the JSON
// against itself would prove only that a file can be read twice; the question
// is whether the JSON the Unity build loads still says what src/data says.
const path = require("path");
const { compileData, ROOT } = require("../../scripts/lib/compile-data.cjs");

const D = compileData(path.join(ROOT, ".content-parity-emit"));

const { ITEMS, ITEM_ICONS, ITEM_ICON_IMAGE_IDS } = D("Items.js");
const { SKILLS, SKILL_IDS, CRAFT_SKILLS, COMBAT_SKILLS, RESOURCES } = D("Skills.js");
const C = D("Combat.js");
const { RECIPES } = D("Recipes.js");
const { BUILDINGS, BUILDING_TYPES, MAX_BUILD_LEVEL } = D("Buildings.js");
const { ACHIEVEMENTS } = D("Achievements.js");
const { XP_TABLE } = D("XPTable.js");
const N = D("Npcs.js");
const { QUESTS } = D("Quests.js");
const { SEEDS, SEED_IDS } = D("Farming.js");
const { CLUE_TIERS, CLUE_TIER_LIST } = D("Clues.js");

// quests are Unity-authored and have no TypeScript counterpart — see
// UNITY_AUTHORED in scripts/export-content.cjs. Excluded on both sides.
const out = [];
const size = (v) =>
  v instanceof Set ? v.size : Array.isArray(v) ? v.length :
  v && typeof v === "object" ? Object.keys(v).length : 0;

// Table sizes, in the same file/name order the C# side walks.
const TABLES = {
  items: { ITEMS, ITEM_ICONS, ITEM_ICON_IMAGE_IDS },
  skills: { SKILLS, SKILL_IDS, CRAFT_SKILLS, COMBAT_SKILLS, RESOURCES },
  combat: {
    ATTACK_STYLES: C.ATTACK_STYLES, DEFAULT_ATTACK_STYLE: C.DEFAULT_ATTACK_STYLE,
    BUFFS: C.BUFFS, RESOLVE_MAX: C.RESOLVE_MAX,
    RESOLVE_REGEN_PER_TICK: C.RESOLVE_REGEN_PER_TICK, RESOLVE_REGEN_RANGE: C.RESOLVE_REGEN_RANGE,
    WEAPON_SPECIALS: C.WEAPON_SPECIALS, SPECIAL_MAX: C.SPECIAL_MAX,
    SPECIAL_REGEN_PER_TICK: C.SPECIAL_REGEN_PER_TICK, AFFIXES: C.AFFIXES,
    AFFIX_CHANCE: C.AFFIX_CHANCE, WEAPONS: C.WEAPONS, MONSTERS: C.MONSTERS,
    MONSTER_STYLES: C.MONSTER_STYLES, FOODS: C.FOODS,
  },
  recipes: { RECIPES },
  buildings: { BUILDINGS, BUILDING_TYPES, MAX_BUILD_LEVEL },
  achievements: { ACHIEVEMENTS },
  xp: { XP_TABLE },
  npcs: { VILLAGERS: N.VILLAGERS, CRITTERS: N.CRITTERS, VETERAN_TIERS: N.VETERAN_TIERS, VILLAGER_SPECS: N.VILLAGER_SPECS },
  farming: { SEEDS, SEED_IDS },
  clues: { CLUE_TIERS, CLUE_TIER_LIST },
};

for (const file of Object.keys(TABLES)) {
  for (const table of Object.keys(TABLES[file]).sort()) {
    out.push(`table\t${file}.${table}\t${size(TABLES[file][table])}`);
  }
}

const num = (v) => (v === undefined || v === null ? "-" : String(v));

// levelReq is a per-skill map ({woodcutting: 15}), not a number. Canonical form
// must match DumpContent.Reqs exactly.
const reqs = (v) => {
  if (!v || typeof v !== "object") return "-";
  const keys = Object.keys(v).sort();
  return keys.length === 0 ? "-" : keys.map((k) => `${k}=${num(v[k])}`).join(",");
};

for (const id of Object.keys(ITEMS).sort()) {
  const it = ITEMS[id];
  out.push([
    "item", id, it.name ?? "", it.type ?? "", num(it.value ?? 0),
    it.stack ? "stack" : "-", reqs(it.levelReq),
  ].join("\t"));
}

// RECIPES and QUESTS are arrays of objects with an id; the rest are maps keyed
// by id. Must match DumpContent.Ids exactly.
const ids = (kind, tbl) => {
  const list = Array.isArray(tbl) ? tbl.map((e) => e.id) : Object.keys(tbl);
  for (const id of list.slice().sort()) out.push(`${kind}\t${id}`);
};
ids("monster", C.MONSTERS);
ids("weapon", C.WEAPONS);
ids("building", BUILDINGS);
ids("recipe", RECIPES);
ids("seed", SEEDS);

XP_TABLE.forEach((v, i) => out.push(`xp\t${i}\t${num(v)}`));

process.stdout.write(out.join("\n") + "\n");
