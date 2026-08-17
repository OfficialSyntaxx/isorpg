// BuildSystem: drag/tap-to-place settlement structures with tile validation,
// plus passive per-tick building yields (GDD §5.B).
import * as THREE from "three";
import type { Grid } from "../world/Grid";
import type { GameState, TownBuilding } from "../state/GameState";
import { BUILDINGS, type BuildingType } from "../data/Buildings";
import { addItem, isFull, removeItem, countItem } from "../components/Inventory";
import { levelFromXp } from "../data/XPTable";
import { makeBuilding, makeTileHighlight } from "../generators/Settlement";
import { TICK_MS } from "../core/Engine";

export type PlaceDenyReason =
  | "level" | "max_count" | "materials" | "tile_invalid";

export interface BuildCallbacks {
  onPlaced?: (b: TownBuilding) => void;
  onDenied?: (reason: PlaceDenyReason, message: string) => void;
  onPlacingChanged?: (type: BuildingType | null) => void;
  onStorageChanged?: () => void;
}

const PASSIVE_INTERVAL_MS = 10 * TICK_MS; // ~6s per passive conversion cycle
const MAX_BUILD_LEVEL = 3; // P7.5: upgrades go up to level 3

export class BuildSystem {
  private scene: THREE.Scene;
  private grid: Grid;
  private state: GameState;
  private cb: BuildCallbacks = {};
  private meshes = new Map<string, THREE.Group>();
  private highlightGroup: THREE.Group;
  private pendingType: BuildingType | null = null;
  private passiveAcc = 0;

  constructor(scene: THREE.Scene, grid: Grid, state: GameState) {
    this.scene = scene;
    this.grid = grid;
    this.state = state;
    this.highlightGroup = new THREE.Group();
    this.highlightGroup.name = "build-highlights";
    scene.add(this.highlightGroup);
  }

  setCallbacks(cb: BuildCallbacks) { this.cb = cb; }
  get placing(): BuildingType | null { return this.pendingType; }

  /** Recreate meshes + grid occupancy for buildings restored from a save. */
  rehydrate() {
    for (const b of this.state.town.buildings) {
      if (this.meshes.has(b.id)) continue;
      const mesh = makeBuilding(b.type);
      mesh.position.set(b.x, 0, b.y);
      this.scene.add(mesh);
      this.meshes.set(b.id, mesh);
      this.grid.setOccupant(b.x, b.y, "BUILDING", b.id);
    }
    this.applyStorage();
  }

  count(type: BuildingType): number {
    return this.state.town.buildings.filter((b) => b.type === type).length;
  }
  hasBuilding(type: BuildingType): boolean { return this.count(type) > 0; }

  canAfford(type: BuildingType): boolean {
    return BUILDINGS[type].baseCost.every((c) => countItem(this.state.player.inventory, c.itemId) >= c.qty);
  }

  startPlacing(type: BuildingType) {
    const def = BUILDINGS[type];
    const lvl = levelFromXp(this.state.player.skills.construction.xp);
    if (lvl < def.levelReq) { this.cb.onDenied?.("level", `Requires Construction level ${def.levelReq}`); return; }
    if (this.count(type) >= def.maxCount) { this.cb.onDenied?.("max_count", `Already built the max ${def.maxCount} ${def.name}`); return; }
    if (!this.canAfford(type)) { this.cb.onDenied?.("materials", "Not enough materials"); return; }
    this.pendingType = type;
    this.showHighlights();
    this.cb.onPlacingChanged?.(type);
  }

  cancelPlacing() {
    this.pendingType = null;
    this.clearHighlights();
    this.cb.onPlacingChanged?.(null);
  }

  private validTile(gx: number, gy: number): boolean {
    const t = this.grid.at(gx, gy);
    if (!t) return false;
    if (!this.grid.isRegionUnlocked(gx, gy)) return false;
    if (!t.buildable || t.occupant !== "NONE") return false;
    return t.zoneId === "TOWN_CENTER" || t.zoneId === "SETTLEMENT";
  }

  private showHighlights() {
    this.clearHighlights();
    for (let gy = 1; gy < this.grid.height - 1; gy++) {
      for (let gx = 1; gx < this.grid.width - 1; gx++) {
        if (!this.validTile(gx, gy)) continue;
        const h = makeTileHighlight(0x5ce087);
        h.position.set(gx, 0.615, gy);
        this.highlightGroup.add(h);
      }
    }
  }

