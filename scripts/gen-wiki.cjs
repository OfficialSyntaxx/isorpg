#!/usr/bin/env node
// Generate WIKI.md from the game's own data modules.
//
// A hand-written wiki drifts the moment a drop rate or level requirement
// changes, and then actively misleads. Everything here is read from
// src/data/*.ts at build time, so the wiki cannot disagree with the game:
// if a number is in the wiki, it is the number the game uses.
//
// Drop chances are computed from the weight tables rather than transcribed,
// which is exactly the kind of thing that goes stale by hand.
//
// Run: npm run wiki   (also runs as part of `npm test`)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const EMIT = path.join(ROOT, ".wiki-emit");
const OUT = path.join(ROOT, "WIKI.md");

// Compile the data layer to CommonJS so we can require it.
function compile() {
  fs.rmSync(EMIT, { recursive: true, force: true });
  const tsconfig = path.join(EMIT, "tsconfig.json");
  fs.mkdirSync(EMIT, { recursive: true });
  fs.writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: {
      target: "ES2020", module: "CommonJS", moduleResolution: "Node",
      esModuleInterop: true, skipLibCheck: true, lib: ["ES2020", "DOM"],
      // rootDir pinned so emitted paths are predictable — tsc otherwise infers
      // it from the input set and the output layout shifts as imports change.
      rootDir: path.join(ROOT, "src"), outDir: ".", noEmit: false,
      strict: false, declaration: false,
    },
    include: [path.join(ROOT, "src/data/**/*.ts"), path.join(ROOT, "src/components/Skills.ts")],
  }, null, 2));
  execFileSync("npx", ["tsc", "-p", tsconfig], { cwd: ROOT, stdio: "pipe" });
  fs.writeFileSync(path.join(EMIT, "package.json"), '{"type":"commonjs"}');
}

compile();
const D = (m) => require(path.join(EMIT, "data", m));
const { ITEMS, ITEM_ICONS } = D("Items.js");
const { SKILLS, SKILL_IDS, RESOURCES } = D("Skills.js");
const { WEAPONS, MONSTERS, FOODS } = D("Combat.js");
const { RECIPES } = D("Recipes.js");
const { BUILDINGS, BUILDING_TYPES } = D("Buildings.js");
const { ACHIEVEMENTS } = D("Achievements.js");
const { XP_TABLE } = D("XPTable.js");
const { VILLAGERS, CRITTERS, VILLAGER_SPECS, VETERAN_TIERS } = D("Npcs.js");
const { QUESTS, rewardText } = D("Quests.js");
const { SEEDS, SEED_IDS } = D("Farming.js");
const { masteryXpForLevel, MASTERY_MAX } = require(path.join(EMIT, "components", "Skills.js"));

const L = [];
const w = (s = "") => L.push(s);
const nameOf = (id) => (ITEMS[id] && ITEMS[id].name) || id;
const icon = (id) => (ITEM_ICONS && ITEM_ICONS[id]) || "";
const req = (o) => (o ? Object.entries(o).map(([s, n]) => `${SKILLS[s] ? SKILLS[s].name : s} ${n}`).join(", ") : "—");
const pct = (n) => (n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(2)) + "%";
/** 1/N phrasing reads better than a tiny percentage for rare drops. */
const rarity = (p) => (p >= 0.02 ? pct(p * 100) : `1/${Math.round(1 / p).toLocaleString()}`);

w("# Isoperia — Game Wiki");
w("");
w("> **Generated from the game's data files** by `scripts/gen-wiki.cjs`.");
w("> Do not edit by hand — run `npm run wiki` after changing anything in `src/data/`.");
w("> Every number here is read straight from the code, so it cannot drift out of date.");
w("");
w(`_Last generated: ${new Date().toISOString().slice(0, 10)}_`);
w("");

