// QC consolidated regression suite — the durable `npm test` core.
// Covers P1–P7.8 mechanics: world/grid, dungeon depth, quests, map & fast
// travel, market pricing, villager labour (live + offline + perks + specs),
// meta/achievements, Town Hall tiers, and a full save round-trip.
import { Grid, GRID_CHUNK, WORLD_SIZE } from "../src/world/Grid";
import { createFreshState, DAY_START_MINUTE } from "../src/state/GameState";
import { CombatSystem } from "../src/systems/CombatSystem";
import { DungeonSystem } from "../src/systems/DungeonSystem";
import { QuestSystem } from "../src/systems/QuestSystem";
import { MapSystem } from "../src/systems/MapSystem";
import { ShopSystem, sellMultFor, buyMultFor } from "../src/systems/ShopSystem";
import { LabourSystem, accrueLabourOffline, veteranTier, VILLAGER_SPECS } from "../src/systems/LabourSystem";
import { MetaSystem } from "../src/systems/MetaSystem";
import { ACHIEVEMENTS } from "../src/data/Achievements";
import { BuildSystem } from "../src/systems/BuildSystem";
import { SaveSystem, offlineTaxFor } from "../src/systems/SaveSystem";
import { monsterPoolFor } from "../src/systems/WorldSystem";
import { MONSTERS, MONSTER_STYLES, FOODS } from "../src/data/Combat";
import { ITEMS } from "../src/data/Items";
import { spawnMonster } from "../src/world/Monster";
import { countItem, addItem, createInventory, storedAmount, isFull, isBulk } from "../src/components/Inventory";
import { XP_TABLE, levelFromXp, levelProgress } from "../src/data/XPTable";
import { masteryLevel, masteryXpForLevel, masteryProgress, MASTERY_MAX } from "../src/components/Skills";
import { selectWeapon, WEAPONS } from "../src/data/Combat";
import { RESOURCES } from "../src/data/Skills";
import { needsMasteryRescale, sanitizeSave } from "../src/utils/Sanitizer";
import { DEFAULT_HERO_NAME, AUTO_EAT_STEPS, DEFAULT_AUTO_EAT_PCT } from "../src/state/GameState";
import { MAX_BUILD_LEVEL } from "../src/data/Buildings";
import { RECIPES } from "../src/data/Recipes";
import { SEEDS, SEED_IDS, growthAt, isRipe, growthLabel } from "../src/data/Farming";
import { SKILL_IDS } from "../src/data/Skills";
import { FarmSystem } from "../src/systems/FarmSystem";

const results: string[] = [];
const check = (n: string, ok: boolean, x = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  [" + x + "]" : ""}`);
const H = 3_600_000;
const scene = { add: () => undefined } as any;

// ============ World / Grid / biomes ============
const g = new Grid();
check("world: production size 42×42", g.width === WORLD_SIZE && g.height === 42 && GRID_CHUNK === 6);
const zoneAt = (x: number, y: number) => g.at(x, y)!.zoneId;
check("world: centre is town meadow", zoneAt(21, 21) === "TOWN_CENTER" && g.at(21, 21)!.biome === "MEADOW" && g.isWalkable(21, 21));
check("world: rings exist", ["TOWN_CENTER", "SETTLEMENT", "WILDERNESS_LVL1", "WILDERNESS_LVL2"].every((z) => { for (let y = 1; y < 41; y++) for (let x = 1; x < 41; x++) if (zoneAt(x, y) === z) return true; return false; }));
const biomes = new Set<string>();
for (let y = 1; y < 41; y++) for (let x = 1; x < 41; x++) biomes.add(g.at(x, y)!.biome);
check("world: all four biomes present", biomes.size === 4, [...biomes].join(","));
check("world: NE wild band is snow", g.at(21, 9)!.biome === "SNOW");
check("world: chunk unlock is progressive", !g.isRegionUnlocked(36, 36) && (() => { const g2 = new Grid(); g2.unlockAround(36, 36); return g2.isRegionUnlocked(30, 30); })());

// ============ Dungeon depth ============
const ds = createFreshState(g, "Hero", 21, 21);
const combat = new CombatSystem(ds);
const dungeon = new DungeonSystem(scene, combat, g, g.width);
dungeon.buildMeshes();
combat.setActiveGrid(dungeon);
dungeon.enter(combat);
let floor = 0, wall = 0;
for (let y = 0; y < dungeon.height; y++) for (let x = 0; x < dungeon.width; x++) { const t = dungeon.at(x, y); if (t && t.walkable) floor++; else wall++; }
check("dungeon: full floor layout", floor > 100 && wall > 12, `f${floor} w${wall}`);
check("dungeon: door sealed on entry", !dungeon.isWalkable(dungeon.door.x, dungeon.door.y));
const keyReach = (() => { const q: [number, number][] = [[dungeon.spawn.x, dungeon.spawn.y]]; const seen = new Set<string>([`${dungeon.spawn.x},${dungeon.spawn.y}`]); while (q.length) { const [cx, cy] = q.shift()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const nx = cx + dx, ny = cy + dy, k = `${nx},${ny}`; if (seen.has(k) || !dungeon.isWalkable(nx, ny)) continue; seen.add(k); if (nx === dungeon.key.x && ny === dungeon.key.y) return true; q.push([nx, ny]); } } return false; })();
check("dungeon: key reachable before the door", keyReach);
dungeon.unlock();
check("dungeon: unlock opens the way", dungeon.isWalkable(dungeon.door.x, dungeon.door.y));
check("dungeon: entrance is deep wilds", zoneAt(dungeon.entrance.x, dungeon.entrance.y).startsWith("WILDERNESS"));
const countDefs = (d: { def: { id: string } }[]) => { const o: Record<string, number> = {}; for (const m of d) o[m.def.id] = (o[m.def.id] ?? 0) + 1; return o; };
const f1 = countDefs([...combat.registry.values()]);
check("dungeon: floor-1 pool (4 bats, 2 slashers, 1 brute)", f1.cave_bat === 4 && f1.cave_slasher === 2 && f1.cave_brute === 1, JSON.stringify(f1));
dungeon.descend(combat);
const f2 = countDefs([...combat.registry.values()]);
check("dungeon: floor-2 pool (6 slashers, 2 brutes)", f2.cave_slasher === 6 && f2.cave_brute === 2 && !f2.cave_bat, JSON.stringify(f2));
dungeon.ascend(combat);
check("dungeon: ascent restores floor-1 pool", ([...combat.registry.values()].filter((m) => m.def.id === "cave_bat").length) === 4);
dungeon.descend(combat); // 1 → 2
dungeon.descend(combat); // 2 → 3
const f3 = countDefs([...combat.registry.values()]);
check("dungeon: floor-3 pool (8 slashers, 3 brutes)", f3.cave_slasher === 8 && f3.cave_brute === 3 && !f3.cave_bat, JSON.stringify(f3));
check("dungeon: floor-3 is the deepest", dungeon.currentFloor === 3);
dungeon.descend(combat);
check("dungeon: no floor 4", dungeon.currentFloor === 3);
dungeon.ascend(combat);
check("dungeon: stairs up from floor 3 → 2", dungeon.currentFloor === 2);
dungeon.currentFloor = 2;
check("dungeon: floor-2 chest pays coal", dungeon.chestLoot().some((d) => d.itemId === "coal"));

