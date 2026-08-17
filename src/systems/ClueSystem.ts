// Clue scroll hunts: read a scroll, walk to each marked tile, dig, claim the prize.
//
// One hunt at a time. Inventory stacks hold only an id and a count, so a scroll
// cannot carry which-tile-and-which-step on itself — reading it consumes the scroll
// and writes the hunt onto the player instead. That also keeps the map to a single
// marker, which is the difference between a treasure hunt and a to-do list.
import type { GameState } from "../state/GameState";
import type { Grid } from "../world/Grid";
import { addItem, countItem, removeItem } from "../components/Inventory";
import { ITEMS } from "../data/Items";
import {
  CLUE_TIERS, CLUE_TIER_LIST, chooseSites, clueTierForItem, hintFor,
  type ActiveClue, type ClueTierDef,
} from "../data/Clues";

export type ReadFailure = "not_a_clue" | "none_carried" | "already_active" | "no_sites";
export type DigFailure = "no_clue" | "wrong_tile";

export interface ClueReward {
  coins: number;
  items: { itemId: string; amount: number }[];
  unique: string | null;
}

/** Read-only view for the Quests panel. */
export interface ClueSnapshot {
  active: {
    tier: string;
    name: string;
    step: number;
    total: number;
    hint: string;
    site: { x: number; y: number };
  } | null;
  /** Scrolls carried, with whether one can be read right now. */
  carried: { itemId: string; name: string; qty: number }[];
  completed: number;
}

export class ClueSystem {
  private state: GameState;
  private grid: Grid;

  constructor(state: GameState, grid: Grid) {
    this.state = state;
    this.grid = grid;
  }

  get active(): ActiveClue | null { return this.state.player.clue; }

  /** The tile the player should be digging, or null when no hunt is running. */
  currentSite(): { x: number; y: number } | null {
    const c = this.active;
    if (!c) return null;
    return c.sites[c.step] ?? null;
  }

  /**
   * A tile can hold a dig site if you can stand on it and it is not town centre.
   * Digging up the market square would be a poor clue.
   */
  private candidate = (x: number, y: number): boolean => {
    const t = this.grid.at(x, y);
    if (!t) return false;
    return this.grid.isWalkable(x, y) && t.zoneId !== "TOWN_CENTER";
  };

  read(itemId: string): { ok: true; hint: string } | { ok: false; reason: ReadFailure } {
    const def = clueTierForItem(itemId);
    if (!def) return { ok: false, reason: "not_a_clue" };
    if (this.active) return { ok: false, reason: "already_active" };
    if (countItem(this.state.player.inventory, itemId) < 1) return { ok: false, reason: "none_carried" };

    // Seed from the clock so two scrolls of a tier do not send you to the same
    // holes, but store it so the hunt is reproducible from the save.
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const sites = chooseSites(def, seed, this.grid.width, this.candidate);
    if (sites.length < def.steps) return { ok: false, reason: "no_sites" };

    removeItem(this.state.player.inventory, itemId, 1);
    this.state.player.clue = { tier: def.tier, seed, step: 0, sites };
    return { ok: true, hint: this.hint()! };
  }

  /** Hint for the current step. */
  hint(): string | null {
    const site = this.currentSite();
    if (!site) return null;
    const tile = this.grid.at(site.x, site.y);
    return hintFor(site, this.grid.width, tile?.biome ?? null);
  }

  /** Is this the tile the player must dig right now? */
  isDigTile(x: number, y: number): boolean {
    const s = this.currentSite();
    return !!s && s.x === x && s.y === y;
  }

  /**
   * Dig at a tile. Advances the hunt, or finishes it and pays out.
   *
   * The reward is only rolled here, never on read — a save scummer who reloads
   * before the last dig gets a different roll, which is the same deal every drop
   * table in the game offers.
   */
  dig(x: number, y: number):
    | { ok: true; done: false; hint: string; step: number; total: number }
    | { ok: true; done: true; reward: ClueReward }
    | { ok: false; reason: DigFailure } {
    const c = this.active;
    if (!c) return { ok: false, reason: "no_clue" };
    if (!this.isDigTile(x, y)) return { ok: false, reason: "wrong_tile" };

    const def = CLUE_TIERS[c.tier];
    c.step += 1;
    if (c.step < c.sites.length) {
      return { ok: true, done: false, hint: this.hint()!, step: c.step, total: c.sites.length };
    }

    this.state.player.clue = null;
    const counters = this.state.player.meta.counters;
    counters.clues_done = (counters.clues_done ?? 0) + 1;
    return { ok: true, done: true, reward: this.payout(def) };
  }

  /** Abandon the hunt. The scroll is gone — it was read. */
  abandon(): boolean {
    if (!this.active) return false;
    this.state.player.clue = null;
    return true;
  }

  private payout(def: ClueTierDef): ClueReward {
    const inv = this.state.player.inventory;
    const roll = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

    const coins = roll(def.coins.min, def.coins.max);
    addItem(inv, "coins", coins);

    const items: { itemId: string; amount: number }[] = [];
    for (const l of def.loot) {
      const amount = roll(l.min, l.max);
      // addItem clamps to the storage cap, so report what actually landed.
      const stored = addItem(inv, l.itemId, amount);
      if (stored > 0) {
        items.push({ itemId: l.itemId, amount: stored });
        this.state.collectionLog.add(l.itemId);
      }
    }

    let unique: string | null = null;
    if (Math.random() < def.unique.chance) {
      // Uniques are non-stacking gear and MISC-exempt, so they always fit.
      addItem(inv, def.unique.itemId, 1);
      this.state.collectionLog.add(def.unique.itemId);
      unique = def.unique.itemId;
    }
    return { coins, items, unique };
  }

  snapshot(): ClueSnapshot {
    const c = this.active;
    const site = this.currentSite();
    return {
      active: c && site
        ? {
            tier: c.tier,
            name: CLUE_TIERS[c.tier].name,
            step: c.step + 1,
            total: c.sites.length,
            hint: this.hint() ?? "",
            site,
          }
        : null,
      carried: CLUE_TIER_LIST
        .map((t) => ({ itemId: t.itemId, name: ITEMS[t.itemId]?.name ?? t.name, qty: countItem(this.state.player.inventory, t.itemId) }))
        .filter((r) => r.qty > 0),
      completed: this.state.player.meta.counters.clues_done ?? 0,
    };
  }
}
