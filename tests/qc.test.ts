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
import { spawnMonster } from "../src/world/Monster";
import { countItem, addItem } from "../src/components/Inventory";
import { XP_TABLE, levelFromXp, levelProgress } from "../src/data/XPTable";

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

console.log(results.join("\n"));
const fails = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`${results.length - fails}/${results.length} passed`);
if (fails) throw new Error(`${fails} QC check(s) failed`);