// ————— Contents —————
w("## Contents");
w("");
[
  "Getting started", "Skills", "Experience table", "Gathering", "Weapons",
  "Armour & equipment", "Monsters & drops", "Crafting recipes", "Buildings",
  "Food & healing", "Farming", "Villagers & labour", "Quests", "Items index",
  "Achievements", "Guides",
].forEach((s) => w(`- [${s}](#${s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")})`));
w("");

// ————— Getting started —————
w("## Getting started");
w("");
w("You spawn in the **town centre** of a 42×42 world with a small starter stash.");
w("The world is built in four concentric bands, and difficulty rises with distance:");
w("");
w("| Zone | Distance from town | What's there |");
w("|---|---|---|");
w("| **Town Centre** | centre chunk | Safe. All tiles buildable. Market, villagers, quest givers. |");
w("| **Settlement** | ring 1 | Safe. Resource gathering, room to expand the town. |");
w("| **Wilderness** | ring 2 | Monsters spawn. Better ore and trees. |");
w("| **Deep Wilds** | ring 3+ | Tough monsters, the boss, and the dungeon entrance. |");
w("");
w("Biomes overlay the bands — **snow** to the north-east (barren but mineral-rich),");
w("**swamp** to the south-west (willow), **forest** elsewhere (dense woodland).");
w("The town core is always meadow.");
w("");
w("**The core loop:** gather raw materials → build a Sawmill/Smelter → craft them into");
w("planks, bars, tools and armour → fight your way outward → assign villagers to");
w("automate gathering while you're away.");
w("");
w("**Time** runs at one in-game minute per 600 ms tick. Days affect lighting only.");
w("**Offline progress** accrues while you're away, capped by your Town Hall level.");
w("");

// ————— Skills —————
w("## Skills");
w("");
w("All skills use the same experience curve and cap at level 99.");
w("");
w("| Skill | Type | What it does |");
w("|---|---|---|");
const KIND = { gathering: "Gathering", artisan: "Artisan", combat_skill: "Combat", combat_lvl: "Combat" };
const BLURB = {
  woodcutting: "Chop trees for logs. Better axes and higher levels unlock harder wood.",
  mining: "Mine rocks for ore and coal. Pickaxe tier gates the higher ores.",
  fishing: "Catch raw fish at fishing spots. Needs a net or rod.",
  cooking: "Turn raw food into healing meals. Low levels burn food.",
  smithing: "Smelt ore into bars, then forge tools, weapons and armour. Needs a Smelter.",
  carpentry: "Saw logs into planks and carve tools. Needs a Sawmill.",
  construction: "Gates which settlement buildings you can place, and their upgrades.",
  attack: "Accuracy — how often your hits land.",
  strength: "Max hit — how hard they land.",
  defense: "Mitigation — how often you get hit.",
  hitpoints: "Your health pool. Max HP = level + 9 + armour bonus.",
};
for (const id of SKILL_IDS) {
  const s = SKILLS[id];
  w(`| ${s.icon} **${s.name}** | ${KIND[s.kind] || s.kind} | ${BLURB[id] || ""} |`);
}
w("");

// ————— XP table —————
w("## Experience table");
w("");
w("Standard OSRS-style curve: XP to reach level *L* is");
w("`floor( sum(n + 300 · 2^(n/7)) for n = 1..L-1 ) / 4`.");
w("");
w("| Level | Total XP | Level | Total XP |");
w("|---:|---:|---:|---:|");
const miles = [2, 10, 20, 30, 40, 50, 60, 70, 75, 80, 85, 90, 92, 95, 98, 99];
for (let i = 0; i < miles.length; i += 2) {
  const a = miles[i], b = miles[i + 1];
  w(`| ${a} | ${(XP_TABLE[a] ?? 0).toLocaleString()} | ${b ?? ""} | ${b ? (XP_TABLE[b] ?? 0).toLocaleString() : ""} |`);
}
w("");
w("**Item mastery** is tracked separately per resource/recipe. Higher mastery grants");
w("up to +20% double-yield on gathering, up to +15% material preservation on crafting,");
w("and shortens the action by up to a third.");
w("");

