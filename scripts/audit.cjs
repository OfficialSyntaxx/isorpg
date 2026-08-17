#!/usr/bin/env node
// Deep project audit. `npm run audit`
//
// `npm test` is the fast gate that runs on every push: types, the UI structure
// audit, the QC suite, rig verification. This is the slower sweep that used to be
// done by hand each time — it looks for the classes of defect that repeatedly got
// through, every one of which shipped at least once in this project:
//
//   1. cross-table gaps      an item referenced by a recipe that does not exist,
//                            a weapon with no recipe, a bar nothing consumes
//   2. unreachable content   an item no recipe, drop, crop, clue or shop can give
//   3. producer/no consumer   state a system writes that nothing ever reads —
//                            the characteristic bug here (building levels that
//                            only scaled cost, animateMonster never called)
//   4. save gaps             a field that silently fails to survive a round-trip
//   5. dead weight           exports referenced nowhere, files in public/ that
//                            ship in every build for nothing
//   6. layout defects        zero-width labels, overflow, clipped panels — things
//                            no structural test can see
//   7. leaks / instability   heap growth, node growth, console errors over time
//
// Findings are BUG (broken now), WARN (probably wrong) or NOTE (worth knowing).
// Exit code is 1 if any BUG is found, so it can gate CI.
//
//   node scripts/audit.cjs              everything
//   node scripts/audit.cjs --quick      skip the browser passes (~5s instead of ~90s)
//   node scripts/audit.cjs --json       machine-readable output
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const QUICK = process.argv.includes("--quick");
const JSON_OUT = process.argv.includes("--json");

const findings = [];
const add = (sev, area, msg) => findings.push({ sev, area, msg });
const bug = (area, msg) => add("BUG", area, msg);
const warn = (area, msg) => add("WARN", area, msg);
const note = (area, msg) => add("NOTE", area, msg);

const stats = {};

// ————————————————————————————————————————————————————————————— helpers

function walk(dir, ext, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, acc);
    else if (e.name.endsWith(ext)) acc.push(p);
  }
  return acc;
}

const rel = (p) => path.relative(ROOT, p);

/** Compile a slice of the source tree to CommonJS so it can be required. */
function compile(outDir, include, exclude = []) {
  const emit = path.join(ROOT, outDir);
  fs.rmSync(emit, { recursive: true, force: true });
  fs.mkdirSync(emit, { recursive: true });
  const cfg = path.join(emit, "tsconfig.json");
  fs.writeFileSync(cfg, JSON.stringify({
    compilerOptions: {
      target: "ES2020", module: "CommonJS", moduleResolution: "Node",
      esModuleInterop: true, skipLibCheck: true, lib: ["ES2020", "DOM"],
      // rootDir pinned so emitted paths are predictable regardless of the input set.
      rootDir: path.join(ROOT, "src"), outDir: ".", noEmit: false, strict: false,
    },
    include, exclude,
  }, null, 2));
  try {
    execFileSync("npx", ["tsc", "-p", cfg], { cwd: ROOT, stdio: "pipe" });
  } catch (e) {
    // Some of the tree pulls in three.js DOM types; emit still lands.
    if (!fs.existsSync(path.join(emit, "data"))) throw e;
  }
  fs.writeFileSync(path.join(emit, "package.json"), '{"type":"commonjs"}');
  return emit;
}

function serveDist(port) {
  const MIME = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png",
    ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav",
  };
  const roots = [path.join(ROOT, "dist"), path.join(ROOT, "public")];
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(String(req.url).split("?")[0]);
    if (u === "/") u = "/index.html";
    for (const r of roots) {
      const f = path.join(r, u);
      if (f.startsWith(r) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
        return res.end(fs.readFileSync(f));
      }
    }
    res.writeHead(404);
    res.end("not found");
  });
  return new Promise((r) => srv.listen(port, () => r(srv)));
}

