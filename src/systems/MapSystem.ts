// P6: world map + fast travel. Owns the discovered points of interest (the
// dungeon entrance, Eldric's camp, the town centre) and the persisted
// fast-travel unlock. Discovery is proximity-based; fast travel unlocks once
// the P6 onboarding quest is complete.
import type { DungeonSystem } from "./DungeonSystem";
import type { QuestSystem } from "./QuestSystem";
import { GRID_CHUNK } from "../world/Grid";

export interface PoiInfo {
  id: string;
  name: string;
  icon: string;
  x: number;
  y: number;
  discovered: boolean;
  /** P6b: boss lairs render with a distinct (red) marker. */
  boss?: boolean;
  /**
   * Visible without being "discovered".
   *
   * Discovery is a persisted list of ids, which suits fixed landmarks. A clue's
   * dig site is neither fixed nor something you find by exploring — the scroll
   * just told you where it is — so it is shown directly instead of being written
   * into the save's discovered list, which would fill up with dead sites.
   */
  always?: boolean;
}

/** The player-owned subset of map state (persisted with the save). */
export interface MapStore {
  discovered: string[];
  fastTravel: boolean;
  /** P6.1: tile indices the player has walked (for the coverage meter). */
  explored: number[];
}

export interface MapCoverage {
  pct: number; // 0..100 of tiles explored
  coarse: string[]; // one "E"/"." per chunk block, row-major
}

export interface MapSnapshot {
  size: number;
  player: { x: number; y: number };
  unlocked: boolean;
  pois: PoiInfo[];
  coverage: MapCoverage;
}

const POI_DISCOVER_RADIUS = 3; // tiles — step within this to "explore" a spot

export class MapSystem {
  private dungeon: DungeonSystem;
  private quest: QuestSystem;
  private size: number;
  private store: MapStore;
  /** P6b: resolves the Forest Ogre's current lair tile (its home). */
  private getOgre: () => { x: number; y: number } | null;
  private getClueSite: () => { x: number; y: number } | null = () => null;
  /** P6.1: per-tile exploration flags (indexed y * size + x). */
  private explored = new Uint8Array(0);

  constructor(
    size: number,
    dungeon: DungeonSystem,
    quest: QuestSystem,
    store: MapStore,
    getOgre: () => { x: number; y: number } | null = () => null,
    /** The active clue's dig site, if a hunt is running. */
    getClueSite: () => { x: number; y: number } | null = () => null
  ) {
    this.size = size;
    this.dungeon = dungeon;
    this.quest = quest;
    this.store = store;
    this.getOgre = getOgre;
    this.getClueSite = getClueSite;
    if (!this.store.discovered.includes("town")) this.store.discovered.push("town");
    this.store.explored ??= [];
    this.explored = new Uint8Array(size * size);
    for (const idx of this.store.explored) if (idx >= 0 && idx < this.explored.length) this.explored[idx] = 1;
  }

  private pois(): Omit<PoiInfo, "discovered">[] {
    const cx = Math.floor(this.size / 2);
    const base: Omit<PoiInfo, "discovered">[] = [
      { id: "town", name: "Isoperia Centre", icon: "🏠", x: cx, y: cx },
      { id: "caves", name: "The Caves", icon: "🕳️", x: this.dungeon.entrance.x, y: this.dungeon.entrance.y },
      { id: "eldric", name: "Eldric's Camp", icon: "🧭", x: this.quest.guide.x, y: this.quest.guide.y },
    ];
    const ogre = this.getOgre();
    if (ogre && !base.some((p) => p.x === ogre.x && p.y === ogre.y)) {
      // Skip the boss marker if it would sit exactly on another waypoint.
      base.push({ id: "ogre", name: "The Forest Ogre", icon: "👹", x: ogre.x, y: ogre.y, boss: true });
    }
    // The dig site is the only marker that moves, so it is appended last and
    // carries a fixed id — the discovery list must not fill up with dead sites.
    const dig = this.getClueSite();
    if (dig) base.push({ id: "clue_site", name: "Dig here", icon: "📜", x: dig.x, y: dig.y, always: true });
    return base;
  }

  get unlocked(): boolean { return this.store.fastTravel; }

  unlockFastTravel(): void {
    if (this.store.fastTravel) return;
    this.store.fastTravel = true;
  }

  snapshot(px: number, py: number): MapSnapshot {
    return {
      size: this.size,
      player: { x: px, y: py },
      unlocked: this.store.fastTravel,
      pois: this.pois().map((p) => ({ ...p, discovered: p.always === true || this.store.discovered.includes(p.id) })),
      coverage: this.coverage(),
    };
  }

  /** P6.1: mark the player's tile + 4-neighbours as walked (persisted). */
  recordExplore(px: number, py: number): void {
    const n = this.size;
    if (px < 0 || py < 0 || px >= n || py >= n) return;
    const mark = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= n || y >= n) return;
      const idx = y * n + x;
      if (this.explored[idx]) return;
      this.explored[idx] = 1;
      this.store.explored.push(idx);
    };
    mark(px, py); mark(px + 1, py); mark(px - 1, py); mark(px, py + 1); mark(px, py - 1);
  }

  /** P6.1: coverage % + a coarse per-chunk exploration mask for the UI. */
  private coverage(): MapCoverage {
    const n = this.size;
    let seen = 0;
    for (let i = 0; i < this.explored.length; i++) if (this.explored[i]) seen++;
    const cols = Math.max(1, Math.ceil(n / GRID_CHUNK));
    const coarse: string[] = [];
    for (let cb = 0; cb < cols; cb++) {
      for (let ca = 0; ca < cols; ca++) {
        let any = false;
        for (let y = cb * GRID_CHUNK; y < Math.min(n, (cb + 1) * GRID_CHUNK); y++) {
          for (let x = ca * GRID_CHUNK; x < Math.min(n, (ca + 1) * GRID_CHUNK); x++) {
            if (this.explored[y * n + x]) { any = true; break; }
          }
          if (any) break;
        }
        coarse.push(any ? "E" : ".");
      }
    }
    return { pct: Math.round((seen / (n * n)) * 1000) / 10, coarse };
  }

  /** Mark newly-explored POIs the player just walked near. Returns ids. */
  checkDiscoveries(px: number, py: number): string[] {
    const fresh: string[] = [];
    for (const p of this.pois()) {
      if (this.store.discovered.includes(p.id)) continue;
      if (Math.abs(p.x - px) + Math.abs(p.y - py) <= POI_DISCOVER_RADIUS) {
        this.store.discovered.push(p.id);
        fresh.push(p.id);
      }
    }
    return fresh;
  }

  /** Fast-travel target for a discovered waypoint, or null (locked/unknown). */
  travelTarget(id: string): { x: number; y: number } | null {
    if (!this.store.fastTravel) return null;
    const poi = this.pois().find((p) => p.id === id);
    if (!poi || !this.store.discovered.includes(id)) return null;
    return { x: poi.x, y: poi.y };
  }

  poiName(id: string): string {
    return this.pois().find((p) => p.id === id)?.name ?? id;
  }
}