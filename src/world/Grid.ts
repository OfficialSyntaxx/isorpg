// The 2D tilemap: data + occupancy, plus A* grid adapter (GDD §4).
import type { GridLike } from "../ai/AStar";

export type TerrainType = "GRASS" | "WATER" | "ROCK" | "DIRT" | "SAND" | "ROAD";
export type Occupant = "NONE" | "BUILDING" | "RESOURCE_NODE" | "MONSTER" | "NPC";

export interface Tile {
  x: number;
  y: number;
  elevation: number;
  terrainType: TerrainType;
  walkable: boolean;
  buildable: boolean;
  occupant: Occupant;
  occupantId: string | null;
  zoneId: string;
  // Deterministic decoration seed (permanent, so visuals survive reloads)
  seed: number;
}

export const TILE_SIZE = 1;

/** Chunk edge length for zoning/regions (6 → a 30x30 map yields real
 *  WILDERNESS corners beyond the town ring; a 10-tile chunk on small maps
 *  produced zero wilderness, so monsters never spawned in production). */
export const GRID_CHUNK = 6;

/** Cheap deterministic PRNG so the world is stable across sessions. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Grid implements GridLike {
  readonly width: number;
  readonly height: number;
  tiles: Tile[][];
  regionUnlocked: boolean[][]; // chunks of 10x10

  constructor(width = 20, height = 20) {
    this.width = width;
    this.height = height;
    this.tiles = [];
    this.regionUnlocked = this.initRegions(width, height);
    this.generate();
  }

  private initRegions(width: number, height: number): boolean[][] {
    // Chunks of GRID_CHUNK; center chunk unlocked.
    const cols = Math.max(1, Math.ceil(width / GRID_CHUNK));
    const rows = Math.max(1, Math.ceil(height / GRID_CHUNK));
    const grid: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) grid[r][c] = false;
    }
    const cr = Math.floor(rows / 2);
    const cc = Math.floor(cols / 2);
    if (grid[cr] && grid[cr][cc] !== undefined) grid[cr][cc] = true;
    return grid;
  }

  private generate() {
    const w = this.width;
    const h = this.height;
    const seeded = (x: number, y: number) => mulberry32(x * 31 + y * 57 + 1337);
    this.tiles = [];

    const zoneAt = (x: number, y: number): string => {
      const cols = Math.ceil(w / GRID_CHUNK);
      const rows = Math.ceil(h / GRID_CHUNK);
      const r = Math.floor(y / GRID_CHUNK), c = Math.floor(x / GRID_CHUNK);
      const cr = Math.floor(rows / 2), cc = Math.floor(cols / 2);
      if (r === cr && c === cc) return "TOWN_CENTER";
      if (r === cr - 1 || r === cr + 1 || c === cc - 1 || c === cc + 1) return "SETTLEMENT";
      return "WILDERNESS_LVL1";
    };

    for (let y = 0; y < h; y++) {
      const row: Tile[] = [];
      for (let x = 0; x < w; x++) {
        const rnd = seeded(x, y);
        const terrainType = this.rollTerrain(x, y, rnd);
        const walkable = terrainType !== "WATER" && terrainType !== "ROCK";
        const zoneId = zoneAt(x, y);
        row.push({
          x, y,
          elevation: terrainType === "WATER" ? -0.25 : this.rollElevation(x, y),
          terrainType,
          walkable,
          buildable: walkable,
          occupant: "NONE",
          occupantId: null,
          zoneId,
          seed: Math.floor(rnd() * 1e6),
        });
      }
      this.tiles.push(row);
    }
  }

  private rollTerrain(x: number, y: number, rnd: () => number): TerrainType {
    // A ring of deep water bounds the map; inner land is mostly grass with
    // scattered dirt/rock patches and a few lakes.
    const edge = x === 0 || y === 0 || x === this.width - 1 || y === this.height - 1;
    if (edge) return "WATER";
    if (isCoast(x, y, this.width, this.height)) return "SAND";
    const r = rnd();
    if (x > 3 && y > 3 && x < this.width - 4 && y < this.height - 4) {
      // blobby lakes in the interior via low-freq noise
      const n = Math.sin(x * 0.9) + Math.cos(y * 0.6) + Math.sin((x + y) * 0.45);
      if (n > 2.15) return "WATER";
    }
    if (r < 0.06) return "ROCK";
    if (r < 0.13) return "DIRT";
    return "GRASS";
  }

  /** Subtle large-scale rolling so the isometric ground isn't dead flat. */
  private rollElevation(x: number, y: number): number {
    return Math.max(0, Math.min(0.22,
      0.05 + Math.sin(x * 0.55) * Math.cos(y * 0.5) * 0.09 + Math.sin((x + y) * 0.37) * 0.05
    ));
  }

  at(x: number, y: number): Tile | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.tiles[y][x];
  }

  isWalkable(x: number, y: number): boolean {
    const t = this.at(x, y);
    if (!t) return false;
    if (!t.walkable) return false;
    // Cannot walk over a blocking occupant (buildings/monsters) — resources are
    // approached then harvested, and the player may walk up to them (v. 2).
    if (t.occupant !== "NONE") return false;
    return true;
  }

  setOccupant(x: number, y: number, occupant: Occupant, id: string | null) {
    const t = this.at(x, y);
    if (!t) return;
    t.occupant = occupant;
    t.occupantId = id;
    if (occupant !== "NONE") t.walkable = false;
  }

  clearOccupant(x: number, y: number) {
    const t = this.at(x, y);
    if (!t) return;
    t.occupant = "NONE";
    t.occupantId = null;
    // restore walkability based on terrain
    t.walkable = t.terrainType !== "WATER" && t.terrainType !== "ROCK";
  }

  isRegionUnlocked(x: number, y: number): boolean {
    const cols = Math.max(1, Math.ceil(this.width / GRID_CHUNK));
    const r = Math.floor(y / GRID_CHUNK), c = Math.floor(x / GRID_CHUNK);
    return Boolean(this.regionUnlocked?.[r]?.[c]);
  }
}

function isCoast(x: number, y: number, w: number, h: number): boolean {
  const nearEdge = x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2;
  const rnd = mulberry32(x * 31 + y * 57 + 2401);
  return nearEdge && rnd() < 0.5;
}