// ————— Gathering —————
w("## Gathering");
w("");
w("| Node | Skill | Level | Yields | XP | Ticks | Uses |");
w("|---|---|---:|---|---:|---:|---:|");
for (const [key, r] of Object.entries(RESOURCES)) {
  const drops = r.drops.map((d) => `${icon(d.itemId)} ${nameOf(d.itemId)}`).join(", ");
  const xp = r.drops.map((d) => (ITEMS[d.itemId] && ITEMS[d.itemId].xp && ITEMS[d.itemId].xp[r.skill]) || 0)[0] || 0;
  w(`| ${key.replace(/_/g, " ")} | ${SKILLS[r.skill].name} | ${r.levelReq} | ${drops} | ${xp} | ${r.ticksPerAction} | ${r.depletes ? (r.maxUses ?? "—") : "∞"} |`);
}
w("");
w("A node's action takes `ticks × 0.6s`, reduced by mastery. Depleting nodes respawn.");
w("");

// ————— Weapons —————
w("## Weapons");
w("");
w("Attack speed is in 600 ms ticks — lower is faster. Max hit also scales with your");
w("Strength level (`+1 per 4 levels`) and your armour's strength bonus.");
w("");
w("| Weapon | Style | Speed | Max hit | Accuracy | Attack req |");
w("|---|---|---:|---:|---:|---:|");
for (const wep of Object.values(WEAPONS)) {
  w(`| ${wep.itemId ? icon(wep.itemId) + " " : ""}**${wep.name}** | ${wep.kind} | ${wep.ticks}t (${(wep.ticks * 0.6).toFixed(1)}s) | ${wep.maxHit} | ${wep.accuracy} | ${wep.requiredAttack} |`);
}
w("");
w("Ranged weapons reach **5 tiles**; melee must be adjacent. The same rule applies to");
w("monsters, so a bow lets you open on an enemy before it closes.");
w("");

// ————— Equipment —————
const equips = Object.values(ITEMS).filter((i) => i.equip);
if (equips.length) {
  w("## Armour & equipment");
  w("");
  w("| Item | Slot | Attack | Strength | Defence | Max HP | Level req |");
  w("|---|---|---:|---:|---:|---:|---|");
  for (const i of equips) {
    const e = i.equip;
    w(`| ${icon(i.id)} **${i.name}** | ${e.slot} | ${e.attack ?? 0} | ${e.strength ?? 0} | ${e.defense ?? 0} | ${e.maxHp ?? 0} | ${req(i.levelReq)} |`);
  }
  w("");
}

// ————— Monsters —————
w("## Monsters & drops");
w("");
w("Drop chances below are computed from the game's weight tables. **Main table** rolls");
w("exactly once per kill, so its chances sum to 100%. **Tertiary** and **pet** rolls are");
w("independent — they can drop alongside a main drop.");
w("");
for (const m of Object.values(MONSTERS)) {
  const tags = [m.boss ? "**BOSS**" : "", m.ranged ? "ranged" : "melee"].filter(Boolean).join(" · ");
  w(`### ${m.name}`);
  w("");
  w(`Level ${m.level} · ${m.hp} HP · max hit ${m.maxHit} · attacks every ${m.attackTick}t (${(m.attackTick * 0.6).toFixed(1)}s) · ${tags}`);
  w("");
  w(`Aggro range ${m.aggroRange} tiles · respawns after ${(m.respawnMs / 1000).toFixed(0)}s`);
  if (m.slamChance) w(`· telegraphed slam: ${pct(m.slamChance * 100)} per tick for ${m.slamDmg} damage`);
  w("");
  w(`**XP:** ${m.xp.attack} Attack · ${m.xp.strength} Strength · ${m.xp.defense} Defence · ${m.xp.hitpoints} Hitpoints`);
  w("");
  const total = m.main.reduce((a, d) => a + d.weight, 0);
  w("| Drop | Quantity | Chance |");
  w("|---|---|---:|");
  for (const d of m.main) {
    const q = d.min === d.max ? `${d.min}` : `${d.min}–${d.max}`;
    w(`| ${icon(d.itemId)} ${nameOf(d.itemId)} | ${q} | ${pct((d.weight / total) * 100)} |`);
  }
  for (const t of m.tertiary || []) {
    const q = t.min === t.max ? `${t.min}` : `${t.min}–${t.max}`;
    w(`| ${icon(t.itemId)} ${nameOf(t.itemId)} _(tertiary)_ | ${q} | ${rarity(t.chance)} |`);
  }
  for (const p of m.petTable || []) {
    w(`| ${icon(p.itemId)} ${nameOf(p.itemId)} _(pet)_ | 1 | ${rarity(p.chance)} |`);
  }
  w("");
}