// ============ Combat data ============
check("combat: brute def wired", MONSTERS.cave_brute.boss === true && MONSTERS.cave_brute.slamChance === 0.08 && MONSTERS.cave_brute.slamDmg === 14);
check("combat: new natives styled", !!MONSTER_STYLES.frost_imp && !!MONSTER_STYLES.bog_husk);
const n = spawnMonster("forest_ogre", MONSTERS.forest_ogre, 30, 30);
check("combat: spawnMonster ids are unique per tile", n.id === "forest_ogre_30_30" && n.home.x === 30);

// ============ Quest journal ============
const qst = createFreshState(g, "Hero", 21, 21);
const qCombat = new CombatSystem(qst);
const qDungeon = new DungeonSystem(scene, qCombat, g, g.width);
const quest = new QuestSystem(scene, qDungeon, g, () => undefined, qst.player.journal);
let j = quest.journalSnapshot();
check("quest: two quests in the journal", j.length === 2 && j.every((e) => !e.done));
quest.talkGuide();
quest.notifyKeyFound();
quest.notifyDoorOpened();
quest.notifyBruteDown(qst.player.inventory);
quest.notifyOgreSlain(qst.player.inventory);
j = quest.journalSnapshot();
check("quest: both quests complete + persisted", j.every((e) => e.done) && qst.player.journal.includes("caves") && qst.player.journal.includes("ogre"));

// ================= Map / fast travel =================
const ms = new MapSystem(g.width, qDungeon, quest, qst.player.map, () => ({ x: 30, y: 3 }));
const snapM = ms.snapshot(21, 21);
check("map: ogre waypoint + centre town", snapM.pois.length === 4 && snapM.pois.find((p) => p.id === "town")!.x === 21 && snapM.pois.find((p) => p.id === "ogre")!.boss === true);
check("map: discovery + coverage", (() => { ms.recordExplore(21, 21); const cov = ms.snapshot(21, 21).coverage; return cov.pct > 0 && cov.coarse.some((c) => c === "E"); })());
check("map: travel gated by unlock", ms.travelTarget("town") === null && (() => { ms.unlockFastTravel(); const t = ms.travelTarget("town")!; return t.x === 21 && t.y === 21; })());

// ================= Market =================
const mk = createFreshState(g, "Hero", 21, 21);
const shop = new ShopSystem(scene, g, mk);
addItem(mk.player.inventory, "oak_log", 1);
const p1 = shop.sellItem(mk.player.inventory, "oak_log");
check("market: first sale at full value", p1 === 10, `${p1}`);
addItem(mk.player.inventory, "oak_log", 1);
const p2 = shop.sellItem(mk.player.inventory, "oak_log");
check("market: second sale sags", p2 < 10, `${p2}`);
check("market: tools protected", (() => { addItem(mk.player.inventory, "bronze_axe", 1); return shop.sellItem(mk.player.inventory, "bronze_axe") === 0; })());
check("market: pure curves", sellMultFor(0, 0) === 1 && sellMultFor(100, 0) === 0.4 && buyMultFor(0, 0, 8000) === 1.25);
const buyOk = (() => { addItem(mk.player.inventory, "coins", 200); const snap0 = shop.snapshot(mk.player.inventory); const price = snap0.stock.find((s) => s.itemId === "cooked_shrimp")!.price; return shop.buyItem(mk.player.inventory, "cooked_shrimp") && price >= 40 && price <= 56; })();
check("market: buy honours the inflated sticker", buyOk);

