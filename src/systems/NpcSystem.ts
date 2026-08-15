// P3/P3.4: living world — procedural villagers + ambient critters. They wander
// near home, gather at built Campfires, visit Storage Bins/Storehouses, and
// comment on newly placed buildings. Non-blocking: never occupy grid tiles.
import * as THREE from "three";
import type { Grid } from "../world/Grid";
import type { TownBuilding } from "../state/GameState";
import type { BuildingType } from "../data/Buildings";
import { makeVillager, makeCritter } from "../generators/Villager";
import { findPath } from "../ai/AStar";

export interface NpcLines {
  nearCampfire: string[];
  nearStorage: string[];
  onPlaced: Record<string, string[]>;
  town: string[];
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  kind: "villager" | "critter";
  home: { x: number; y: number };
  radius: number;
  talk: string[];
  lines: NpcLines;
}

const VILLAGERS: NpcDef[] = [
  {
    id: "bram", name: "Bram", title: "the Fisher", kind: "villager",
    home: { x: 9, y: 11 }, radius: 3,
    talk: [
      "\"The shrimp are biting today. The trout are deeper.\"",
      "\"Build a Smelter near the water if you fancy roasted fish.\"",
      "\"The pond freezes over at night — come back at dawn.\"",
    ],
    lines: {
      nearCampfire: ["\"Nothing beats a fire after a day at the water.\"", "\"The fire keeps the chill off my bones.\""],
      nearStorage: ["\"A full storehouse is a happy storehouse.\"", "\"Stash the catch before it goes off!\""],
      onPlaced: {
        CAMPFIRE: ["\"Now we can roast the day's catch!\""],
        STOREHOUSE: ["\"Room for my trout, at last.\""],
        STORAGE_BIN: ["\"A handy little crate. The fish won't mind.\""],
        default: ["\"The settlement grows. The waters are pleased.\""],
      },
      town: ["\"The settlement feeds more mouths each day.\"", "\"The water still holds secrets.\""],
    },
  },
  {
    id: "wren", name: "Wren", title: "the Woodcutter", kind: "villager",
    home: { x: 11, y: 9 }, radius: 3,
    talk: [
      "\"These oaks need a sharper axe than my old bronze.\"",
      "\"Planks come from logs, and logs come from work.\"",
      "\"Mind the goblins past the treeline.\"",
    ],
    lines: {
      nearCampfire: ["\"The fire's good for drying timber.\"", "\"Don't stand too close with that axe.\""],
      nearStorage: ["\"Logs, safe and sound.\"", "\"Keep the wood dry, keep it warm.\""],
      onPlaced: {
        CAMPFIRE: ["\"That fire will warm the whole yard.\""],
        SAWMILL: ["\"Now I can saw in comfort.\""],
        STORAGE_BIN: ["\"A dry place for my lumber.\""],
        default: ["\"Another building up. Good work.\""],
      },
      town: ["\"The forest gives, the town holds.\"", "\"These trees will fall for a good cause.\""],
    },
  },
  {
    id: "tobias", name: "Old Tobias", title: "Town Elder", kind: "villager",
    home: { x: 10, y: 10 }, radius: 2,
    talk: [
      "\"The settlement grows with every log you haul home.\"",
      "\"A Storage Bin is cheap — build one before your pouch bursts.\"",
      "\"Bury the bones. It's only proper.\"",
    ],
    lines: {
      nearCampfire: ["\"Where there's fire, there's folk.\"", "\"The town is alive at night around the fire.\""],
      nearStorage: ["\"A town that stores well, lasts well.\"", "\"Tidy stores, tidy minds.\""],
      onPlaced: {
        TOWN_HALL: ["\"The seat of the settlement stands at last.\""],
        CAMPFIRE: ["\"The heart of the town — the fire.\""],
        STOREHOUSE: ["\"Our larder grows. The winter fears us now.\""],
        default: ["\"A fine addition to the town.\""],
      },
      town: ["\"One day this will be a city.\"", "\"The town remembers every helping hand.\""],
    },
  },
];