// ————— Recipes —————
w("## Crafting recipes");
w("");
for (const skill of ["cooking", "smithing", "carpentry"]) {
  const rs = RECIPES.filter((r) => r.skill === skill);
  if (!rs.length) continue;
  w(`### ${SKILLS[skill].icon} ${SKILLS[skill].name}`);
  w("");
  w("| Product | Level | Materials | XP | Time | Requires |");
  w("|---|---:|---|---:|---:|---|");
  for (const r of rs) {
    const ins = r.inputs.map((i) => `${i.qty}× ${icon(i.itemId)} ${nameOf(i.itemId)}`).join(" + ");
    const out = `${r.output.qty > 1 ? r.output.qty + "× " : ""}${icon(r.output.itemId)} ${nameOf(r.output.itemId)}`;
    const bld = r.requiresBuilding ? BUILDINGS[r.requiresBuilding].name : "—";
    w(`| ${out} | ${r.levelReq} | ${ins} | ${r.xp} | ${(r.ticks * 0.6).toFixed(1)}s | ${bld}${r.burnable ? " · can burn" : ""} |`);
  }
  w("");
}
w("### Mastery");
w("");
w("Every resource and every recipe tracks its **own** mastery, earning 1 mastery XP");
w("per unit produced. Mastery raises action speed (up to 33% faster at 99), the");
w(`double-yield chance when gathering (up to 20%) and the material-preserve chance`);
w("when crafting (up to 15%). It also reduces cooking burn.");
w("");
w("| Mastery level | Total XP (= actions) |");
w("|---:|---:|");
for (const l of [10, 25, 50, 75, MASTERY_MAX]) w(`| ${l} | ${masteryXpForLevel(l).toLocaleString()} |`);
w("");
w("Cooking can **burn** at low levels — the chance falls as your level rises above the");
w("recipe's requirement and as mastery grows. A built Campfire makes cooking 25% faster.");
w("");

// ————— Buildings —————
w("## Buildings");
w("");
w("| Building | Con. level | Cost | Effect |");
w("|---|---:|---|---|");
for (const t of BUILDING_TYPES) {
  const b = BUILDINGS[t];
  const cost = b.baseCost.map((c) => `${c.qty}× ${icon(c.itemId)} ${nameOf(c.itemId)}`).join(" + ");
  w(`| ${b.icon} **${b.name}** | ${b.levelReq} | ${cost} | ${b.effect} |`);
}
w("");
w("Buildings may only be placed on unlocked, buildable tiles in the town or settlement");
w("ring. Placing one grants Construction XP.");
w("");

// ————— Food —————
w("## Food & healing");
w("");
w("**Auto-eat** fires when your HP drops below 40%, consuming the highest-tier food you");
w("carry. Tier decides priority, not the heal value.");
w("");
w("| Food | Heals | Tier |");
w("|---|---:|---:|");
for (const [id, f] of Object.entries(FOODS).sort((a, b) => a[1].tier - b[1].tier || a[1].heal - b[1].heal)) {
  w(`| ${icon(id)} ${nameOf(id)} | ${f.heal} | ${f.tier} |`);
}
w("");

