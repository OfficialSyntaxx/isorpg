// P3: living world — procedural villagers + ambient critters that wander near
// their home tiles and can be tapped to talk. Non-blocking: they never occupy
// grid tiles, so pathing and placement stay unaffected.
import * as THREE from "three";
import type { Grid } from "../world/Grid";
import { makeVillager, makeCritter } from "../generators/Villager";

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  kind: "villager" | "critter";
  home: { x: number; y: number };
  radius: number; // tiles around home they stay inside
  talk: string[];
}

const VILLAGERS: NpcDef[] = [
  {
    id: "bram", name: "Bram", title: "the Fisher", kind: "villager",
    home: { x: 9, y: 11 }, radius: 3,
    talk: ["\"The shrimp are biting today. The trout are deeper.\"", "\"Build a Smelter near the water if you fancy roasted fish.\"", "\"The pond freezes over at night — come back at dawn.\""],
  },
  {
    id: "wren", name: "Wren", title: "the Woodcutter", kind: "villager",
    home: { x: 11, y: 9 }, radius: 3,
    talk: ["\"These oaks need a sharper axe than my old bronze.\"", "\"Planks come from logs, and logs come from work.\"", "\"Mind the goblins past the treeline.\""],
  },
  {
    id: "tobias", name: "Old Tobias", title: "Town Elder", kind: "villager",
    home: { x: 10, y: 10 }, radius: 2,
    talk: ["\"The settlement grows with every log you haul home.\"", "\"A Storage Bin is cheap — build one before your pouch bursts.\"", "\"Bury the bones. It's only proper.\""],
  },
];

const CRITTERS: NpcDef[] = [
  { id: "rabbit_a", name: "Rabbit", title: "", kind: "critter", home: { x: 8, y: 9 }, radius: 4, talk: ["It hops off before you can grab it!"] },
  { id: "rabbit_b", name: "Rabbit", title: "", kind: "critter", home: { x: 12, y: 12 }, radius: 4, talk: ["It twitches its nose and scampers away."] },
];

export interface NpcEntity {
  def: NpcDef;
  tile: { x: number; y: number };
  target: { x: number; y: number } | null;
  stepAcc: number;
  idleAcc: number;
  talkIdx: number;
  mesh: THREE.Group;
}

const TICKS_PER_STEP = 3; // one tile every 3 ticks (~1.8s)
const IDLE_BEFORE_NEW_TARGET = 4; // ticks to stand still between walks

export class NpcSystem {
  private scene: THREE.Scene;
  private grid: Grid;
  entities: NpcEntity[] = [];

  constructor(scene: THREE.Scene, grid: Grid) {
    this.scene = scene;
    this.grid = grid;
    for (const def of [...VILLAGERS, ...CRITTERS]) {
      const mesh = def.kind === "villager"
        ? makeVillager(def.id === "tobias" ? "#8a7a5a" : def.id === "bram" ? "#4a7a9c" : "#5a8a4a", def.id === "tobias" ? "#d8cfc0" : "#3a3a46", def.id !== "wren")
        : makeCritter("#b8a894");
      const start = this.findStart(def);
      mesh.position.set(start.x, 0, start.y);
      this.scene.add(mesh);
      this.entities.push({ def, tile: start, target: null, stepAcc: 0, idleAcc: 0, talkIdx: 0, mesh });
    }
  }

  at(gx: number, gy: number): NpcEntity | null {
    for (const e of this.entities) {
      if (e.tile.x === gx && e.tile.y === gy && e.def.kind === "villager") return e;
    }
    return null;
  }

  /** Next talk line (cycles). */
  talk(e: NpcEntity): string {
    const line = e.def.talk[e.talkIdx % e.def.talk.length];
    e.talkIdx++;
    return line;
  }

  /** Called each 600ms tick: wander schedules. */
  tick() {
    for (const e of this.entities) {
      if (!e.target) {
        e.idleAcc++;
        if (e.idleAcc >= IDLE_BEFORE_NEW_TARGET) {
          e.idleAcc = 0;
          e.target = this.pickTarget(e);
        }
        continue;
      }
      e.stepAcc++;
      if (e.stepAcc < TICKS_PER_STEP) continue;
      e.stepAcc = 0;
      const next = this.stepToward(e);
      if (!next) {
        e.target = null; // stuck — pick again next cycle
        continue;
      }
      e.tile = next;
      e.mesh.position.set(next.x, 0, next.y);
      if (next.x === e.target.x && next.y === e.target.y) {
        e.target = null;
        e.idleAcc = 0;
      }
    }
  }

  /** Frame-time idle bob / critter hop. */
  update(dt: number) {
    const t = performance.now() / 1000;
    for (const e of this.entities) {
      const moving = !!e.target;
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

  private pickTarget(e: NpcEntity): { x: number; y: number } | null {
    const home = e.def.home;
    for (let tries = 0; tries < 12; tries++) {
      const dx = Math.floor(Math.random() * (e.def.radius * 2 + 1)) - e.def.radius;
      const dy = Math.floor(Math.random() * (e.def.radius * 2 + 1)) - e.def.radius;
      const x = home.x + dx, y = home.y + dy;
      if (!this.grid.isWalkable(x, y)) continue;
      if (Math.abs(x - e.tile.x) + Math.abs(y - e.tile.y) < 2) continue; // too close — boring
      return { x, y };
    }
    return null;
  }

  /** Greedy one-tile step toward the target, preferring walkable ground. */
  private stepToward(e: NpcEntity): { x: number; y: number } | null {
    const { x, y } = e.tile;
    const dirs: [number, number][] = [
      [Math.sign(e.target!.x - x), Math.sign(e.target!.y - y)],
      [Math.sign(e.target!.x - x), 0],
      [0, Math.sign(e.target!.y - y)],
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
