// P6: world map + fast travel. Owns the discovered points of interest (the
// dungeon entrance, Eldric's camp, the town centre) and the persisted
// fast-travel unlock. Discovery is proximity-based; fast travel unlocks once
// the P6 onboarding quest is complete.
import type { DungeonSystem } from "./DungeonSystem";
import type { QuestSystem } from "./QuestSystem";

export interface PoiInfo {
  id: string;
  name: string;
  icon: string;
  x: number;
  y: number;
  discovered: boolean;
  /** P6b: boss lairs render with a distinct (red) marker. */
  boss?: boolean;
}

export interface MapSnapshot {
  size: number;
  player: { x: number; y: number };
  unlocked: boolean;
  pois: PoiInfo[];
}

/** The player-owned subset of map state (persisted with the save). */
export interface MapStore {
  discovered: string[];
  fastTravel: boolean;
}

const POI_DISCOVER_RADIUS = 3; // tiles — step within this to "explore" a spot

export class MapSystem {
  private dungeon: DungeonSystem;
  private quest: QuestSystem;
  private size: number;
  private store: MapStore;
  /** P6b: resolves the Forest Ogre's current lair tile (its home). */
  private getOgre: () => { x: number; y: number } | null;

  constructor(
    size: number,
    dungeon: DungeonSystem,
    quest: QuestSystem,
    store: MapStore,
    getOgre: () => { x: number; y: number } | null = () => null
  ) {
    this.size = size;
    this.dungeon = dungeon;
    this.quest = quest;
    this.store = store;
    this.getOgre = getOgre;
    if (!this.store.discovered.includes("town")) this.store.discovered.push("town");
  }

  private pois(): { id: string; name: string; icon: string; x: number; y: number; boss?: boolean }[] {
    const base = [
      { id: "town", name: "Isoperia Centre", icon: "🏠", x: 15, y: 15 },
      { id: "caves", name: "The Caves", icon: "🕳️", x: this.dungeon.entrance.x, y: this.dungeon.entrance.y },
      { id: "eldric", name: "Eldric's Camp", icon: "🧭", x: this.quest.guide.x, y: this.quest.guide.y },
    ];
    const ogre = this.getOgre();
    if (!ogre) return base;
    // Skip the boss marker if it would sit exactly on another waypoint.
    if (base.some((p) => p.x === ogre.x && p.y === ogre.y)) return base;
    return [...base, { id: "ogre", name: "The Forest Ogre", icon: "👹", x: ogre.x, y: ogre.y, boss: true }];
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
      pois: this.pois().map((p) => ({ ...p, discovered: this.store.discovered.includes(p.id) })),
    };
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