const CRITTERS: NpcDef[] = [
  { id: "rabbit_a", name: "Rabbit", title: "", kind: "critter", home: { x: 8, y: 9 }, radius: 4, talk: ["It hops off before you can grab it!"], lines: { nearCampfire: [], nearStorage: [], onPlaced: {}, town: [] } },
  { id: "rabbit_b", name: "Rabbit", title: "", kind: "critter", home: { x: 12, y: 12 }, radius: 4, talk: ["It twitches its nose and scampers away."], lines: { nearCampfire: [], nearStorage: [], onPlaced: {}, town: [] } },
];

export type NpcTask = "wander" | "to_fire" | "at_fire" | "to_building" | "inspecting";

export interface NpcEntity {
  def: NpcDef;
  tile: { x: number; y: number };
  target: { x: number; y: number } | null;
  stepAcc: number;
  idleAcc: number;
  task: NpcTask;
  taskAcc: number;
  path: { x: number; y: number }[] | null;
  pathIdx: number;
  buildingType: string | null; // building being visited / inspected
  lastInspect: { type: string; until: number } | null;
  talkIdx: number;
  mesh: THREE.Group;
}

export interface NpcSystemOptions {
  getBuildings?: () => TownBuilding[];
}

const TICKS_PER_STEP = 3; // one tile every 3 ticks (~1.8s)
const IDLE_BEFORE_NEW_TARGET = 4;
const FIRE_EVERY = 45; // ticks between campfire trips
const AT_FIRE_TICKS = 16; // base time sitting at the fire
const VISIT_EVERY = 75; // ticks between storage visits
const INSPECT_TICKS = 8;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class NpcSystem {
  private scene: THREE.Scene;
  private grid: Grid;
  private getBuildings: () => TownBuilding[];
  entities: NpcEntity[] = [];
  private tickCount = 0;
  /** Test hooks: how many times villagers reached a campfire / storage. */
  fireVisits = 0;
  storageVisits = 0;

  constructor(scene: THREE.Scene, grid: Grid, opts: NpcSystemOptions = {}) {
    this.scene = scene;
    this.grid = grid;
    this.getBuildings = opts.getBuildings ?? (() => []);
    for (const def of [...VILLAGERS, ...CRITTERS]) {
      const mesh = def.kind === "villager"
        ? makeVillager(def.id === "tobias" ? "#8a7a5a" : def.id === "bram" ? "#4a7a9c" : "#5a8a4a", def.id === "tobias" ? "#d8cfc0" : "#3a3a46", def.id !== "wren")
        : makeCritter("#b8a894");
      const start = this.findStart(def);
      mesh.position.set(start.x, 0, start.y);
      this.scene.add(mesh);
      this.entities.push({
        def, tile: start, target: null, stepAcc: 0, idleAcc: 0,
        task: "wander", taskAcc: 0, path: null, pathIdx: 0, buildingType: null, lastInspect: null, talkIdx: 0, mesh,
      });
    }
  }

  at(gx: number, gy: number): NpcEntity | null {
    for (const e of this.entities) {
      if (e.tile.x === gx && e.tile.y === gy && e.def.kind === "villager") return e;
    }
    return null;
  }

  /** P3.4: contextual talk — reacts to nearby buildings first. */
  talk(e: NpcEntity): string {
    const L = e.def.lines;
    if (e.def.kind === "critter") return e.def.talk[e.talkIdx++ % e.def.talk.length];

    const near = this.nearbyBuildingType(e, 3);
    if (near === "CAMPFIRE" && L.nearCampfire.length) return pick(L.nearCampfire);
    if ((near === "STORAGE_BIN" || near === "STOREHOUSE") && L.nearStorage.length) return pick(L.nearStorage);
    if (e.lastInspect && this.tickCount < e.lastInspect.until && L.onPlaced[e.lastInspect.type]?.length) {
      return pick(L.onPlaced[e.lastInspect.type]);
    }
    if (this.buildings().length > 0 && L.town.length) return pick(L.town);
    return e.def.talk[e.talkIdx++ % e.def.talk.length];
  }

  /** P3.4: a building was placed — nearest villager comments and goes to inspect it. */
  onBuildingPlaced(type: BuildingType, x: number, y: number): string {
    let nearest: NpcEntity | null = null;
    let best = Infinity;
    for (const e of this.entities) {
      if (e.def.kind !== "villager") continue;
      const d = Math.abs(e.tile.x - x) + Math.abs(e.tile.y - y);
      if (d < best) { best = d; nearest = e; }
    }
    if (!nearest) return "";
    const lines = nearest.def.lines.onPlaced[type] ?? nearest.def.lines.onPlaced.default ?? [];
    if (!lines.length) return "";
    const line = pick(lines);
    nearest.lastInspect = { type, until: this.tickCount + 40 };
    const adj = this.nearestWalkableAdjacent({ x, y });
    if (adj) {
      const path = findPath(this.grid, nearest.tile.x, nearest.tile.y, adj.x, adj.y);
      if (path) {
        nearest.path = path.map(([px, py]) => ({ x: px, y: py }));
        nearest.pathIdx = 0;
        nearest.task = "to_building";
        nearest.buildingType = type;
        nearest.stepAcc = 0;
      }
    }
    return `${nearest.def.name}: ${line}`;
  }

  /** Called each 600ms tick: schedules + building interactions. */
  tick() {
    this.tickCount++;
    for (const e of this.entities) {
      if (e.def.kind !== "villager") { this.wanderTick(e); continue; }

      switch (e.task) {
        case "wander": {
          e.taskAcc++;
          if (e.taskAcc % FIRE_EVERY === 0) {
            const fire = this.pickNearest(e, this.buildingsOf("CAMPFIRE"));
            if (fire && this.startTask(e, fire)) break;
          }
          if (e.taskAcc % VISIT_EVERY === 0) {
            const store = this.pickNearest(e, this.buildingsOf("STORAGE_BIN", "STOREHOUSE"));
            if (store && this.startTask(e, store)) break;
          }
          this.wanderTick(e);
          break;
        }
        case "to_fire":
        case "to_building": {
          if (this.followPath(e)) {
            // Arrived next to the building — settle in and "use" it.
            if (e.task === "to_fire") { e.task = "at_fire"; this.fireVisits++; }
            else { e.task = "inspecting"; this.storageVisits++; }
            e.taskAcc = 0;
          }
          break;
        }
        case "at_fire":
        case "inspecting": {
          e.taskAcc++;
          const base = e.task === "at_fire" ? AT_FIRE_TICKS : INSPECT_TICKS;
          if (e.taskAcc >= base + Math.floor(Math.random() * 10)) {
            e.task = "wander";
            e.taskAcc = 0;
            e.path = null;
            e.buildingType = null;
          }
          break;
        }
      }
    }
  }

  /** Frame-time idle bob / critter hop. */
  update(dt: number) {
    const t = performance.now() / 1000;
    for (const e of this.entities) {
      const moving = e.task === "to_fire" || e.task === "to_building";
      if (e.def.kind === "critter") {
        const hop = moving ? Math.abs(Math.sin(t * 6 + e.tile.x)) * 0.12 : Math.abs(Math.sin(t * 2.2 + e.tile.x)) * 0.05;
        e.mesh.position.y = hop;
        e.mesh.rotation.y = Math.sin(t * 2 + e.tile.x) * 0.3;
      } else {
        const bob = moving ? Math.abs(Math.sin(t * 5 + e.tile.x)) * 0.03 : Math.sin(t * 2.4 + e.tile.x) * 0.02;
        e.mesh.position.y = bob;
      }
    }
    void dt;
  }

  // ————— internals —————
  private buildings(): TownBuilding[] {
    return this.getBuildings() ?? [];
  }
  private buildingsOf(...types: BuildingType[]): TownBuilding[] {
    return this.buildings().filter((b) => (types as string[]).includes(b.type));
  }

  private nearbyBuildingType(e: NpcEntity, dist: number): string | null {
    for (const b of this.buildings()) {
      if (Math.max(Math.abs(b.x - e.tile.x), Math.abs(b.y - e.tile.y)) <= dist) return b.type;
    }
    return null;
  }

  private pickNearest(e: NpcEntity, list: TownBuilding[]): TownBuilding | null {
    let best: TownBuilding | null = null;
    let bestD = Infinity;
    for (const b of list) {
      if (!this.nearestWalkableAdjacent({ x: b.x, y: b.y })) continue;
      const d = Math.max(Math.abs(b.x - e.tile.x), Math.abs(b.y - e.tile.y));
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /** Begin a task: path to the nearest walkable tile beside a building. */
  private startTask(e: NpcEntity, b: TownBuilding): boolean {
    const adj = this.nearestWalkableAdjacent({ x: b.x, y: b.y });
    if (!adj) return false;
    const path = findPath(this.grid, e.tile.x, e.tile.y, adj.x, adj.y);
    if (!path) return false;
    e.path = path.map(([px, py]) => ({ x: px, y: py }));
    e.pathIdx = 0;
    e.stepAcc = 0;
    e.task = b.type === "CAMPFIRE" ? "to_fire" : "to_building";
    e.buildingType = b.type;
    e.target = adj;
    return true;
  }

  private followPath(e: NpcEntity): boolean {
    if (!e.path || e.path.length === 0) return true;
    e.stepAcc++;
    if (e.stepAcc < TICKS_PER_STEP) return false;
    e.stepAcc = 0;
    const step = e.path[e.pathIdx];
    if (!step) return true;
    if (!this.grid.isWalkable(step.x, step.y)) { e.path = null; return true; }
    e.tile = { x: step.x, y: step.y };
    e.mesh.position.set(step.x, 0, step.y);
    e.pathIdx++;
    return e.pathIdx >= e.path.length;
  }

  private nearestWalkableAdjacent(tile: { x: number; y: number }): { x: number; y: number } | null {
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const x = tile.x + dx, y = tile.y + dy;
      if (this.grid.isWalkable(x, y)) return { x, y };
    }
    if (this.grid.isWalkable(tile.x, tile.y)) return { x: tile.x, y: tile.y };
    return null;
  }

  private findStart(def: NpcDef): { x: number; y: number } {
    const home = def.home;
    if (this.grid.isWalkable(home.x, home.y)) return { x: home.x, y: home.y };
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = home.x + dx, y = home.y + dy;
          if (this.grid.isWalkable(x, y)) return { x, y };
        }
      }
    }
    return { x: home.x, y: home.y };
  }

  private wanderTick(e: NpcEntity) {
    if (!e.target) {
      e.idleAcc++;
      if (e.idleAcc >= IDLE_BEFORE_NEW_TARGET) {
        e.idleAcc = 0;
        e.target = this.pickTarget(e);
      }
      return;
    }
    e.stepAcc++;
    if (e.stepAcc < TICKS_PER_STEP) return;
    e.stepAcc = 0;
    const next = this.stepToward(e);
    if (!next) {
      e.target = null;
      return;
    }
    e.tile = next;
    e.mesh.position.set(next.x, 0, next.y);
    if (next.x === e.target.x && next.y === e.target.y) {
      e.target = null;
      e.idleAcc = 0;
    }
  }

  private pickTarget(e: NpcEntity): { x: number; y: number } | null {
    const home = e.def.home;
    for (let tries = 0; tries < 12; tries++) {
      const dx = Math.floor(Math.random() * (e.def.radius * 2 + 1)) - e.def.radius;
      const dy = Math.floor(Math.random() * (e.def.radius * 2 + 1)) - e.def.radius;
      const x = home.x + dx, y = home.y + dy;
      if (!this.grid.isWalkable(x, y)) continue;
      if (Math.abs(x - e.tile.x) + Math.abs(y - e.tile.y) < 2) continue;
      return { x, y };
    }
    return null;
  }

  private stepToward(e: NpcEntity): { x: number; y: number } | null {
    const { x, y } = e.tile;
    const tx = e.target!.x, ty = e.target!.y;
    const dirs: [number, number][] = [
      [Math.sign(tx - x), Math.sign(ty - y)],
      [Math.sign(tx - x), 0],
      [0, Math.sign(ty - y)],
      [1, 0], [-1, 0], [0, 1], [0, -1],
    ];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx === x && ny === y) continue;
      if (nx < 1 || ny < 1 || nx >= this.grid.width - 1 || ny >= this.grid.height - 1) continue;
      if (!this.grid.isWalkable(nx, ny)) continue;
      return { x: nx, y: ny };
    }
    return null;
  }
}