  private clearHighlights() {
    for (const c of [...this.highlightGroup.children]) {
      this.highlightGroup.remove(c);
      const mesh = c as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }

  /** Attempt to place the pending building at a tapped tile. Returns true if the tap was consumed. */
  tryPlaceAt(gx: number, gy: number): boolean {
    if (!this.pendingType) return false;
    const type = this.pendingType;
    if (!this.validTile(gx, gy)) {
      this.cb.onDenied?.("tile_invalid", "Can't build there");
      return true;
    }
    if (!this.canAfford(type)) {
      this.cb.onDenied?.("materials", "Not enough materials");
      this.cancelPlacing();
      return true;
    }
    const def = BUILDINGS[type];
    for (const c of def.baseCost) removeItem(this.state.player.inventory, c.itemId, c.qty);

    const id = `${type.toLowerCase()}_${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`;
    const b: TownBuilding = { id, type, x: gx, y: gy, level: 1 };
    this.state.town.buildings.push(b);
    this.grid.setOccupant(gx, gy, "BUILDING", id);

    const mesh = makeBuilding(type);
    mesh.position.set(gx, 0, gy);
    this.scene.add(mesh);
    this.meshes.set(id, mesh);
    popIn(mesh);

    this.state.player.skills.construction.xp += def.buildXp;
    this.applyStorage();

    this.cancelPlacing();
    this.cb.onPlaced?.(b);
    return true;
  }

  // ————— Passive effects —————
  get storageBonus(): number { return this.count("STOREHOUSE") * 250; }
  /** P7.5: offline cap scales with the Town Hall's level (8 + 4h per level). */
  get offlineCapHours(): number { return 8 + this.hallLevel() * 4; }

  /** Level of the first installed building of a type (0 = none). */
  levelOf(type: BuildingType): number {
    const b = this.state.town.buildings.find((x) => x.type === type);
    return b?.level ?? 0;
  }

  /** Town Hall level (0..3) — drives the offline cap and tax. */
  hallLevel(): number { return this.levelOf("TOWN_HALL"); }

  /** P7.5: buildings upgrade to level 3 (each level doubles its base cost). */
  canUpgrade(type: BuildingType): boolean {
    const lvl = this.levelOf(type);
    if (lvl <= 0 || lvl >= MAX_BUILD_LEVEL) return false;
    return this.upgradeCost(type).every((c) => countItem(this.state.player.inventory, c.itemId) >= c.qty);
  }

  upgradeCost(type: BuildingType): { itemId: string; qty: number }[] {
    const next = this.levelOf(type) + 1;
    return BUILDINGS[type].baseCost.map((c) => ({ itemId: c.itemId, qty: c.qty * next }));
  }

  /** Upgrade the first installed instance; consumes materials scaled to the new level. */
  upgradeType(type: BuildingType): boolean {
    const b = this.state.town.buildings.find((x) => x.type === type);
    if (!b || b.level >= MAX_BUILD_LEVEL) return false;
    const cost = this.upgradeCost(type);
    if (!cost.every((c) => countItem(this.state.player.inventory, c.itemId) >= c.qty)) return false;
    for (const c of cost) removeItem(this.state.player.inventory, c.itemId, c.qty);
    b.level += 1;
    const mesh = this.meshes.get(b.id);
    if (mesh) mesh.scale.setScalar(1 + (b.level - 1) * 0.12);
    return true;
  }

  private applyStorage() {
    this.state.player.inventory.storageCap = 500
      + this.count("STOREHOUSE") * 250
      + this.count("STORAGE_BIN") * 50;
    this.cb.onStorageChanged?.();
  }

  /** Sawmill saws spare logs, Smelter smelts spare ore, Granary trickles food, Town Hall taxes gold. */
  tick(dtMs: number) {
    this.passiveAcc += dtMs;
    if (this.passiveAcc < PASSIVE_INTERVAL_MS) return;
    this.passiveAcc = 0;

    const inv = this.state.player.inventory;
    const room = () => !isFull(inv);

    for (let i = 0; i < this.count("SAWMILL"); i++) {
      if (!room()) break;
      const logId = ["willow_log", "oak_log", "normal_log"].find((id) => countItem(inv, id) > 0);
      if (logId) { removeItem(inv, logId, 1); addItem(inv, "plank", 1); }
    }
    for (let i = 0; i < this.count("SMELTER"); i++) {
      if (!room()) break;
      if (countItem(inv, "iron_ore") > 0 && countItem(inv, "coal") > 0) {
        removeItem(inv, "iron_ore", 1); removeItem(inv, "coal", 1); addItem(inv, "iron_bar", 1);
      } else if (countItem(inv, "copper_ore") > 0 && countItem(inv, "tin_ore") > 0) {
        removeItem(inv, "copper_ore", 1); removeItem(inv, "tin_ore", 1); addItem(inv, "bronze_bar", 1);
      }
    }
    const granaries = this.count("GRANARY");
    if (granaries > 0 && room()) addItem(inv, "raw_shrimp", granaries);

    const tax = this.hallLevel();
    if (tax > 0) addItem(inv, "coins", tax * 2);
  }
}

function popIn(mesh: THREE.Object3D) {
  mesh.scale.set(0.001, 0.001, 0.001);
  const start = performance.now();
  const dur = 260;
  function step() {
    const t = Math.min(1, (performance.now() - start) / dur);
    const s = 1 - Math.pow(1 - t, 3);
    mesh.scale.set(Math.max(0.001, s), Math.max(0.001, s), Math.max(0.001, s));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