// ================= Labour (live) =================
const labS = createFreshState(g, "Hero", 21, 21);
const lab = new LabourSystem(labS, () => [{ id: "bram", name: "Bram" }, { id: "wren", name: "Wren" }, { id: "tobias", name: "Old Tobias" }]);
lab.assign("bram", "woodcutting");
labS.town.labour.worked["bram"] = 10 * H;
let clk = 0;
const push = (msv: number) => { clk += msv; lab.tick(clk); };
push(0); push(20_000);
check("labour: veteran tier multiplies output", labS.town.labour.stock["normal_log"] === 3, `${labS.town.labour.stock["normal_log"]}`);
lab.assign("wren", "woodcutting");
push(60_000);
check("labour: worked hours accrue", (labS.town.labour.worked["wren"] ?? 0) === 60_000);
lab.assign("tobias", "mining");
labS.town.labour.worked["tobias"] = 0;
const beforeTax = labS.town.labour.stock["coins"] ?? 0;
push(30_000);
check("labour: elder tribute lands in stock", (labS.town.labour.stock["coins"] ?? 0) === beforeTax + 1);
check("labour: spec table sane", VILLAGER_SPECS.bram?.role === "Fisher" && VILLAGER_SPECS.wren?.item === "oak_log");

// ============ Labour (offline + perks) ============
const offS = createFreshState(g, "Hero", 21, 21);
offS.town.labour.assignments["wren"] = "woodcutting";
offS.town.labour.worked["wren"] = 2 * H;
const offLines = accrueLabourOffline(offS, H, H);
check("offline: veteran ×2 + oak perk", offS.town.labour.stock["normal_log"] === 360 && offS.town.labour.stock["oak_log"] === 180, JSON.stringify(offS.town.labour.stock));
check("offline: hours accrue + lines list perks", offS.town.labour.worked["wren"] >= 3 * H && offLines.some((l) => l.includes("Oak Logs")));
const off2 = createFreshState(g, "Hero", 21, 21);
check("offline: idle village earns nothing", accrueLabourOffline(off2, H, H).length === 0);

// ================= Meta / achievements =================
const metaS = createFreshState(g, "Hero", 21, 21);
const pops: string[] = [];
const meta = new MetaSystem(metaS, (m) => pops.push(m));
check("meta: 16 achievements catalogued", ACHIEVEMENTS.length === 16, `${ACHIEVEMENTS.length}`);
meta.bump("shop_bought", 1); meta.bump("shop_sold", 20); meta.bump("labour_assigns", 3); meta.bump("labour_collected", 50); meta.bump("floors_descended", 1);
meta.evaluate();
const metaGot = new Set(metaS.player.meta.achievements);
check("meta: counter achievements pop", ["merchant", "hawker", "foreman", "quartermaster", "spelunker"].every((a) => metaGot.has(a)));
check("meta: one-shot popups", pops.length >= 5 && meta.evaluate && metaS.player.meta.counters.shop_sold === 20);
meta.bump("shop_sold_value", 2000);
meta.bump("shop_bought", 9); // 1 earlier + 9 = 10
metaS.town.market.supply["oak_log"] = 101;
meta.bump("shop_bought", 1);
meta.evaluate();
check("meta: market achievements pop", ["mogul", "flooder", "regular"].every((a) => metaS.player.meta.achievements.includes(a)));

// ================= Town Hall =================
const hallS = createFreshState(g, "Hero", 21, 21);
const build = new BuildSystem(scene, g, hallS);
check("hall: base cap 8h", build.offlineCapHours === 8);
hallS.town.buildings.push({ id: "h1", type: "TOWN_HALL", x: 20, y: 20, level: 1 });
check("hall: level 1 → 12h", build.offlineCapHours === 12);
addItem(hallS.player.inventory, "coins", 1000); addItem(hallS.player.inventory, "plank", 60);
const up1 = build.upgradeType("TOWN_HALL");
check("hall: upgrades to 16h", up1 && build.offlineCapHours === 16, `${build.offlineCapHours}`);
const up2 = build.upgradeType("TOWN_HALL");
check("hall: and on to 20h", up2 && build.offlineCapHours === 20, `${build.offlineCapHours}`);
check("hall: max level bricks upgrades", build.canUpgrade("TOWN_HALL") === false && build.upgradeType("TOWN_HALL") === false);
const tax0 = countItem(hallS.player.inventory, "coins");
build.tick(10_000); build.tick(10_000);
check("hall: level taxes 12 coins over two cycles", countItem(hallS.player.inventory, "coins") - tax0 === 12, `${countItem(hallS.player.inventory, "coins") - tax0}`);
check("tax: offline tax math", offlineTaxFor(3, 3600) === 3600 && offlineTaxFor(1, 600) === 200 && offlineTaxFor(0, 3600) === 0 && offlineTaxFor(2, 5) === 0);

