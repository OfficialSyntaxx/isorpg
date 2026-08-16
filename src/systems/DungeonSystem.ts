// P5: DungeonSystem — one procedural single-level dungeon in the deep
// wilderness. The dungeon renders inside its own THREE.Group parked far from
// the surface world, with its own tile map, so existing systems (camera, A*,
// combat AI) keep working. Enter/exit via portal tiles.
import * as THREE from "three";
import type { CombatSystem } from "./CombatSystem";
import type { MonsterCombat } from "../world/Monster";
import { MONSTERS } from "../data/Combat";
import { spawnMonster } from "../world/Monster";

const W = 17; // dungeon width
const H = 20; // dungeon height
export const DUNGEON_ORIGIN = { x: 1000, z: 1000 };

const FLOOR = ".";
const WALL = "#";

interface Rect { x: number; y: number; w: number; h: number }

export class DungeonSystem {
  // Surface-world entrance tile (deep wilderness).
  entrance = { x: 0, y: 0 };
  spawn = { x: 0, y: 0 };
  chest = { x: 0, y: 0 };
  exit = { x: 0, y: 0 };

  // P5.2: locked door + Iron Key. The door tile is sealed (non-walkable) until
  // unlock(); the key sits in a side room and is consumed on use.
  door = { x: 0, y: 0 };
  key = { x: 0, y: 0 };
  keyTaken = false;
  doorOpened = false;

  // P5.3: the Cave Brute guard — the tile just past the locked door.
  brute = { x: 0, y: 0 };
  private bruteMonster: MonsterCombat | null = null;

  // P7.2: floor depth — floor 2 re-uses the generator with a harder pool and
  // a richer chest; the exit ring on floor 1 is a stairway down.
  currentFloor = 1;
  /** P7.2: the retreat tile on floor 2 that leads back to floor 1. */
  upstairs = { x: 2, y: 2 };
  private exitRingTeal!: THREE.Mesh;
  private exitRingAmber!: THREE.Mesh;
  private stairsUpMesh = new THREE.Group();

  active = false;
  openedChest = false;

  private scene: THREE.Scene;
  private combat: CombatSystem;
  private tilesGrid: { isWalkable(x: number, y: number): boolean };
  private size: number;
  tiles: string[][] = [];
  private group = new THREE.Group();
  private doorMesh = new THREE.Group();
  private lockedDoorMesh = new THREE.Group();
  private pickKeyMesh = new THREE.Group();
  private monsters: MonsterCombat[] = [];

  constructor(scene: THREE.Scene, combat: CombatSystem, surfaceGrid: { isWalkable(x: number, y: number): boolean }, worldWidth = 30) {
    this.scene = scene;
    this.combat = combat;
    this.tilesGrid = surfaceGrid;
    this.size = worldWidth;
    this.group.position.set(DUNGEON_ORIGIN.x, 0, DUNGEON_ORIGIN.z);
    this.group.visible = false;
    scene.add(this.group);
    this.findEntrance();
    this.generate();
  }

  // ————— generation —————
  private findEntrance() {
    // P6.1: a door in the deep wilds — scan from the far corner inward for the
    // first walkable tile in the outer quarter (sized to the world).
    const g = this.tilesGrid;
    const s = this.size;
    for (let gy = s - 2; gy >= 2; gy--) {
      for (let gx = s - 2; gx >= 2; gx--) {
        if (gx >= s - 12 && gy >= s - 12 && g.isWalkable(gx, gy)) { this.entrance = { x: gx, y: gy }; return; }
      }
    }
    for (let gy = s - 2; gy >= 2; gy--) {
      for (let gx = s - 2; gx >= 2; gx--) {
        if (g.isWalkable(gx, gy)) { this.entrance = { x: gx, y: gy }; return; }
      }
    }
    this.entrance = { x: s - 8, y: s - 8 };
  }