// ————— Farming —————
w("## Farming");
w("");
w("Farming is the one skill that advances on **real time** rather than on actions.");
w("Sow a bed and it ripens whether the game is open or not — a crop planted before you");
w("close the tab is ready when you come back, with no offline calculation involved.");
w("");
w("Beds come from the **Farm Plot** building (Construction 3): one bed per Farm Plot");
w("*level*, so upgrading a plot adds beds. Seeds are stocked by the town merchant.");
w("");
w("| Seed | Farming | Ripens in | Yield | XP |");
w("|---|---:|---:|---|---:|");
for (const id of SEED_IDS) {
  const sd = SEEDS[id];
  const mins = Math.round(sd.growMs / 60000);
  const q = sd.produce.min === sd.produce.max ? `${sd.produce.min}` : `${sd.produce.min}–${sd.produce.max}`;
  w(`| ${icon(id)} **${sd.name}** | ${sd.levelReq} | ${mins} min | ${q} × ${icon(sd.produce.itemId)} ${nameOf(sd.produce.itemId)} | ${sd.xp} |`);
}
w("");
w("Farming mastery raises the yield **floor** rather than adding a bonus roll: at");
w("mastery 1 a harvest spans the crop's whole range, at 99 it always gives the maximum.");
w("");
w("Every crop feeds something — potatoes and cabbages go to Cooking, and redberries");
w("brew the **Combat Tonic**, which was previously only buyable.");
w("");

// ————— Villagers —————
w("## Villagers & labour");
w("");
w("Villagers live in the town centre, wander between the Campfire and the storehouses,");
w("and comment on what you build. Assign one to a job and they gather into the **village");
w("stock** — including while you are offline, up to your Town Hall's cap.");
w("");
w("| Villager | Role | Perk | Per-cycle bonus |");
w("|---|---|---|---|");
for (const v of VILLAGERS) {
  const spec = VILLAGER_SPECS[v.id];
  const bonus = !spec ? "—" : spec.item ? `1 × ${icon(spec.item)} ${nameOf(spec.item)}` : spec.coins ? `${spec.coins} × ${icon("coins")} Coins` : "—";
  w(`| **${v.name}**, ${v.title} | ${spec ? spec.icon + " " + spec.role : "—"} | ${spec ? spec.perkName : "—"} | ${bonus} |`);
}
w("");
w("**Veteran tiers.** Hours worked accumulate per villager and multiply their yield:");
w("");
w("| Tier | Hours worked | Yield |");
w("|---|---:|---:|");
for (const [ms, label, mult] of VETERAN_TIERS) w(`| ${label} | ${Math.round(ms / 3600000)}h | ×${mult} |`);
w("");
if (CRITTERS.length) {
  w(`The town also hosts ${CRITTERS.length} ambient critter${CRITTERS.length === 1 ? "" : "s"} — decorative, not catchable.`);
  w("");
}
w("### What they say");
w("");
for (const v of VILLAGERS) {
  w(`**${v.name}, ${v.title}**`);
  w("");
  for (const line of v.talk) w(`- ${line}`);
  w("");
}

// ————— Quests —————
w("## Quests");
w("");
w("Quests are given by **Eldric the Cartographer**, who waits beside the dungeon entrance");
w("in the deep wilds. Rewards are paid once, on completion.");
w("");
for (const q of QUESTS) {
  w(`### ${q.title}`);
  w("");
  w(`_Given by ${q.givenBy}._`);
  w("");
  w(q.summary);
  w("");
  if (q.objectives) {
    w("**Steps**");
    w("");
    for (const [stage, text] of Object.entries(q.objectives)) w(`1. ${text}  \`(${stage})\``);
    w("");
  } else if (q.objective) {
    w(`**Objective:** ${q.objective}`);
    w("");
  }
  w(`**Reward:** ${rewardText(q, nameOf)}`);
  w("");
}