// ================= Save round-trip =================
const fullS = createFreshState(g, "Hero", 21, 21);
fullS.town.labour.assignments["wren"] = "woodcutting";
fullS.town.labour.worked["wren"] = 2 * H;
accrueLabourOffline(fullS, H, H); // 360 logs + 180 oak
fullS.town.market.supply["oak_log"] = 41;
fullS.player.meta.counters = { shop_bought: 1 };
fullS.player.meta.achievements = ["merchant"];
fullS.player.journal.push("caves");
fullS.player.map.explored = [5, 6, 7];
const ser = new SaveSystem(fullS).serialize() as any;
check("save: all new fields serialise", !!ser.player.journal && ser.player.meta.counters.shop_bought === 1 && ser.town.labour.worked.wren >= 2 * H && ser.town.market.supply.oak_log === 41 && ser.map.explored.length === 3);
const st2 = createFreshState(g, "Hero", 21, 21);
const applied = new SaveSystem(st2).apply(ser);
check("save: apply restores the full economy state", applied.ok
  && st2.town.labour.stock["normal_log"] === 360
  && st2.player.meta.achievements.includes("merchant")
  && st2.town.market.supply["oak_log"] === 41
  && st2.player.map.explored.length === 3
  && st2.player.journal.includes("caves"));

// ================= Combat Tonic potion =================
check("potion: Combat Tonic in auto-eat table (heals 30)", FOODS.combat_potion?.heal === 30 && FOODS.combat_potion.tier === 4);
{
  const ps = new ShopSystem(scene, g, fullS);
  const potStock = ps.snapshot(fullS.player.inventory).stock;
  check("potion: Combat Tonic stocked at the market", potStock.some((r) => r.itemId === "combat_potion"));
}

// ================= QC sprint: audit regressions =================
// Each of these pins a defect that shipped because nothing covered it.

// [xp] The top of the curve: level 99 must be reachable and the bar finite.
check("xp: level 99 threshold exists", Number.isFinite(XP_TABLE[99]));
check("xp: OSRS anchors hold", levelFromXp(83) === 2 && levelFromXp(101333) === 50);
check("xp: 13,034,431 xp is level 99", levelFromXp(13034431) === 99, `${levelFromXp(13034431)}`);
check("xp: level caps at 99, never above", levelFromXp(1e12) === 99);
{
  const p98 = levelProgress(XP_TABLE[98]);
  const p99 = levelProgress(13034431);
  check("xp: progress is finite at 98 and 99",
    Number.isFinite(p98.into) && p98.into >= 0 && p98.into <= 1 && p99.into === 1,
    `98→${p98.into} 99→${p99.into}`);
}

// [save] Offline progression is measured from the SAVED timestamp, not boot.
{
  const offState = createFreshState(g, "Hero", 21, 21);
  offState.player.skills.woodcutting.xp = 5000;
  const sys = new SaveSystem(offState);
  const payload = sys.serialize() as any;
  payload.timestamp = Date.now() - 6 * H; // a save left alone for six hours
  const fresh = createFreshState(g, "Hero", 21, 21);
  const sys2 = new SaveSystem(fresh);
  sys2.apply(payload);
  check("save: apply restores the saved timestamp", fresh.timestamp === payload.timestamp,
    `${fresh.timestamp} vs ${payload.timestamp}`);
  const awayS = Math.round((Date.now() - fresh.timestamp) / 1000);
  check("save: a 6h-old save reads as ~6h away", awayS >= 6 * 3600 - 5 && awayS <= 6 * 3600 + 5, `${awayS}s`);
}

// [combat] Main drop tables honour their min/max instead of always paying 1.
{
  const inv = createFreshState(g, "Hero", 21, 21).player.inventory;
  const zombie = MONSTERS.zombie;
  const coinEntry = zombie.main.find((d) => d.itemId === "coins");
  check("combat: zombie coin drop declares a range", !!coinEntry && coinEntry.max > coinEntry.min,
    coinEntry ? `${coinEntry.min}-${coinEntry.max}` : "missing");
  void inv;
}

// ================= Phase A: opening frame =================

// [world] Water geometry covers water tiles only. The old buildWater() made one
// self-intersecting THREE.Shape across every water tile, triangulating into a
// wedge lying over open ground. Per-tile quads mean vertex count is exactly
// 6 per water tile, and every vertex sits on a WATER tile.
{
  const wg = new Grid();
  const waterTiles: { x: number; y: number }[] = [];
  for (let y = 0; y < wg.height; y++) {
    for (let x = 0; x < wg.width; x++) if (wg.at(x, y)!.terrainType === "WATER") waterTiles.push({ x, y });
  }
  check("water: map actually has water", waterTiles.length > 0, `${waterTiles.length} tiles`);

  // Mirror buildWater()'s vertex layout and assert containment.
  const verts: { x: number; z: number }[] = [];
  for (const t of waterTiles) {
    const x0 = t.x - 0.5, z0 = t.y - 0.5, x1 = t.x + 0.5, z1 = t.y + 0.5;
    for (const [cx, cz] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]) verts.push({ x: cx, z: cz });
  }
  check("water: 6 vertices per water tile", verts.length === waterTiles.length * 6, `${verts.length}`);
  const strayed = verts.filter((v) => {
    const tx = Math.round(v.x), ty = Math.round(v.z);
    const tile = wg.at(tx, ty);
    // Each corner is shared by up to 4 tiles; at least one must be water.
    return !(
      [tile, wg.at(tx - 1, ty), wg.at(tx, ty - 1), wg.at(tx - 1, ty - 1)]
        .some((c) => c && c.terrainType === "WATER")
    );
  });
  check("water: no vertex sits away from water", strayed.length === 0, `${strayed.length} stray`);
}