function findChrome() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers"].filter(Boolean);
  for (const root of roots) {
    let entries;
    try { entries = fs.readdirSync(root); } catch { continue; }
    for (const d of entries.filter((x) => x.startsWith("chromium")).sort().reverse()) {
      for (const f of ["chrome-linux/chrome", "chrome-linux/headless_shell", "chrome"]) {
        const p = path.join(root, d, f);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

// ————————————————————————————————————————————————————— 1. data integrity

function auditData() {
  const emit = compile(".audit-data", [
    path.join(ROOT, "src/data/**/*.ts"),
    path.join(ROOT, "src/components/**/*.ts"),
    path.join(ROOT, "src/world/Grid.ts"),
  ]);
  const D = (m) => require(path.join(emit, "data", m));
  const { ITEMS, ITEM_ICONS } = D("Items.js");
  const { RECIPES } = D("Recipes.js");
  const { MONSTERS, WEAPONS, FOODS } = D("Combat.js");
  const { BUILDINGS, BUILDING_TYPES } = D("Buildings.js");
  const { SKILLS, SKILL_IDS, RESOURCES } = D("Skills.js");
  const { SEEDS, SEED_IDS } = D("Farming.js");
  const { CLUE_TIER_LIST } = D("Clues.js");
  const { ACHIEVEMENTS } = D("Achievements.js");

  stats.items = Object.keys(ITEMS).length;
  stats.recipes = RECIPES.length;
  stats.monsters = Object.keys(MONSTERS).length;

  // Every referenced item id must exist.
  const refs = new Map();
  const ref = (id, where) => {
    if (!id) return;
    if (!refs.has(id)) refs.set(id, []);
    refs.get(id).push(where);
  };
  for (const r of RECIPES) {
    r.inputs.forEach((i) => ref(i.itemId, `recipe ${r.id} input`));
    ref(r.output.itemId, `recipe ${r.id} output`);
  }
  for (const [k, m] of Object.entries(MONSTERS)) {
    (m.main || []).forEach((d) => ref(d.itemId, `${k} main drop`));
    (m.tertiary || []).forEach((d) => ref(d.itemId, `${k} tertiary`));
    (m.petTable || []).forEach((d) => ref(d.itemId, `${k} pet`));
  }
  for (const t of BUILDING_TYPES) BUILDINGS[t].baseCost.forEach((c) => ref(c.itemId, `building ${t} cost`));
  for (const r of Object.values(RESOURCES)) (r.drops || []).forEach((d) => ref(d.itemId, `resource ${r.masteryKey}`));
  for (const id of SEED_IDS) { ref(id, "seed"); ref(SEEDS[id].produce.itemId, `seed ${id} produce`); }
  for (const t of CLUE_TIER_LIST) {
    ref(t.itemId, `clue ${t.tier}`);
    t.loot.forEach((l) => ref(l.itemId, `clue ${t.tier} loot`));
    ref(t.unique.itemId, `clue ${t.tier} unique`);
  }
  for (const w of Object.values(WEAPONS)) if (w.itemId) ref(w.itemId, `weapon ${w.id}`);
  for (const id of Object.keys(FOODS)) ref(id, "food table");
  for (const [id, where] of refs) {
    if (!ITEMS[id]) bug("data", `item "${id}" referenced by ${where.join(", ")} does not exist`);
  }

  // Reachability: something in the game must be able to give you each item.
  const source = new Set();
  for (const r of RECIPES) source.add(r.output.itemId);
  for (const m of Object.values(MONSTERS)) {
    (m.main || []).forEach((d) => source.add(d.itemId));
    (m.tertiary || []).forEach((d) => source.add(d.itemId));
    (m.petTable || []).forEach((d) => source.add(d.itemId));
  }
  for (const r of Object.values(RESOURCES)) (r.drops || []).forEach((d) => source.add(d.itemId));
  for (const id of SEED_IDS) source.add(SEEDS[id].produce.itemId);
  for (const t of CLUE_TIER_LIST) { t.loot.forEach((l) => source.add(l.itemId)); source.add(t.unique.itemId); }
  // Systems hand out items directly (starter kit, shop stock, dungeon chests,
  // quest rewards, villager labour). Scan them textually — an id in quotes next to
  // addItem/itemId is a grant.
  const systemSrc = [
    ...walk(path.join(ROOT, "src/systems"), ".ts"),
    ...walk(path.join(ROOT, "src/data"), ".ts"),
    path.join(ROOT, "src/main.ts"),
  ].filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
  for (const id of Object.keys(ITEMS)) {
    if (new RegExp(`["'\`]${id}["'\`]`).test(systemSrc)) source.add(id);
  }
  for (const id of Object.keys(ITEMS)) {
    if (!source.has(id)) warn("data", `item "${id}" (${ITEMS[id].name}) is unobtainable — no recipe, drop, crop, clue, shop row or grant`);
  }

  // Icons.
  for (const id of Object.keys(ITEMS)) if (!ITEM_ICONS[id]) warn("data", `item "${id}" has no icon (renders as ❔)`);
  for (const id of Object.keys(ITEM_ICONS)) if (!ITEMS[id]) note("data", `icon "${id}" has no matching item`);

  // Enum members with nothing behind them: a promise the code is not keeping.
  const types = new Set(Object.values(ITEMS).map((i) => i.type));
  for (const t of ["LOG", "ORE", "BAR", "FOOD", "FISH", "SEED", "GEM", "TOOL", "MATERIAL", "MISC"]) {
    if (!types.has(t)) warn("data", `ItemType "${t}" has zero items`);
  }
  const slots = new Set(Object.values(ITEMS).filter((i) => i.equip).map((i) => i.equip.slot));
  for (const s of ["weapon", "offhand", "head", "body", "legs"]) {
    if (!slots.has(s)) warn("data", `EquipSlot "${s}" has zero items`);
  }

  // Progression chains must not dead-end.
  for (const w of Object.values(WEAPONS)) {
    if (w.itemId && !RECIPES.some((r) => r.output.itemId === w.itemId)) {
      warn("data", `weapon ${w.id} (${w.name}) cannot be crafted`);
    }
  }
  for (const id of Object.keys(ITEMS)) {
    if (ITEMS[id].type !== "BAR") continue;
    if (!RECIPES.some((r) => r.inputs.some((i) => i.itemId === id))) warn("data", `bar "${id}" is consumed by nothing`);
  }
  for (const id of SEED_IDS) {
    const p = SEEDS[id].produce.itemId;
    const used = RECIPES.some((r) => r.inputs.some((i) => i.itemId === p)) || !!FOODS[p];
    if (!used) warn("data", `crop "${p}" feeds no recipe and is not food`);
  }

  // Drop tables.
  for (const [k, m] of Object.entries(MONSTERS)) {
    const total = (m.main || []).reduce((a, d) => a + d.weight, 0);
    if (!m.main || !m.main.length) warn("data", `monster ${k} has no main drop table`);
    else if (total <= 0) bug("data", `monster ${k} main weights sum to ${total}`);
    for (const d of [...(m.main || []), ...(m.tertiary || [])]) {
      if (d.min > d.max) bug("data", `monster ${k} drop ${d.itemId}: min ${d.min} > max ${d.max}`);
    }
    for (const t of m.tertiary || []) {
      if (!(t.chance > 0 && t.chance <= 1)) bug("data", `monster ${k} tertiary ${t.itemId} chance ${t.chance} outside (0,1]`);
    }
  }

  // Skills and achievements.
  for (const s of SKILL_IDS) if (!SKILLS[s]) bug("data", `SKILL_IDS lists "${s}" with no SKILLS entry`);
  for (const s of Object.keys(SKILLS)) if (!SKILL_IDS.includes(s)) bug("data", `SKILLS has "${s}" missing from SKILL_IDS`);
  for (const s of Object.values(SKILLS)) {
    if (s.kind === "gathering" && !Object.values(RESOURCES).some((r) => r.skill === s.id)) {
      warn("data", `gathering skill "${s.id}" has no resources`);
    }
  }
  const seen = new Set();
  for (const a of ACHIEVEMENTS) {
    if (seen.has(a.id)) bug("data", `duplicate achievement id "${a.id}"`);
    seen.add(a.id);
    if (!a.name || !a.desc || typeof a.test !== "function") bug("data", `achievement "${a.id}" is incomplete`);
  }
  fs.rmSync(emit, { recursive: true, force: true });
}

// ——————————————————————————————————————————————— 2. save round-trip

function auditSave() {
  const emit = compile(".audit-save", [path.join(ROOT, "src/**/*.ts")], [path.join(ROOT, "src/main.ts")]);
  const { createFreshState } = require(path.join(emit, "state", "GameState.js"));
  const { Grid } = require(path.join(emit, "world", "Grid.js"));
  const { SaveSystem } = require(path.join(emit, "systems", "SaveSystem.js"));

  const g = new Grid();
  const a = createFreshState(g, "Corvin", 21, 21);
  // Distinctive values in every persisted group. A field that does not come back
  // is a save gap — the sanitizer silently dropped the P6-P8 blocks this way once.
  a.player.health.hp = 37; a.player.health.maxHp = 99;
  a.player.skills.woodcutting.xp = 12345; a.player.skills.woodcutting.mastery.normal = 678;
  a.player.skills.farming.xp = 999; a.player.skills.farming.mastery.potato = 42;
  a.player.inventory.items = [{ id: "normal_log", amount: 11 }, { id: "coins", amount: 2222 }];
  a.player.equipped = { weapon: "bronze_sword", offhand: "wayfarers_lantern", head: "bronze_helm" };
  a.player.map = { discovered: ["town", "caves"], fastTravel: true, explored: [5, 6, 7] };
  a.player.journal = ["caves"];
  a.player.meta = { kills: { giant_rat: 9 }, achievements: ["first_blood"], counters: { clues_done: 3 } };
  a.player.clue = { tier: "hard", seed: 4242, step: 1, sites: [{ x: 4, y: 9 }, { x: 30, y: 12 }, { x: 8, y: 33 }] };
  a.clock = { minute: 777, day: 5 };
  a.town.buildings = [{ id: "b1", type: "SAWMILL", x: 20, y: 20, level: 3 }];
  a.town.labour = { assignments: { bram: "mining" }, stock: { normal_log: 14 }, acc: { bram: 500 }, worked: { bram: 7200000 } };
  a.town.market = { supply: { oak_log: 55 }, demand: { coins: 6 } };
  a.town.farm = { plots: [{ seedId: "cabbage_seed", plantedAt: 1700000000000 }, null] };
  a.collectionLog = new Set(["normal_log", "coins", "potato"]);
  a.settings = { autoEatPct: 75 };

  const payload = new SaveSystem(a).serialize();
  const b = createFreshState(new Grid(), "x", 1, 1);
  const res = new SaveSystem(b).apply(JSON.parse(JSON.stringify(payload)));
  if (!res.ok) bug("save", "apply() rejected its own serialize() output");

  const cmp = (label, x, y) => {
    if (JSON.stringify(x) !== JSON.stringify(y)) {
      bug("save", `${label} did not survive a round-trip — saved ${JSON.stringify(x)}, loaded ${JSON.stringify(y)}`);
    }
  };
  cmp("player.name", a.player.name, b.player.name);
  cmp("player.position", { x: a.player.pos.gx, y: a.player.pos.gy }, { x: b.player.pos.gx, y: b.player.pos.gy });
  cmp("player.health", a.player.health, b.player.health);
  cmp("skills.woodcutting", a.player.skills.woodcutting, b.player.skills.woodcutting);
  cmp("skills.farming", a.player.skills.farming, b.player.skills.farming);
  cmp("inventory.items", a.player.inventory.items, b.player.inventory.items);
  cmp("player.equipped", a.player.equipped, b.player.equipped);
  cmp("player.map", a.player.map, b.player.map);
  cmp("player.journal", a.player.journal, b.player.journal);
  cmp("player.meta", a.player.meta, b.player.meta);
  cmp("player.clue", a.player.clue, b.player.clue);
  cmp("clock", a.clock, b.clock);
  cmp("town.buildings", a.town.buildings, b.town.buildings);
  cmp("town.labour", a.town.labour, b.town.labour);
  cmp("town.market", a.town.market, b.town.market);
  cmp("town.farm", a.town.farm, b.town.farm);
  cmp("collectionLog", [...a.collectionLog].sort(), [...b.collectionLog].sort());
  cmp("settings", a.settings, b.settings);
  stats.saveFields = 18;
  fs.rmSync(emit, { recursive: true, force: true });
}

// ————————————————————————————————————————————— 3. dead code & assets

function auditDeadWeight() {
  const src = walk(path.join(ROOT, "src"), ".ts");
  const others = walk(path.join(ROOT, "tests"), ".ts");
  const txt = new Map([...src, ...others].map((f) => [f, fs.readFileSync(f, "utf8")]));
  const scriptSrc = walk(path.join(ROOT, "scripts"), ".cjs").map((f) => fs.readFileSync(f, "utf8")).join("\n");

  let dead = 0;
  for (const f of src) {
    const s = txt.get(f);
    const names = [];
    for (const re of [
      /^export (?:async )?function ([A-Za-z_]\w*)/gm,
      /^export (?:const|let) ([A-Za-z_]\w*)/gm,
      /^export class ([A-Za-z_]\w*)/gm,
    ]) for (const m of s.matchAll(re)) names.push(m[1]);

    for (const n of names) {
      let external = 0;
      for (const [g, t] of txt) { if (g !== f && new RegExp(`\\b${n}\\b`).test(t)) external++; }
      if (scriptSrc.includes(n)) external++;
      if (external > 0) continue;
      const declRe = new RegExp(`^export (?:async function |function |const |let |class )${n}\\b`, "m");
      const selfUses = s.split("\n").filter((l) => !declRe.test(l) && new RegExp(`\\b${n}\\b`).test(l)).length;
      if (selfUses === 0) { note("dead", `${rel(f)} exports "${n}" — referenced nowhere`); dead++; }
    }
  }
  stats.deadExports = dead;

  // Files in public/ ship in every build. hero.png sat there at 612 kB for weeks
  // after the 3D hero replaced it.
  const haystack = [...src, path.join(ROOT, "index.html")]
    .filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const scan = (dir, prefix = "") => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const r = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) { scan(p, r); continue; }
      const base = e.name.replace(/\..*$/, ""); // clips are x.clip.json, referenced as "x"
      if (haystack.includes(r) || haystack.includes(e.name) || new RegExp(`["'\`]${base}["'\`]`).test(haystack)) continue;
      warn("dead", `public/${r} (${Math.round(fs.statSync(p).size / 1024)} kB) is referenced nowhere but ships in every build`);
    }
  };
  if (fs.existsSync(path.join(ROOT, "public"))) scan(path.join(ROOT, "public"));

  // Escape hatches and leftovers.
  for (const f of [...src, ...others]) {
    const s = txt.get(f);
    for (const m of s.matchAll(/\b(TODO|FIXME|HACK|XXX)\b/g)) note("dead", `${rel(f)} has a ${m[1]} marker`);
    for (const m of s.matchAll(/@ts-(ignore|expect-error)/g)) warn("dead", `${rel(f)} uses @ts-${m[1]}`);
    if (f.startsWith(path.join(ROOT, "src")) && /^\s*console\.log\(/m.test(s)) warn("dead", `${rel(f)} has a console.log left in src/`);
  }

  // Oversized assets worth recompressing.
  for (const f of walk(path.join(ROOT, "public"), ".png")) {
    const kb = Math.round(fs.statSync(f).size / 1024);
    if (kb > 400) note("perf", `public/${rel(f).replace(/^public\//, "")} is ${kb} kB as PNG — a JPEG would typically be ~10% of that`);
  }
}

// ————————————————————————————————————— 4. producer with no consumer

function auditWiring() {
  // The characteristic bug: a system writes a field and nothing reads it back.
  // Checked by name because these are cross-module and the compiler cannot see it.
  const src = walk(path.join(ROOT, "src"), ".ts");
  const all = new Map(src.map((f) => [f, fs.readFileSync(f, "utf8")]));
  const joined = [...all.values()].join("\n");

  // Fields assigned on an object elsewhere (`x.foo = `) but never read (`.foo` in a
  // non-assignment position). Restricted to the state/entity shapes worth checking.
  const WATCH = [
    "flashUntil", "enraged", "respawnAt", "inCombat", "heroFlashUntil",
    "pendingDig", "pendingNode", "activeSkill", "storageCap", "autoEatPct",
  ];
  for (const field of WATCH) {
    const writes = [...joined.matchAll(new RegExp(`[\\w\\]\\)]\\.${field}\\s*=[^=]`, "g"))].length;
    const reads = [...joined.matchAll(new RegExp(`[\\w\\]\\)]\\.${field}\\b(?!\\s*=[^=])`, "g"))].length;
    if (writes > 0 && reads === 0) bug("wiring", `"${field}" is written ${writes}x and never read — computed and never used`);
  }

  // Anything a frame loop must drive. A missing call here is silent: the game
  // computes a pose or a tint that nobody draws.
  const main = all.get(path.join(ROOT, "src/main.ts")) || "";
  const frame = (() => {
    const at = main.indexOf("private frame(dt: number) {");
    if (at < 0) return "";
    let d = 0;
    for (let i = at; i < main.length; i++) {
      if (main[i] === "{") d++;
      else if (main[i] === "}") { d--; if (d === 0) return main.slice(at, i); }
    }
    return "";
  })();
  for (const fn of ["animateMonster", "updateFx", "flashHero", "updateModelMixers"]) {
    if (!joined.includes(`export function ${fn}`)) continue;
    const calledSomewhere = new RegExp(`\\b${fn}\\(`).test(main);
    if (!calledSomewhere) bug("wiring", `${fn}() is exported but never called from main.ts`);
    else if (!frame.includes(`${fn}(`) && !main.includes(`${fn}(`)) warn("wiring", `${fn}() is not called from frame()`);
  }
}

// ————————————————————————————————————————————— 5. UI layout sweep

async function auditUi() {
  let pw;
  try { pw = require("playwright"); } catch { note("ui", "playwright not installed — layout sweep skipped"); return; }
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) { warn("ui", "no dist/ — run `npm run build` before auditing the UI"); return; }

  const PORT = 4230;
  const srv = await serveDist(PORT);
  const exe = process.env.CHROME_PATH || findChrome();
  const browser = await pw.chromium.launch({ args: ["--no-sandbox", "--headless=new"], ...(exe ? { executablePath: exe } : {}) });
  const PANELS = [
    ["Bag", "#btn-inventory"], ["Craft", "#btn-craft"], ["Build", "#btn-build"],
    ["Map", "#btn-map"], ["Quests", "#btn-quest"], ["Progress", "#btn-progress"],
    ["Village", "#btn-village"], ["Menu", "#btn-settings"],
  ];
  // A save rich enough that every panel has rows to lay out. An empty panel hides
  // exactly the defects this pass is looking for.
  const save = (now) => ({
    version: "1.1.0", timestamp: now,
    player: {
      name: "Corvin", position: { x: 21, y: 21 }, stats: { hp: 30, maxHp: 60 },
      skills: { woodcutting: { xp: 15000, mastery: { normal: 400 } }, farming: { xp: 4000, mastery: {} }, construction: { xp: 5000, mastery: {} }, cooking: { xp: 9000, mastery: {} }, smithing: { xp: 9000, mastery: {} }, attack: { xp: 8000, mastery: {} } },
      inventory: [
        { id: "coins", amount: 12345 }, { id: "normal_log", amount: 230 }, { id: "bronze_sword", amount: 1 },
        { id: "bronze_helm", amount: 1 }, { id: "wayfarers_lantern", amount: 1 }, { id: "potato_seed", amount: 9 },
        { id: "clue_hard", amount: 2 }, { id: "iron_ore", amount: 44 }, { id: "cooked_trout", amount: 12 },
      ],
      equipped: { weapon: "bronze_sword", head: "bronze_helm", offhand: "wayfarers_lantern" },
      map: { discovered: ["town", "caves", "eldric"], fastTravel: true, explored: [1, 2, 3] },
      journal: ["caves"],
      meta: { kills: { giant_rat: 12, goblin: 4 }, achievements: ["first_blood"], counters: { clues_done: 2, shop_bought: 11 } },
      clue: { tier: "hard", seed: 9, step: 1, sites: [{ x: 10, y: 30 }, { x: 33, y: 8 }, { x: 6, y: 35 }] },
    },
    town: {
      buildings: [
        { id: "a", type: "STOREHOUSE", x: 20, y: 20, level: 2 }, { id: "b", type: "FARM_PLOT", x: 22, y: 20, level: 2 },
        { id: "c", type: "SAWMILL", x: 20, y: 22, level: 1 }, { id: "d", type: "CAMPFIRE", x: 22, y: 22, level: 1 },
      ],
      labour: { assignments: { bram: "mining", wren: "woodcutting" }, stock: { normal_log: 40, copper_ore: 12 }, acc: {}, worked: { bram: 8000000 } },
      market: { supply: { oak_log: 30 }, demand: {} },
      farm: { plots: [{ seedId: "potato_seed", plantedAt: now - 400000 }, { seedId: "cabbage_seed", plantedAt: now - 60000 }] },
    },
    collectionLog: { unlocked: ["normal_log", "coins", "potato", "iron_ore", "bronze_sword"] },
    settings: { autoEatPct: 50 }, clock: { minute: 600, day: 3 },
  });

  try {
    for (const [label, vw, vh] of [["phone", 390, 844], ["desktop", 1280, 900]]) {
      const page = await browser.newPage({ viewport: { width: vw, height: vh } });
      page.on("pageerror", (e) => bug("ui", `[${label}] page error: ${String(e.message).slice(0, 140)}`));
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
      await page.evaluate((s) => localStorage.setItem("isorpg_save", JSON.stringify(s)), save(Date.now()));
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
      await page.waitForSelector("#bottom-bar", { timeout: 25000 });
      await page.waitForTimeout(2500);

      if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) {
        bug("ui", `[${label}] the page scrolls horizontally`);
      }
      for (const [name, sel] of PANELS) {
        const exists = await page.$(sel);
        if (!exists) { warn("ui", `[${label}] ${name}: button ${sel} is missing`); continue; }
        await page.evaluate((s) => document.querySelector(s).click(), sel);
        await page.waitForTimeout(420);
        const tabs = await page.$$eval("[data-meta-tab],[data-village-tab],[data-skill]", (els) =>
          [...new Set(els.map((x) => x.getAttribute("data-meta-tab") || x.getAttribute("data-village-tab") || x.getAttribute("data-skill")).filter(Boolean))]);
        for (const t of [null, ...tabs]) {
          if (t) {
            await page.evaluate((tv) => {
              const el = document.querySelector(`[data-meta-tab="${tv}"],[data-village-tab="${tv}"],[data-skill="${tv}"]`);
              if (el) el.click();
            }, t);
            await page.waitForTimeout(300);
          }
          const r = await page.evaluate(() => {
            const body = document.querySelector(".panel-body"), panel = document.querySelector(".panel");
            if (!body || !panel) return null;
            const names = [...body.querySelectorAll(".inv-name")];
            return {
              zero: names.filter((e) => e.getBoundingClientRect().width < 8).length,
              rows: names.length,
              overflowX: body.scrollWidth > body.clientWidth + 1,
              offscreen: [...body.querySelectorAll(".inv-row,.log-cell")].filter((e) => {
                const q = e.getBoundingClientRect();
                return q.right > window.innerWidth + 1 || q.left < -1;
              }).length,
              wasted: Math.round(panel.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom - 16),
              scrolls: body.scrollHeight > body.clientHeight + 1,
            };
          });
          const tag = `[${label}] ${name}${t ? "/" + t : ""}`;
          if (!r) { warn("ui", `${tag}: no panel body`); continue; }
          if (r.zero > 0) bug("ui", `${tag}: ${r.zero}/${r.rows} row labels are ~0px wide`);
          if (r.overflowX) bug("ui", `${tag}: the panel body scrolls horizontally`);
          if (r.offscreen > 0) bug("ui", `${tag}: ${r.offscreen} rows extend past the viewport`);
          if (r.wasted > 120 && r.scrolls) warn("ui", `${tag}: ${r.wasted}px of unused panel below a scrolling body`);
        }
        await page.evaluate(() => document.querySelector(".panel-close")?.click());
        await page.waitForTimeout(200);
      }
      await page.close();
    }
    stats.uiPanels = PANELS.length * 2;
  } finally {
    await browser.close();
    srv.close();
  }
}