// ————— Items —————
w("## Items index");
w("");
const byType = {};
for (const i of Object.values(ITEMS)) (byType[i.type] = byType[i.type] || []).push(i);
for (const [type, list] of Object.entries(byType).sort()) {
  w(`### ${type.charAt(0) + type.slice(1).toLowerCase()}`);
  w("");
  w("| Item | Value | Requirements | Notes |");
  w("|---|---:|---|---|");
  for (const i of list.sort((a, b) => a.name.localeCompare(b.name))) {
    w(`| ${icon(i.id)} **${i.name}** | ${i.value} | ${req(i.levelReq)} | ${i.desc} |`);
  }
  w("");
}

// ————— Achievements —————
w("## Achievements");
w("");
w("| Achievement | How to earn it |");
w("|---|---|");
for (const a of ACHIEVEMENTS) w(`| **${a.name}** | ${a.desc} |`);
w("");

// ————— Guides —————
// Hand-written, but every number it cites is pulled from the tables above so it
// cannot contradict them.
w("## Guides");
w("");
w("### Your first hour");
w("");
w("1. **Chop and mine in the settlement ring.** Your starter axe and pickaxe work on");
w("   anything nearby. You want logs, copper ore and tin ore.");
w("2. **Build a Sawmill, then a Smelter.** Both are cheap and both unlock a whole crafting");
w("   skill — planks from logs, bars from ore. Nothing else gates as much as these two.");
w("3. **Smelt bronze bars** (copper + tin) and forge a better axe and pickaxe. Tool tiers");
w("   are the single biggest gathering speed-up available early.");
w("4. **Build a Storage Bin.** The bulk cap fills faster than you expect; see below.");
w("5. **Cook before you fight.** Auto-eat fires at 40% HP and picks your highest-tier food,");
w("   so carry a stack of anything cooked before stepping into the wilderness ring.");
w("");
w("### Storage, and what the cap actually covers");
w("");
w("The storage cap applies to **bulk resources only** — logs, ore, bars, fish, planks and");
w("other stackable materials. Coins, keys, quest items, pets, tools and equipment are");
w("carried regardless, so a bag full of logs never blocks a coin drop or a quest reward.");
w("");
w("When the cap is hit, gathering and crafting stop with an *inventory full* message");
w("rather than silently discarding output. Sell or bank before a long offline stretch:");
w("offline gathering shares the same cap across every skill.");
w("");
w("### Combat");
w("");
w("Attack decides how often you hit, Strength how hard, Defence how often you are hit,");
w("and Hitpoints your pool (max HP = level + 9 + armour bonus). Weapons have an Attack");
w("level requirement; armour does not, but higher tiers carry better bonuses.");
w("");
w("Monsters in the wilderness ring aggro within their listed range. Rare tertiary and pet");
w("drops roll independently of the main table, so they can drop alongside a normal drop.");
w("");
w("### Offline progress");
w("");
w("While you are away the game credits gathering on your best available resource per");
w("skill, villager labour into the village stock, and Town Hall tax. The window is capped");
w("by your Town Hall level — upgrading it is the only way to extend it. Everything is");
w("still bounded by the storage cap, so an upgrade to the Storehouse pairs naturally with");
w("an upgrade to the Town Hall.");
w("");
w("### Settlement build order");
w("");
w("Sawmill → Smelter → Storage Bin → Campfire → Town Hall → Storehouse. The first two");
w("open crafting, the next two solve capacity and cooking speed, and the Town Hall is");
w("what turns offline time from a trickle into real progress.");
w("");

w("---");
w("");
w("_Generated by `scripts/gen-wiki.cjs`. Change the data, re-run `npm run wiki`._");

fs.writeFileSync(OUT, L.join("\n") + "\n");
fs.rmSync(EMIT, { recursive: true, force: true });

const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`wiki: WIKI.md written — ${L.length} lines, ${kb} kB`);
console.log(`      ${Object.keys(ITEMS).length} items · ${Object.keys(MONSTERS).length} monsters · ` +
  `${Object.keys(WEAPONS).length} weapons · ${RECIPES.length} recipes · ` +
  `${BUILDING_TYPES.length} buildings · ${ACHIEVEMENTS.length} achievements`);