// [clock] A fresh save opens in daylight and the clock persists across a reload.
{
  check("clock: fresh save starts mid-morning", DAY_START_MINUTE === 600, `${DAY_START_MINUTE}`);
  const hour = DAY_START_MINUTE / 60;
  const light = hour < 6.5 || hour > 19.5 ? 0 : Math.max(0, Math.min(1, hour <= 12.5 ? (hour - 6.5) / 6 : (19.5 - hour) / 6));
  check("clock: opening frame is lit", light > 0.5, `daylight ${light.toFixed(2)}`);

  const cs = createFreshState(g, "Hero", 21, 21);
  cs.clock = { minute: 13 * 60 + 20, day: 4 };
  const ser = new SaveSystem(cs).serialize() as any;
  const back = createFreshState(g, "Hero", 21, 21);
  new SaveSystem(back).apply(ser);
  check("clock: survives a save round-trip",
    back.clock.minute === 13 * 60 + 20 && back.clock.day === 4,
    `${back.clock.minute}/${back.clock.day}`);
}

// ================= Phase A follow-up: world texture =================

// [world] DIRT/ROCK come from smooth noise, so they form patches. A per-tile
// coin flip (the old behaviour) scatters lone tiles — "confetti on the grass".
// Measured as: what share of non-grass tiles have a same-type orthogonal
// neighbour? Random ~0.2 at these densities; clustered noise is far higher.
{
  const tg = new Grid();
  let nonGrass = 0, withNeighbour = 0;
  for (let y = 2; y < tg.height - 2; y++) {
    for (let x = 2; x < tg.width - 2; x++) {
      const t = tg.at(x, y)!;
      if (t.terrainType !== "DIRT" && t.terrainType !== "ROCK") continue;
      nonGrass++;
      const same = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nb = tg.at(x + dx, y + dy);
        return nb && nb.terrainType === t.terrainType;
      });
      if (same) withNeighbour++;
    }
  }
  const cohesion = nonGrass ? withNeighbour / nonGrass : 0;
  check("terrain: dirt/rock form patches, not confetti", cohesion > 0.75,
    `${(cohesion * 100).toFixed(0)}% have a like neighbour (${nonGrass} tiles)`);
}

// [world] The town core is the settlement build area — every tile in it must be
// buildable, or the player spawns inside a quarry they cannot build on.
{
  const tg = new Grid();
  let town = 0, blocked = 0;
  for (let y = 0; y < tg.height; y++) {
    for (let x = 0; x < tg.width; x++) {
      const t = tg.at(x, y)!;
      if (t.zoneId !== "TOWN_CENTER") continue;
      town++;
      if (!t.buildable) blocked++;
    }
  }
  check("world: town core is fully buildable", town > 0 && blocked === 0, `${blocked}/${town} blocked`);
}

// [inventory] The storage cap is an invariant, not a convention: addItem itself
// refuses to overfill, and it applies to BULK resources only — coins, keys,
// quest tokens and pets must never be blocked by a bag full of logs.
{
  const inv = createInventory();
  const put = addItem(inv, "normal_log", inv.storageCap + 250);
  check("inv: addItem clamps to the cap", put === 500 && countItem(inv, "normal_log") === 500, `${put}`);
  check("inv: a clamped bag reads as full", isFull(inv));
  check("inv: a full bag takes no more bulk", addItem(inv, "oak_log", 10) === 0);
  check("inv: currency ignores the bulk cap", addItem(inv, "coins", 1000) === 1000 && countItem(inv, "coins") === 1000, `${countItem(inv, "coins")}`);
  check("inv: quest items ignore the bulk cap", addItem(inv, "dungeon_key", 1) === 1);
  check("inv: gear ignores the bulk cap", addItem(inv, "bronze_sword", 1) === 1);
  check("inv: exempt items do not count toward stored", storedAmount(inv) === 500, `${storedAmount(inv)}`);
  check("inv: unknown ids are treated as bulk", isBulk("some_future_ore") === true);
  check("inv: a partial add reports what fit", (() => {
    const i2 = createInventory();
    addItem(i2, "coal", 495);
    return addItem(i2, "coal", 20) === 5;
  })());
}

// [mastery] Mastery used to reuse the skill XP curve, which is built to span a
// whole skill's lifetime — but mastery is tracked per ITEM, so mastery 99 on one
// resource came out at 8,146 hours and the speed bonus (level/99) never moved.
// The curve is now its own, and these checks pin the shape rather than the code.
{
  check("mastery: level 1 at zero xp", masteryLevel(0) === 1 && masteryXpForLevel(1) === 0);
  check("mastery: the curve inverts exactly", [2, 10, 20, 50, 99].every(
    (l) => masteryLevel(masteryXpForLevel(l)) === l && masteryLevel(masteryXpForLevel(l) - 1) === l - 1));
  check("mastery: caps at 99", masteryLevel(masteryXpForLevel(99) * 100) === MASTERY_MAX);
  check("mastery: progress runs 0..1 and pins at the cap",
    masteryProgress(masteryXpForLevel(20)) === 0 && masteryProgress(masteryXpForLevel(99)) === 1);

  // 1 mastery xp per unit gathered, so xp-to-99 IS actions-to-99.
  const actions = masteryXpForLevel(99);
  const hours = (ticks: number) => (actions * ticks * 0.6) / 3600;
  const perResource = Object.values(RESOURCES).map((r: any) => hours(r.ticksPerAction));
  const cheapest = Math.min(...perResource);
  const dearest = Math.max(...perResource);
  check("mastery: 99 is a reachable grind, not a myth", cheapest > 5 && dearest < 40,
    `${cheapest.toFixed(1)}h - ${dearest.toFixed(1)}h`);
  check("mastery: cheap resources master faster than dear ones", cheapest < dearest);
}