// ————————————————————————————————————————— 6. stability & leaks

async function auditStability(seconds = 35) {
  let pw;
  try { pw = require("playwright"); } catch { return; }
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) return;

  const PORT = 4231;
  const srv = await serveDist(PORT);
  const exe = process.env.CHROME_PATH || findChrome();
  const browser = await pw.chromium.launch({ args: ["--no-sandbox", "--headless=new"], ...(exe ? { executablePath: exe } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    const errs = new Set();
    page.on("pageerror", (e) => errs.add(String(e.message).slice(0, 140)));
    const bad = new Set();
    page.on("response", (r) => { if (r.status() >= 400) bad.add(`${r.status()} ${r.url().split("/").pop()}`); });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
    await page.waitForSelector("#bottom-bar", { timeout: 25000 });
    await page.waitForTimeout(3000);
    const snap = () => page.evaluate(() => ({
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
      nodes: document.querySelectorAll("*").length,
      toasts: document.querySelectorAll("#toast-root > *").length,
    }));
    const before = await snap();
    // Drive it: pan, zoom, open panels, tap the world.
    for (let i = 0; i < 5; i++) {
      await page.mouse.move(400, 400); await page.mouse.down();
      await page.mouse.move(500, 460, { steps: 6 }); await page.mouse.up();
      await page.mouse.wheel(0, i % 2 ? -120 : 120);
      await page.evaluate(() => document.querySelector("#btn-inventory")?.click());
      await page.waitForTimeout(180);
      await page.evaluate(() => document.querySelector(".panel-close")?.click());
      await page.mouse.move(430, 380);
      await page.mouse.click(430, 380, { delay: 0 });
      await page.waitForTimeout(320);
    }
    await page.waitForTimeout(seconds * 1000);
    const after = await snap();
    stats.heap = `${before.heap} → ${after.heap} MB`;
    stats.nodes = `${before.nodes} → ${after.nodes}`;
    if (after.heap > 0 && before.heap > 0 && after.heap > before.heap * 2.5) {
      warn("perf", `heap grew ${before.heap} → ${after.heap} MB over ${seconds}s — possible leak`);
    }
    if (after.nodes > before.nodes * 3) warn("perf", `DOM grew ${before.nodes} → ${after.nodes} nodes over ${seconds}s`);
    if (after.toasts > 6) warn("perf", `${after.toasts} toasts still in the DOM — they are not being removed`);
    for (const e of errs) bug("perf", `runtime error during play: ${e}`);
    for (const b of bad) {
      // A missing favicon is the browser's own request, not a game asset.
      if (/favicon/.test(b)) continue;
      bug("perf", `failed request during play: ${b}`);
    }
  } finally {
    await browser.close();
    srv.close();
  }
}

// ————————————————————————————————————————————————————————— report

async function main() {
  const t0 = Date.now();
  const step = async (label, fn) => {
    if (!JSON_OUT) process.stderr.write(`  … ${label}\n`);
    try { await fn(); } catch (e) { bug("audit", `${label} failed to run: ${e.message}`); }
  };

  if (!JSON_OUT) process.stderr.write(`\nAuditing ${rel(ROOT) || "."}${QUICK ? " (quick)" : ""}\n`);
  await step("data integrity", auditData);
  await step("save round-trip", auditSave);
  await step("dead code & assets", auditDeadWeight);
  await step("producer/consumer wiring", auditWiring);
  if (!QUICK) {
    await step("UI layout sweep", auditUi);
    await step("stability", () => auditStability(35));
  }

  const bugs = findings.filter((f) => f.sev === "BUG");
  const warns = findings.filter((f) => f.sev === "WARN");
  const notes = findings.filter((f) => f.sev === "NOTE");

  if (JSON_OUT) {
    console.log(JSON.stringify({ findings, stats, bugs: bugs.length, warns: warns.length, notes: notes.length }, null, 2));
  } else {
    const order = { BUG: 0, WARN: 1, NOTE: 2 };
    console.log("");
    for (const f of [...findings].sort((a, b) => order[a.sev] - order[b.sev] || a.area.localeCompare(b.area))) {
      console.log(`${f.sev.padEnd(4)} [${f.area}] ${f.msg}`);
    }
    if (!findings.length) console.log("No findings.");
    console.log("");
    console.log(`${bugs.length} bug(s) · ${warns.length} warning(s) · ${notes.length} note(s)   in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    const bits = Object.entries(stats).map(([k, v]) => `${k}: ${v}`);
    if (bits.length) console.log(bits.join(" · "));
    if (QUICK) console.log("(quick mode — UI layout and stability were skipped)");
  }
  process.exit(bugs.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
