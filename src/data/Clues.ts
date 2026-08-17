// Clue scrolls: a multi-step treasure hunt across the map.
//
// A clue is a *hunt*, not an item with hidden fields. Inventory stacks carry only
// an id and a count, so per-scroll state (which tile, which step) could never live
// on the item — it lives on the player as one active hunt, and reading a scroll
// consumes it to start that hunt. One at a time, which also keeps the map legible.
//
// Dig sites are derived from a seed with the same mulberry32 the world uses, so a
// given hunt is reproducible: the same seed always names the same tiles, and a save
// round-trip cannot move the target out from under the player.
//
// Rewards deliberately fill the **offhand** equip slot. It has been a declared slot
// with zero items in it since equipment shipped, so every clue unique is the first
// thing a player can put there.
import type { Biome } from "../world/Grid";

export type ClueTier = "simple" | "hard";

export interface ClueTierDef {
  tier: ClueTier;
  /** Scroll item that starts this hunt. */
  itemId: string;
  name: string;
  /** How many dig sites before the reward. */
  steps: number;
  /** Ring band the sites are drawn from — harder clues send you further out. */
  minRing: number;
  maxRing: number;
  /** Coins paid on completion, inclusive range. */
  coins: { min: number; max: number };
  /** Guaranteed materials, rolled once each. */
  loot: { itemId: string; min: number; max: number }[];
  /** The prize. `chance` 1 = always. */
  unique: { itemId: string; chance: number };
}

export const CLUE_TIERS: Record<ClueTier, ClueTierDef> = {
  simple: {
    tier: "simple",
    itemId: "clue_simple",
    name: "Simple Clue Scroll",
    steps: 2,
    minRing: 1,
    maxRing: 2,
    coins: { min: 150, max: 400 },
    loot: [
      { itemId: "iron_ore", min: 3, max: 8 },
      { itemId: "plank", min: 2, max: 6 },
    ],
    unique: { itemId: "wayfarers_lantern", chance: 0.25 },
  },
  hard: {
    tier: "hard",
    itemId: "clue_hard",
    name: "Hard Clue Scroll",
    steps: 3,
    minRing: 2,
    maxRing: 3,
    coins: { min: 600, max: 1400 },
    loot: [
      { itemId: "steel_bar", min: 2, max: 5 },
      { itemId: "coal", min: 5, max: 12 },
      { itemId: "cooked_trout", min: 2, max: 4 },
    ],
    unique: { itemId: "cartographers_tome", chance: 0.4 },
  },
};

export const CLUE_TIER_LIST: ClueTierDef[] = [CLUE_TIERS.simple, CLUE_TIERS.hard];

/** Which tier a scroll item starts, if any. */
export function clueTierForItem(itemId: string): ClueTierDef | undefined {
  return CLUE_TIER_LIST.find((t) => t.itemId === itemId);
}

/** An active hunt. Persisted; `seed` makes the site list reproducible. */
export interface ActiveClue {
  tier: ClueTier;
  seed: number;
  /** 0-based index of the site being searched. */
  step: number;
  /** All sites for this hunt, resolved when the hunt started. */
  sites: { x: number; y: number }[];
}

/**
 * The world's PRNG, duplicated deliberately.
 *
 * Grid keeps its copy private, and this file must not import the world just to
 * generate a number. What is shared is the algorithm, not the module, so either
 * can change without silently reshaping the other.
 */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick the dig sites for a hunt.
 *
 * `candidate` decides whether a tile is allowed — the caller supplies it, so this
 * stays free of world imports and testable without a Grid. Sites are distinct and
 * spread apart; if the filter is too strict to find enough, the hunt comes back
 * shorter rather than looping forever.
 */
export function chooseSites(
  def: ClueTierDef,
  seed: number,
  size: number,
  candidate: (x: number, y: number) => boolean
): { x: number; y: number }[] {
  const rnd = mulberry32(seed);
  const centre = Math.floor(size / 2);
  const chunk = Math.max(1, Math.floor(size / 7)); // matches the world's ring bands
  const sites: { x: number; y: number }[] = [];
  const MIN_APART = 4;

  for (let attempt = 0; attempt < 6000 && sites.length < def.steps; attempt++) {
    const ring = def.minRing + Math.floor(rnd() * (def.maxRing - def.minRing + 1));
    // A ring is a square band around the town: pick a radius inside it, then a
    // point on one of the four sides.
    const r = ring * chunk - Math.floor(rnd() * chunk);
    const along = Math.floor(rnd() * (2 * r + 1)) - r;
    const side = Math.floor(rnd() * 4);
    const x = centre + (side === 0 || side === 1 ? along : side === 2 ? -r : r);
    const y = centre + (side === 0 ? -r : side === 1 ? r : along);
    if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
    if (!candidate(x, y)) continue;
    if (sites.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) < MIN_APART)) continue;
    sites.push({ x, y });
  }
  return sites;
}

/**
 * The hint the player reads. Deliberately a direction and a landmark rather than
 * coordinates — the map marker already gives the exact tile, so the text should
 * read like a clue instead of repeating it.
 */
export function hintFor(site: { x: number; y: number }, size: number, biome: Biome | null): string {
  const centre = Math.floor(size / 2);
  const dx = site.x - centre;
  const dy = site.y - centre;
  const ns = dy < -2 ? "north" : dy > 2 ? "south" : "";
  const ew = dx > 2 ? "east" : dx < -2 ? "west" : "";
  const dir = `${ns}${ns && ew ? "-" : ""}${ew}`;
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const far = dist > size / 3 ? "far out in" : dist > size / 5 ? "well into" : "just outside";
  const where = dir ? `${far} the ${dir} reaches` : "in the heart of the settlement";
  const ground: Record<Biome, string> = {
    MEADOW: "where the grass grows even",
    FOREST: "beneath the close-standing trees",
    SNOW: "where the ground stays hard and cold",
    SWAMP: "on the soft, wet ground",
  };
  const soil = biome ? `, ${ground[biome]}` : "";
  return `Dig ${where}${soil}.`;
}