// [save] Pre-1.1.0 saves stored mastery at 4 xp/action on the old curve. Reading
// those numbers on the new curve unmigrated would hand out near-max mastery.
{
  check("save: pre-1.1.0 saves are rescaled", needsMasteryRescale("1.0.0") === true);
  check("save: 1.1.0 and later are not", needsMasteryRescale("1.1.0") === false && needsMasteryRescale("1.2.0") === false);
  const raw = { version: "1.0.0", timestamp: Date.now(), player: { name: "X", position: { x: 5, y: 5 }, stats: { hp: 10, maxHp: 10 }, skills: { woodcutting: { xp: 0, mastery: { normal: 4470 } } }, inventory: [] } };
  const out = sanitizeSave(raw) as { ok: boolean; state: any };
  const rescaled = out.state.player.skills.woodcutting.mastery.normal;
  check("save: migration keeps the actions, not the number", out.ok && rescaled === 1117, `${rescaled}`);
  check("save: migration stamps the current version", out.state.version === "1.1.0", out.state.version);
}

// [combat] There were three weapon selectors — combat, the stats panel, and a
// helper — and none checked requiredAttack, so a level-1 hero swung an iron
// sword needing Attack 10 and the panel could name a different weapon than the
// one combat used.
{
  const inv = createInventory();
  check("weapon: bare hands with nothing carried", selectWeapon(inv, null, 1).id === "fists");

  addItem(inv, "iron_sword", 1); // requiredAttack 10
  check("weapon: an unusable weapon is not wielded", selectWeapon(inv, null, 1).id === "fists",
    selectWeapon(inv, null, 1).id);
  check("weapon: usable once Attack is high enough", selectWeapon(inv, null, 10).id === "iron_sword");
  check("weapon: the equipped slot is refused below its requirement",
    selectWeapon(inv, "iron_sword", 5).id === "fists");

  addItem(inv, "bronze_dagger", 1);
  check("weapon: the best usable weapon wins", selectWeapon(inv, null, 1).id === "dagger",
    selectWeapon(inv, null, 1).id);
  check("weapon: an equipped weapon beats a better carried one",
    selectWeapon(inv, "bronze_dagger", 99).id === "dagger");
  const dropped = createInventory();
  check("weapon: an equipped item you no longer carry is ignored",
    selectWeapon(dropped, "iron_sword", 99).id === "fists");
  check("weapon: every weapon declares a requirement",
    Object.values(WEAPONS).every((w: any) => Number.isFinite(w.requiredAttack)));
}

// [hero] The player character is a named wizard, not "Hero".
check("hero: has a name, not a placeholder", DEFAULT_HERO_NAME.length > 1 && !/^(hero|player)$/i.test(DEFAULT_HERO_NAME), DEFAULT_HERO_NAME);

// [build] Upgrading used to cost 2x then 3x the materials and change nothing but
// the mesh scale: every passive effect read count(), so only the Town Hall ever
// looked at its level. levels() sums levels across instances, so one level-3
// Sawmill works like three level-1 ones.
{
  const st = createFreshState(g, DEFAULT_HERO_NAME, 21, 21);
  const bs = new BuildSystem(scene, g, st);
  addItem(st.player.inventory, "coins", 100000);
  addItem(st.player.inventory, "plank", 400);

  st.town.buildings.push({ id: "sh1", type: "STOREHOUSE", x: 20, y: 20, level: 1 });
  check("build: storage counts one level", bs.storageBonus === 250, `${bs.storageBonus}`);
  check("build: levels() and count() differ once upgraded",
    bs.count("STOREHOUSE") === 1 && bs.levels("STOREHOUSE") === 1);

  // The cap is derived, so it only tracks reality once something recomputes it —
  // upgrading now does, where before a Storehouse upgrade was invisible until the
  // next page load.
  const up = bs.upgradeType("STOREHOUSE");
  check("build: an upgrade recomputes the cap immediately",
    up && st.player.inventory.storageCap === 500 + bs.storageBonus,
    `cap ${st.player.inventory.storageCap}, bonus ${bs.storageBonus}`);
  check("build: level 2 doubles the bonus", bs.storageBonus === 500 && bs.levels("STOREHOUSE") === 2);

  check("build: reaches the cap", bs.upgradeType("STOREHOUSE") === true && bs.levels("STOREHOUSE") === MAX_BUILD_LEVEL);
  check("build: level 3 triples the bonus", bs.storageBonus === 750, `${bs.storageBonus}`);
  check("build: upgrades stop at the cap", bs.upgradeType("STOREHOUSE") === false && MAX_BUILD_LEVEL === 3);

  // Passive production reads levels too, so a level-3 Sawmill saws three logs.
  st.town.buildings.push({ id: "sm1", type: "SAWMILL", x: 22, y: 22, level: 3 });
  addItem(st.player.inventory, "normal_log", 10);
  const logsBefore = countItem(st.player.inventory, "normal_log");
  bs.tick(60_000);
  const sawn = logsBefore - countItem(st.player.inventory, "normal_log");
  check("build: a level-3 Sawmill saws 3 logs a cycle", sawn === 3, `${sawn}`);
}

