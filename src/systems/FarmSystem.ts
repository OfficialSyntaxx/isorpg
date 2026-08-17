// Farming: sow a seed into a Farm Plot bed, come back when it is ripe.
//
// Crops grow on **wall-clock time**, stored as a plant timestamp. That is the
// whole design: there is no tick loop to run, no catch-up pass on load, and no
// way for growth to drift out of step with the save — a bed sown before you close
// the tab is simply ripe when `Date.now()` says it is. Every other production
// system in the game needed an explicit offline calculation; this one gets it for
// free, which is also why it cannot be double-paid the way offline gathering was.
//
// Bed count comes from Farm Plot *levels*, matching every other passive effect
// (see BuildSystem.levels), so upgrading a plot adds beds.
import type { GameState } from "../state/GameState";
import { addItem, countItem, removeItem, isBulk, storedAmount } from "../components/Inventory";
import { addMasteryXp, masteryLevel } from "../components/Skills";
import { levelFromXp } from "../data/XPTable";
import { SEEDS, SEED_IDS, growthAt, growthLabel, isRipe, type FarmPlot, type SeedDef } from "../data/Farming";
import { ITEMS } from "../data/Items";

export type PlantFailure =
  | "no_bed"        // every bed is occupied
  | "no_seed"       // none of that seed carried
  | "level"         // farming level too low
  | "unknown_seed";

export type HarvestFailure = "empty" | "unripe" | "inventory_full";

/** One bed as the UI sees it. */
export interface FarmBedRow {
  index: number;
  seedId: string | null;
  name: string;
  icon: string;
  /** 0..1; 1 = ripe. */
  growth: number;
  label: string;
  ripe: boolean;
}

export interface FarmSnapshot {
  beds: FarmBedRow[];
  /** Seeds the player carries, with whether they can be sown right now. */
  seeds: { id: string; name: string; qty: number; levelReq: number; unlocked: boolean }[];
  level: number;
  /** 0 when no Farm Plot is built — the panel explains rather than showing nothing. */
  bedCount: number;
}

export class FarmSystem {
  private state: GameState;
  /** Beds available = total Farm Plot levels. Injected so BuildSystem stays the
   *  single authority on what the settlement has. */
  private bedProvider: () => number;

  constructor(state: GameState, bedProvider: () => number) {
    this.state = state;
    this.bedProvider = bedProvider;
  }

  get bedCount(): number { return Math.max(0, this.bedProvider()); }

  private get plots(): (FarmPlot | null)[] { return this.state.town.farm.plots; }

  /** Farming level from XP. */
  get level(): number { return levelFromXp(this.state.player.skills.farming.xp); }

  /**
   * Trim or extend the bed array to match the buildings.
   *
   * Beds are addressed by index, so the array has to track the building count —
   * but shrinking it must not silently bin a growing crop, so only empty trailing
   * beds are removed.
   */
  private sync(): void {
    const want = this.bedCount;
    const p = this.plots;
    while (p.length < want) p.push(null);
    while (p.length > want && p[p.length - 1] === null) p.pop();
  }

  /** Index of the first free bed, or -1. */
  private freeBed(): number {
    this.sync();
    return this.plots.findIndex((b) => b === null);
  }

  plant(seedId: string): { ok: true; bed: number } | { ok: false; reason: PlantFailure } {
    const def: SeedDef | undefined = SEEDS[seedId];
    if (!def) return { ok: false, reason: "unknown_seed" };
    if (this.level < def.levelReq) return { ok: false, reason: "level" };
    if (countItem(this.state.player.inventory, seedId) < 1) return { ok: false, reason: "no_seed" };
    const bed = this.freeBed();
    if (bed < 0) return { ok: false, reason: "no_bed" };
    removeItem(this.state.player.inventory, seedId, 1);
    this.plots[bed] = { seedId, plantedAt: Date.now() };
    return { ok: true, bed };
  }

  harvest(bed: number): { ok: true; itemId: string; amount: number; xp: number } | { ok: false; reason: HarvestFailure } {
    this.sync();
    const plot = this.plots[bed];
    if (!plot) return { ok: false, reason: "empty" };
    const now = Date.now();
    if (!isRipe(plot, now)) return { ok: false, reason: "unripe" };
    const def = SEEDS[plot.seedId];
    if (!def) { this.plots[bed] = null; return { ok: false, reason: "empty" }; }

    const inv = this.state.player.inventory;
    // Mastery raises the yield FLOOR rather than adding a separate bonus roll: at
    // mastery 1 the harvest spans the crop's full range, at 99 it is always the
    // maximum. One knob, and the range in the wiki stays literally true.
    const m = masteryLevel(this.state.player.skills.farming.mastery[def.masteryKey] || 0);
    const span = def.produce.max - def.produce.min;
    const lo = def.produce.min + Math.floor(span * ((m - 1) / 98));
    const yielded = lo + Math.floor(Math.random() * (def.produce.max - lo + 1));

    if (isBulk(def.produce.itemId) && storedAmount(inv) + yielded > inv.storageCap) {
      return { ok: false, reason: "inventory_full" };
    }

    this.plots[bed] = null;
    addItem(inv, def.produce.itemId, yielded);
    this.state.player.skills.farming.xp += def.xp;
    addMasteryXp(this.state.player.skills, "farming", def.masteryKey, yielded);
    this.state.collectionLog.add(def.produce.itemId);
    return { ok: true, itemId: def.produce.itemId, amount: yielded, xp: def.xp };
  }

  /** Harvest every ripe bed. Returns what was gathered, for one summary toast. */
  harvestAll(): { itemId: string; amount: number }[] {
    this.sync();
    const got: { itemId: string; amount: number }[] = [];
    for (let i = 0; i < this.plots.length; i++) {
      const r = this.harvest(i);
      if (r.ok) {
        const prev = got.find((g) => g.itemId === r.itemId);
        if (prev) prev.amount += r.amount;
        else got.push({ itemId: r.itemId, amount: r.amount });
      }
    }
    return got;
  }

  /** How many beds are ready right now — drives the Village button's badge. */
  ripeCount(): number {
    const now = Date.now();
    this.sync();
    return this.plots.filter((p): p is FarmPlot => !!p && isRipe(p, now)).length;
  }

  snapshot(): FarmSnapshot {
    this.sync();
    const now = Date.now();
    const level = this.level;
    return {
      bedCount: this.bedCount,
      level,
      beds: this.plots.map((p, index) => {
        if (!p) return { index, seedId: null, name: "Empty bed", icon: "🟫", growth: 0, label: "Ready to sow", ripe: false };
        const def = SEEDS[p.seedId];
        return {
          index,
          seedId: p.seedId,
          name: def ? (ITEMS[def.produce.itemId]?.name ?? def.produce.itemId) : p.seedId,
          icon: def && isRipe(p, now) ? "🌾" : "🌱",
          growth: growthAt(p, now),
          label: growthLabel(p, now),
          ripe: isRipe(p, now),
        };
      }),
      seeds: SEED_IDS.map((id) => ({
        id,
        name: SEEDS[id].name,
        qty: countItem(this.state.player.inventory, id),
        levelReq: SEEDS[id].levelReq,
        unlocked: level >= SEEDS[id].levelReq,
      })).filter((s) => s.qty > 0 || s.unlocked),
    };
  }
}
