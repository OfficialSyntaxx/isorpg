// CraftingSystem: the active artisan loop for Cooking / Smithing / Carpentry —
// tick-based like gathering, with item mastery (preserve chance + speed) per
// GDD §5.A. Building-gated recipes (Smithing/Carpentry) check hasBuilding().
import type { GameState } from "../state/GameState";
import type { CraftRecipe } from "../data/Recipes";
import { addItem, isBulk, removeItem, countItem, storedAmount } from "../components/Inventory";
import { addMasteryXp, masteryLevel } from "../components/Skills";
import { levelFromXp } from "../data/XPTable";
import { TICK_MS } from "../core/Engine";
import type { BuildingType } from "../data/Buildings";

export interface CraftEvent {
  recipe: CraftRecipe;
  amount: number;
  xpGained: number;
  preserved: boolean;
  burned: boolean;
}

export type CraftEndReason = "stopped" | "level_shortfall" | "missing_materials" | "missing_building" | "inventory_full";

export interface CraftCallbacks {
  onCraft?: (e: CraftEvent) => void;
  onStart?: (r: CraftRecipe) => void;
  onEnd?: (r: CraftRecipe | null, reason: CraftEndReason) => void;
}

export class CraftingSystem {
  private state: GameState;
  private hasBuilding: (type: BuildingType) => boolean;
  private cb: CraftCallbacks = {};
  private active: CraftRecipe | null = null;
  private tickAcc = 0;
  private ticksNeeded = 0;

  constructor(state: GameState, hasBuilding: (type: BuildingType) => boolean) {
    this.state = state;
    this.hasBuilding = hasBuilding;
  }

  setCallbacks(cb: CraftCallbacks) { this.cb = cb; }
  get activeRecipe() { return this.active; }
  get hasActive() { return this.active !== null; }
  get progress() {
    if (!this.active) return 0;
    return Math.min(1, this.tickAcc / (this.ticksNeeded * TICK_MS));
  }

  /** Why `recipe` can't run right now, or null if it's ready. */
  canStart(recipe: CraftRecipe): CraftEndReason | null {
    const lvl = levelFromXp(this.state.player.skills[recipe.skill].xp);
    if (lvl < recipe.levelReq) return "level_shortfall";
    if (recipe.requiresBuilding && !this.hasBuilding(recipe.requiresBuilding)) return "missing_building";
    for (const inp of recipe.inputs) {
      if (countItem(this.state.player.inventory, inp.itemId) < inp.qty) return "missing_materials";
    }
    return null;
  }

  start(recipe: CraftRecipe): boolean {
    const reason = this.canStart(recipe);
    if (reason) { this.cb.onEnd?.(recipe, reason); return false; }
    this.active = recipe;
    this.tickAcc = 0;
    this.ticksNeeded = this.actionTicks(recipe);
    this.cb.onStart?.(recipe);
    return true;
  }

  stop(reason: CraftEndReason = "stopped") {
    const r = this.active;
    this.active = null;
    if (r) this.cb.onEnd?.(r, reason);
  }

  private actionTicks(recipe: CraftRecipe): number {
    const m = this.masteryLevelFor(recipe);
    const frac = Math.min(1, m / 99);
    const floor = Math.max(2, Math.ceil(recipe.ticks * 0.6));
    let ticks = Math.max(floor, Math.round(recipe.ticks * (1 - frac * 0.33)));
    // P3.4: a built Campfire makes cooking 25% faster.
    if (recipe.skill === "cooking" && this.hasBuilding("CAMPFIRE")) {
      ticks = Math.max(2, Math.round(ticks * 0.75));
    }
    return ticks;
  }

  private masteryLevelFor(recipe: CraftRecipe): number {
    const xp = this.state.player.skills[recipe.skill].mastery[recipe.id] || 0;
    return masteryLevel(xp);
  }

  tick(dtMs: number) {
    if (!this.active) return;
    this.tickAcc += dtMs;
    if (this.tickAcc < this.ticksNeeded * TICK_MS) return;
    this.tickAcc = 0;
    this.performCraft(this.active);
  }

  private performCraft(recipe: CraftRecipe) {
    const reason = this.canStart(recipe);
    if (reason) { this.stop(reason); return; }
    const inv = this.state.player.inventory;

    const mLvl = this.masteryLevelFor(recipe);
    const preserveChance = Math.min(0.15, (mLvl / 99) * 0.15);
    const preserved = Math.random() < preserveChance;

    let burned = false;
    if (recipe.burnable) {
      const lvl = levelFromXp(this.state.player.skills[recipe.skill].xp);
      const margin = Math.max(0, lvl - recipe.levelReq);
      burned = Math.random() < Math.max(0, 0.35 - margin * 0.02 - (mLvl / 99) * 0.1);
    }

    if (!preserved) {
      for (const inp of recipe.inputs) removeItem(inv, inp.itemId, inp.qty);
    }

    let xpGained: number;
    let amount = 0;
    if (!burned) {
      const out = recipe.output.itemId;
      if (isBulk(out) && storedAmount(inv) + recipe.output.qty > inv.storageCap) { this.stop("inventory_full"); return; }
      addItem(inv, recipe.output.itemId, recipe.output.qty);
      amount = recipe.output.qty;
      xpGained = recipe.xp;
      this.state.collectionLog.add(recipe.output.itemId);
    } else {
      xpGained = Math.round(recipe.xp * 0.2);
    }
    this.state.player.skills[recipe.skill].xp += xpGained;
    addMasteryXp(this.state.player.skills, recipe.skill, recipe.id, Math.max(1, recipe.output.qty) * 4);

    this.cb.onCraft?.({ recipe, amount, xpGained, preserved, burned });

    // Loop: keep crafting the same recipe while materials/level allow.
    const next = this.canStart(recipe);
    if (next) this.stop(next);
  }
}