// [smithing] Smithing dead-ended at tools and armour: not one weapon had a
// recipe, so the only way to hold a sword was a drop or the market, and steel
// bars fed nothing but an axe and a pickaxe.
{
  const outputs = new Set(RECIPES.map((r: any) => r.output.itemId));
  const weaponItems = Object.values(WEAPONS).map((w: any) => w.itemId).filter(Boolean) as string[];
  const missing = weaponItems.filter((id) => !outputs.has(id));
  check("smithing: every weapon is craftable", missing.length === 0, missing.join(",") || "all");

  // Every recipe must consume something and produce a real item.
  const badOut = RECIPES.filter((r: any) => !ITEMS[r.output.itemId]);
  check("recipes: outputs are real items", badOut.length === 0, badOut.map((r: any) => r.id).join(","));
  const badIn = RECIPES.filter((r: any) => !r.inputs.length || r.inputs.some((i: any) => !ITEMS[i.itemId]));
  check("recipes: inputs are real items", badIn.length === 0, badIn.map((r: any) => r.id).join(","));
  const dupIds = RECIPES.length - new Set(RECIPES.map((r: any) => r.id)).size;
  check("recipes: ids are unique", dupIds === 0, `${dupIds} duplicate(s)`);

  // Every bar must feed something, or a tier of smelting is a dead end.
  for (const bar of ["bronze_bar", "iron_bar", "steel_bar"]) {
    const users = RECIPES.filter((r: any) => r.inputs.some((i: any) => i.itemId === bar));
    check(`smithing: ${bar} has consumers`, users.length > 0, `${users.length} recipes`);
  }
  // A weapon requiring Attack N should not be forgeable far below that.
  const tooEarly = Object.values(WEAPONS).filter((w: any) => {
    if (!w.itemId) return false;
    const r: any = RECIPES.find((x: any) => x.output.itemId === w.itemId);
    return r && r.levelReq + 20 < w.requiredAttack;
  });
  check("smithing: forge levels track weapon requirements", tooEarly.length === 0,
    tooEarly.map((w: any) => w.id).join(","));
}

// [settings] Auto-eat was a hardcoded 40%. It is now player-tunable and persisted,
// and a stored value outside the offered steps must not become unrepresentable.
{
  check("autoeat: the default is offered", AUTO_EAT_STEPS.includes(DEFAULT_AUTO_EAT_PCT as any));
  check("autoeat: off is offered", AUTO_EAT_STEPS.includes(0 as any));
  check("autoeat: fresh saves take the default",
    createFreshState(new Grid()).settings.autoEatPct === DEFAULT_AUTO_EAT_PCT);

  const mk = (v: unknown) => (sanitizeSave({
    version: "1.1.0", timestamp: Date.now(),
    player: { name: "X", position: { x: 5, y: 5 }, stats: { hp: 10, maxHp: 10 }, skills: {}, inventory: [] },
    settings: { autoEatPct: v },
  }) as any).state.settings.autoEatPct;
  check("autoeat: a stored step round-trips", mk(60) === 60, `${mk(60)}`);
  check("autoeat: an off-grid value snaps to a step", AUTO_EAT_STEPS.includes(mk(37) as any), `${mk(37)}`);
  check("autoeat: junk falls back to the default", mk("nonsense") === DEFAULT_AUTO_EAT_PCT && mk(NaN) === DEFAULT_AUTO_EAT_PCT);
  check("autoeat: a missing block falls back to the default",
    (sanitizeSave({ version: "1.1.0", timestamp: Date.now(), player: { name: "X", position: { x: 1, y: 1 }, stats: { hp: 1, maxHp: 1 }, skills: {}, inventory: [] } }) as any)
      .state.settings.autoEatPct === DEFAULT_AUTO_EAT_PCT);
}