  private generate(): void {
    // Start all walls, carve rooms and corridors.
    this.tiles = Array.from({ length: H }, () => Array(W).fill(WALL) as string[]);

    // Deterministic 5-room skeleton — always yields a full, reachable level.
    const rooms: Rect[] = [
      { x: 2, y: 2, w: 5, h: 4 },
      { x: 10, y: 2, w: 4, h: 5 },
      { x: 3, y: 12, w: 5, h: 4 },
      { x: 10, y: 10, w: 5, h: 5 },
      { x: 5, y: 17, w: 4, h: 3 }, // exit: isolated corner, single seam (7,16)
    ];
    for (const r of rooms) {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) this.tiles[y][x] = FLOOR;
    }
    // L-corridors between consecutive room centres.
    for (let i = 1; i < rooms.length; i++) {
      const a = rooms[i - 1], b = rooms[i];
      const ax = a.x + Math.floor(a.w / 2), ay = a.y + Math.floor(a.h / 2);
      const bx = b.x + Math.floor(b.w / 2), by = b.y + Math.floor(b.h / 2);
      carveH(ax > bx ? -1 : 1, ax, bx, ay, this.tiles);
      carveV(ay > by ? -1 : 1, ay, by, bx, this.tiles);
    }
    // Spawn: first room; chest: third room; exit: last room.
    this.spawn = roomCenter(rooms[0]);
    this.chest = roomCenter(rooms[2]);
    this.exit = roomCenter(rooms[rooms.length - 1]);
    // P5.2: the Iron Key sits in a side chamber (room 3, a dead-end branch).
    this.key = roomCenter(rooms[3]);
    // P5.2: lock the sole corridor seam leading into the exit room, so the
    // exit is unreachable until the key is used.
    const exr = rooms[rooms.length - 1], prv = rooms[rooms.length - 2];
    const pc = roomCenter(prv);
    const insideAnyRoom = (x: number, y: number) =>
      rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    let bestDoor: { x: number; y: number } | null = null, bestD = 1e9;
    for (let y = exr.y - 1; y <= exr.y + exr.h; y++) {
      for (let x = exr.x - 1; x <= exr.x + exr.w; x++) {
        if (insideAnyRoom(x, y)) continue;
        if (this.tiles[y] && this.tiles[y][x] === FLOOR) {
          const d = Math.abs(x - pc.x) + Math.abs(y - pc.y);
          if (d < bestD) { bestD = d; bestDoor = { x, y }; }
        }
      }
    }
    this.door = bestDoor ?? this.exit;
    this.tiles[this.door.y][this.door.x] = WALL; // sealed until the key is used
    // P5.3: the Cave Brute guard stands just past the door, inside the exit room.
    this.brute = { x: this.door.x, y: Math.min(this.door.y + 1, H - 2) };
    this.tiles[this.brute.y][this.brute.x] = FLOOR;
    this.tiles[this.key.y][this.key.x] = FLOOR;
    this.tiles[this.spawn.y][this.spawn.x] = FLOOR;
    this.tiles[this.chest.y][this.chest.x] = FLOOR;
    this.tiles[this.exit.y][this.exit.x] = FLOOR;
  }

  // ---- combat-grid bridge (used while active) —-
  at(x: number, y: number) {
    if (x < 0 || y < 0 || y >= H || x >= W) return null;
    const floor = this.tiles[y][x] === FLOOR;
    return {
      walkable: floor,
      buildable: false,
      occupant: "NONE" as const,
      occupantId: null,
      zoneId: "DUNGEON",
      terrainType: "DIRT" as const,
      seed: 0,
      x, y, elevation: 0,
    };
  }
  isWalkable(x: number, y: number): boolean { const t = this.at(x, y); return !!t && t.walkable; }
  isRegionUnlocked() { return true; }
  setOccupant() {}
  clearOccupant() {}
  get width() { return W; }
  get height() { return H; }
  /** The scene group monsters/hero are parented into while inside. */
  get worldGroup() { return this.group; }

  // ---- enter / exit —---
  buildMeshes(): void {
    // Floor slab.
    const floorMat = new THREE.MeshStandardMaterial({ color: "#3a3f4a", roughness: 1, flatShading: true });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, H / 2);
    this.group.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: "#565b6a", roughness: 0.9, flatShading: true });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (this.tiles[y][x] !== WALL) continue;
        const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1.3, 1), wallMat);
        box.position.set(x, 0.65, y);
        this.group.add(box);
      }
    }
    // Chest.
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: "#d9a441", flatShading: true, metalness: 0.4, roughness: 0.6 }));
    chest.position.set(this.chest.x, 0.35, this.chest.y);
    this.group.add(chest);
    // Exit portal ring — floor 2 only; on floor 1 the same tile is stairs down.
    const portal = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.7, 24),
      new THREE.MeshBasicMaterial({ color: "#4fe0c0", transparent: true, opacity: 0.9, depthWrite: false })
    );
    portal.rotation.x = -Math.PI / 2;
    portal.position.set(this.exit.x, 0.04, this.exit.y);
    portal.renderOrder = 5;
    this.group.add(portal);
    this.exitRingTeal = portal;
    // P7.2: floor-1 stairway down (amber) at the exit tile.
    const stairs = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.6, 4),
      new THREE.MeshBasicMaterial({ color: "#ffb84a", transparent: true, opacity: 0.95, depthWrite: false })
    );
    stairs.rotation.x = -Math.PI / 2;
    stairs.position.set(this.exit.x, 0.05, this.exit.y);
    this.group.add(stairs);
    this.exitRingAmber = stairs;
    // P7.2: floor-2 stairs up (blue) — the retreat marker.
    const up = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.5, 4),
      new THREE.MeshBasicMaterial({ color: "#6fa8ff", transparent: true, opacity: 0.9, depthWrite: false })
    );
    up.rotation.x = -Math.PI / 2;
    up.position.set(this.upstairs.x, 0.05, this.upstairs.y);
    this.stairsUpMesh.add(up);
    this.group.add(this.stairsUpMesh);
    this.stairsUpMesh.visible = false;
    // P5.2: locked iron door blocking the corridor — bars + glowing keyhole.
    const locked = new THREE.Group();
    const ldBar = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 0.35), new THREE.MeshStandardMaterial({ color: "#3c4655", flatShading: true, metalness: 0.6, roughness: 0.5 }));
    ldBar.position.set(this.door.x, 0.8, this.door.y);
    locked.add(ldBar);
    const keyhole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.4), new THREE.MeshStandardMaterial({ color: "#d9a441", flatShading: true, metalness: 0.6 }));
    keyhole.position.set(this.door.x, 0.75, this.door.y);
    locked.add(keyhole);
    this.group.add(locked);
    this.lockedDoorMesh = locked;
    // P5.2: Iron Key pick-up marker in the side chamber.
    const pick = new THREE.Group();
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.2), new THREE.MeshStandardMaterial({ color: "#ffd24a", emissive: "#8a6a00", flatShading: true, metalness: 0.5, roughness: 0.4 }));
    kb.position.set(this.key.x, 0.45, this.key.y);
    pick.add(kb);
    const keyGlow = new THREE.Mesh(new THREE.CircleGeometry(0.18, 12), new THREE.MeshBasicMaterial({ color: "#ffe9a0", transparent: true, opacity: 0.55, depthWrite: false }));
    keyGlow.rotation.x = -Math.PI / 2;
    keyGlow.position.set(this.key.x, 0.04, this.key.y);
    pick.add(keyGlow);
    this.group.add(pick);
    this.pickKeyMesh = pick;
    // Overworld door marker.
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 0.9), new THREE.MeshStandardMaterial({ color: "#8a6a3a", flatShading: true }));
    door.position.set(this.entrance.x, 0.8, this.entrance.y);
    this.doorMesh.add(door);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshBasicMaterial({ color: "#2a2a3a", transparent: true, opacity: 0.5 }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(this.entrance.x, 0.05, this.entrance.y);
    this.doorMesh.add(glow);
    this.scene.add(this.doorMesh);
  }

  enter(combat: CombatSystem): void {
    this.active = true;
    this.currentFloor = 1;
    this.resetStory();
    this.despawnPool(combat);
    this.spawnBrute(combat);
    this.spawnPool(combat, 1);
    this.syncFloorVisuals();
    this.group.visible = true;
  }

  private resetStory(): void {
    this.openedChest = false;
    this.keyTaken = false;
    this.doorOpened = false;
    this.tiles[this.door.y][this.door.x] = WALL;
    if (this.lockedDoorMesh) this.lockedDoorMesh.visible = true;
    if (this.pickKeyMesh) this.pickKeyMesh.visible = true;
  }

  /** P7.2: floor markers — teal portal + blue retreat show only on floor 2. */
  private syncFloorVisuals(): void {
    const f2 = this.currentFloor === 2;
    if (this.exitRingTeal) this.exitRingTeal.visible = f2;
    if (this.exitRingAmber) this.exitRingAmber.visible = !f2;
    this.stairsUpMesh.visible = f2;
  }

  private despawnPool(combat: CombatSystem): void {
    for (const m of this.monsters) combat.removeMonster(m);
    this.monsters = [];
    this.bruteMonster = null;
  }

  private spawnBrute(combat: CombatSystem): void {
    const b = spawnMonster("cave_brute", MONSTERS.cave_brute, this.brute.x, this.brute.y);
    this.bruteMonster = b;
    this.addMonster(b, combat);
  }

  /** P7.2: descend to floor 2 — harder pool, richer chest, fresh story gates. */
  descend(combat: CombatSystem): void {
    if (this.currentFloor === 2) return;
    this.currentFloor = 2;
    this.resetStory();
    this.despawnPool(combat);
    this.spawnPool(combat, 2);
    this.syncFloorVisuals();
  }

  /** P7.2: climb the blue stairs back to floor 1. */
  ascend(combat: CombatSystem): void {
    if (this.currentFloor === 1) return;
    this.currentFloor = 1;
    this.resetStory();
    this.despawnPool(combat);
    this.spawnBrute(combat);
    this.spawnPool(combat, 1);
    this.syncFloorVisuals();
  }

  /** P5.2: call once the player has the Iron Key — opens the sealed door. */
  unlock(): void {
    this.doorOpened = true;
    this.tiles[this.door.y][this.door.x] = FLOOR;
    if (this.lockedDoorMesh) this.lockedDoorMesh.visible = false;
  }

  /** P5.2: the key has been picked up — remove its world marker. */
  hideKey(): void {
    if (this.pickKeyMesh) this.pickKeyMesh.visible = false;
  }

  leave(): void {
    this.active = false;
    this.group.visible = false;
  }

  private spawnPool(combat: CombatSystem, floor: 1 | 2): void {
    // Floor 1: cave bats + slashers. Floor 2: packs of slashers + 2 brutes.
    const layout: [string, number][] = floor === 1
      ? [["cave_bat", 4], ["cave_slasher", 2]]
      : [["cave_slasher", 6], ["cave_brute", 2]];
    const spots: { x: number; y: number }[] = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (this.tiles[y][x] !== FLOOR) continue;
        if (Math.abs(x - this.spawn.x) + Math.abs(y - this.spawn.y) < 6) continue;
        // Don't park monsters on story tiles (chest, exit, door, key, brute).
        if ((x === this.chest.x && y === this.chest.y)
          || (x === this.exit.x && y === this.exit.y)
          || (x === this.door.x && y === this.door.y)
          || (x === this.key.x && y === this.key.y)
          || (x === this.brute.x && y === this.brute.y)) continue;
        spots.push({ x, y });
      }
    }
    const idx = (n: number) => spots[Math.floor((n * 7919) % spots.length)];
    let n = 1;
    for (const [type, count] of layout) {
      for (let i = 0; i < count; i++) {
        const s = idx(n++);
        if (!s) continue;
        const m = spawnMonster(type, MONSTERS[type], s.x, s.y);
        this.addMonster(m, combat);
      }
    }
  }

  private addMonster(m: MonsterCombat, combat: CombatSystem): void {
    this.monsters.push(m);
    this.group.add(m.group);
    m.group.position.set(m.tile.x, 0, m.tile.y);
    combat.addMonster(m);
  }

  monsterAt(x: number, y: number): MonsterCombat | null {
    for (const m of this.monsters) {
      if (!m.dead && m.tile.x === x && m.tile.y === y) return m;
    }
    return null;
  }

  chestLoot(): { itemId: string; qty: number }[] {
    // P7.2: floor 2 pays better — bigger coin/ore stacks plus coal.
    const f2 = this.currentFloor === 2;
    const drops: { itemId: string; qty: number }[] = f2
      ? [
          { itemId: "coins", qty: 40 + Math.floor(Math.random() * 51) },
          { itemId: "iron_ore", qty: 3 + Math.floor(Math.random() * 4) },
          { itemId: "coal", qty: 2 + Math.floor(Math.random() * 3) },
          { itemId: "cooked_trout", qty: 2 + Math.floor(Math.random() * 2) },
        ]
      : [
          { itemId: "coins", qty: 15 + Math.floor(Math.random() * 26) },
          { itemId: "iron_ore", qty: 2 + Math.floor(Math.random() * 3) },
          { itemId: "cooked_trout", qty: 1 + Math.floor(Math.random() * 2) },
        ];
    if (Math.random() < (f2 ? 0.25 : 0.12)) drops.push({ itemId: "iron_sword", qty: 1 });
    else if (Math.random() < (f2 ? 0.15 : 0.08)) drops.push({ itemId: "shortbow", qty: 1 });
    return drops;
  }
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function roomCenter(r: Rect): { x: number; y: number } {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}
function carveH(dir: number, ax: number, bx: number, y: number, tiles: string[][]) {
  for (let x = ax; x !== bx + dir; x += dir) if (tiles[y] && tiles[y][x] === "#") tiles[y][x] = ".";
}
function carveV(dir: number, ay: number, by: number, x: number, tiles: string[][]) {
  for (let y = ay; y !== by + dir; y += dir) if (tiles[y] && tiles[y][x] === "#") tiles[y][x] = ".";
}