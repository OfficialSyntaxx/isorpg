// Farming: seeds, grow times, and what each bed yields.
//
// Farming is the one skill that advances on wall-clock time rather than on
// actions, which makes it the natural fit for a game built around offline
// progress: a crop planted before you close the tab is ready when you come back.
// Growth is therefore stored as a plant timestamp, not as accumulated ticks —
// see FarmSystem — so it needs no catch-up pass and cannot drift.
//
// Each seed closes a loop rather than adding a dead-end item: potatoes feed
// Cooking, cabbages feed Cooking at a higher tier, and redberries make the
// Combat Tonic craftable, which until now could only be bought.
import type { SkillId } from "./Skills";

export interface SeedDef {
  /** Inventory item planted. */
  id: string;
  name: string;
  /** Farming level to plant it. */
  levelReq: number;
  /** Real time from planting to ripe, in ms. */
  growMs: number;
  /** What a ripe bed gives, and how much. */
  produce: { itemId: string; min: number; max: number };
  /** Farming XP for a successful harvest. */
  xp: number;
  /** Mastery key — farming mastery is tracked per crop. */
  masteryKey: string;
}


/** Beds a settlement has: one per Farm Plot *level* (see BuildSystem.levels). */
export const SEEDS: Record<string, SeedDef> = {
  potato_seed: {
    id: "potato_seed", name: "Potato Seed", levelReq: 1,
    growMs: 5 * 60_000,
    produce: { itemId: "potato", min: 2, max: 4 },
    xp: 35, masteryKey: "potato",
  },
  cabbage_seed: {
    id: "cabbage_seed", name: "Cabbage Seed", levelReq: 12,
    growMs: 12 * 60_000,
    produce: { itemId: "cabbage", min: 2, max: 3 },
    xp: 90, masteryKey: "cabbage",
  },
  redberry_seed: {
    id: "redberry_seed", name: "Redberry Seed", levelReq: 30,
    growMs: 30 * 60_000,
    produce: { itemId: "redberry", min: 3, max: 6 },
    xp: 220, masteryKey: "redberry",
  },
};

export const SEED_IDS: string[] = Object.keys(SEEDS);

/** A planted bed. `plantedAt` is epoch ms, so growth survives a reload. */
export interface FarmPlot {
  seedId: string;
  plantedAt: number;
}

/** 0..1 through the grow time. 1 = ripe. */
export function growthAt(plot: FarmPlot, now: number): number {
  const def = SEEDS[plot.seedId];
  if (!def || def.growMs <= 0) return 1;
  return Math.max(0, Math.min(1, (now - plot.plantedAt) / def.growMs));
}

export function isRipe(plot: FarmPlot, now: number): boolean {
  return growthAt(plot, now) >= 1;
}

/** "4m left" / "Ripe" — for the Village panel. */
export function growthLabel(plot: FarmPlot, now: number): string {
  const def = SEEDS[plot.seedId];
  if (!def) return "—";
  const leftMs = def.growMs - (now - plot.plantedAt);
  if (leftMs <= 0) return "Ripe";
  const mins = Math.ceil(leftMs / 60_000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m left` : `${mins}m left`;
}