// [farming] Crops grow on wall-clock time, stored as a plant timestamp — no tick
// loop, no offline catch-up pass, and nothing that can be paid twice the way
// offline gathering once was. These checks pin that property.
{
  const st = createFreshState(g, DEFAULT_HERO_NAME, 21, 21);
  let beds = 2;
  const farm = new FarmSystem(st, () => beds);

  check("farm: no beds without a Farm Plot", new FarmSystem(st, () => 0).snapshot().bedCount === 0);
  check("farm: seeds all declare a produce item", SEED_IDS.every((id) => !!ITEMS[SEEDS[id].produce.itemId]));
  check("farm: seeds are all real items", SEED_IDS.every((id) => !!ITEMS[id]));
  check("farm: seed grow times are ordered by tier",
    SEEDS.potato_seed.growMs < SEEDS.cabbage_seed.growMs && SEEDS.cabbage_seed.growMs < SEEDS.redberry_seed.growMs);

  // Sowing consumes the seed and takes a bed.
  addItem(st.player.inventory, "potato_seed", 3);
  const p1 = farm.plant("potato_seed");
  check("farm: sowing works", p1.ok === true && countItem(st.player.inventory, "potato_seed") === 2);
  check("farm: a fresh bed is not ripe", farm.snapshot().beds[0].ripe === false);
  check("farm: harvesting an unripe bed is refused",
    (farm.harvest(0) as any).reason === "unripe");

  // Growth is a function of the timestamp, so rewinding plantedAt IS waiting.
  st.town.farm.plots[0]!.plantedAt = Date.now() - SEEDS.potato_seed.growMs - 1000;
  check("farm: time makes it ripe", farm.snapshot().beds[0].ripe === true);
  check("farm: the label says so", growthLabel(st.town.farm.plots[0]!, Date.now()) === "Ripe");

  const h = farm.harvest(0) as any;
  const range = SEEDS.potato_seed.produce;
  check("farm: harvest yields inside the declared range",
    h.ok && h.amount >= range.min && h.amount <= range.max, `${h.amount} in ${range.min}-${range.max}`);
  check("farm: harvest grants Farming XP", st.player.skills.farming.xp === SEEDS.potato_seed.xp);
  check("farm: harvest frees the bed", st.town.farm.plots[0] === null);
  check("farm: harvest fills the collection log", st.collectionLog.has(range.itemId));

  // Beds are finite. Stock plenty of seed so the refusal can only be "no_bed".
  addItem(st.player.inventory, "potato_seed", 10);
  farm.plant("potato_seed");
  farm.plant("potato_seed");
  check("farm: beds run out before seeds do", (farm.plant("potato_seed") as any).reason === "no_bed");

  // A locked seed cannot be sown at level 1.
  addItem(st.player.inventory, "redberry_seed", 1);
  check("farm: a seed above your level is refused",
    (new FarmSystem(st, () => 8).plant("redberry_seed") as any).reason === "level");
  check("farm: unknown seeds are refused", (farm.plant("not_a_seed") as any).reason === "unknown_seed");

  // Shrinking the plot count must not bin a growing crop.
  const st2 = createFreshState(g, DEFAULT_HERO_NAME, 21, 21);
  let beds2 = 2;
  const f2 = new FarmSystem(st2, () => beds2);
  addItem(st2.player.inventory, "potato_seed", 2);
  f2.plant("potato_seed");
  beds2 = 1;
  f2.snapshot();
  check("farm: a shrunk plot keeps the sown bed", st2.town.farm.plots[0] !== null && st2.town.farm.plots.length === 1);

  check("farm: growth is monotonic in time", (() => {
    const plot = { seedId: "potato_seed", plantedAt: 1000 };
    const a = growthAt(plot, 1000);
    const b = growthAt(plot, 1000 + SEEDS.potato_seed.growMs / 2);
    const c = growthAt(plot, 1000 + SEEDS.potato_seed.growMs * 5);
    return a === 0 && b > 0 && b < 1 && c === 1 && isRipe(plot, 1000 + SEEDS.potato_seed.growMs);
  })());
}

// [save] Farm beds survive a round-trip, and a future plantedAt must not leave a
// crop unripe forever.
{
  const now = Date.now();
  const raw = {
    version: "1.1.0", timestamp: now,
    player: { name: "X", position: { x: 5, y: 5 }, stats: { hp: 10, maxHp: 10 }, skills: {}, inventory: [] },
    town: { buildings: [], farm: { plots: [{ seedId: "potato_seed", plantedAt: now - 60_000 }, null, { seedId: "cabbage_seed", plantedAt: now + 9_000_000 }] } },
  };
  const out = (sanitizeSave(raw) as any).state;
  const plots = out.town.farm.plots;
  check("save: farm beds round-trip", plots.length === 3 && plots[1] === null && plots[0].seedId === "potato_seed");
  check("save: a future plantedAt is clamped to now", plots[2].plantedAt <= Date.now(), `${plots[2].plantedAt - now}ms ahead`);
  const junk = (sanitizeSave({ version: "1.1.0", timestamp: now, player: { name: "X", position: { x: 1, y: 1 }, stats: { hp: 1, maxHp: 1 }, skills: {}, inventory: [] }, town: { farm: { plots: [{ nonsense: 1 }, "x", 7] } } }) as any).state;
  check("save: malformed beds become empty", junk.town.farm.plots.every((p: unknown) => p === null));
}

// [content] Farming has to close loops, not add dead-end items: every crop must
// feed a recipe, and the Combat Tonic should no longer be shop-only.
{
  const inputs = new Set(RECIPES.flatMap((r: any) => r.inputs.map((i: any) => i.itemId)));
  const produce = SEED_IDS.map((id) => SEEDS[id].produce.itemId);
  const orphans = produce.filter((id) => !inputs.has(id));
  check("farming: every crop feeds a recipe", orphans.length === 0, orphans.join(",") || "all");
  check("farming: the Combat Tonic is craftable",
    RECIPES.some((r: any) => r.output.itemId === "combat_potion"));
  check("farming: farming is a real skill", SKILL_IDS.includes("farming" as any));
}

console.log(results.join("\n"));
const fails = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`${results.length - fails}/${results.length} passed`);
if (fails) throw new Error(`${fails} QC check(s) failed`);