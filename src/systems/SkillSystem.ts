// SkillSystem: the gathering loop for woodcutting / mining / fishing, XP &
// item mastery, and weighted drop rolls (GDD §5.A/D).
import type { GameState } from "../state/GameState";
import type { ResourceNode } from "../world/ResourceNode";
import type { ResourceDef, SkillId } from "../data/Skills";
import { addItem, isBulk, storedAmount } from "../components/Inventory";
import { addMasteryXp, masteryLevel } from "../components/Skills";
import { levelFromXp } from "../data/XPTable";
import { TICK_MS } from "../core/Engine";
import { ITEMS } from "../data/Items";
import { getBestTool, getToolTier } from "../data/Items";

export interface GatherEvent {
  node: ResourceNode;
  itemId: string;
  amount: number;
  xpGained: number;
  masteryGained: number;
  doubled: boolean;
}

export type ActionEndReason = "done" | "interrupted" | "level_shortfall" | "tool_shortfall" | "inventory_full";

export interface SkillCallbacks {
  onGather?: (e: GatherEvent) => void;
  onActionStart?: (node: ResourceNode) => void;
  onActionEnd?: (node: ResourceNode, reason: ActionEndReason) => void;
}

export class SkillSystem {
  private state: GameState;
  private consumeNode: (node: ResourceNode) => number;
  private cb: SkillCallbacks = {};
  private active: ResourceNode | null = null;
  private tickAcc = 0;
  private ticksNeeded = 0;
  private levelShortfall = false;

  constructor(state: GameState, consumeNode: (node: ResourceNode) => number) {
    this.state = state;
    this.consumeNode = consumeNode;
  }

  setCallbacks(cb: SkillCallbacks) { this.cb = cb; }

  get activeNode() { return this.active; }
  get hasActive() { return this.active !== null; }
  get progress() {
    if (!this.active) return 0;
    return Math.min(1, this.tickAcc / (this.ticksNeeded * TICK_MS));
  }
  get isLevelShortfall() { return this.levelShortfall; }

  /** Begin gathering at `node` once the player stands in range. */
  startGathering(node: ResourceNode): boolean {
    const def = node.def;
    const lvl = levelFromXp(this.state.player.skills[def.skill].xp);
    if (lvl < def.levelReq) {
      this.levelShortfall = true;
      this.cb.onActionEnd?.(node, "level_shortfall");
      return false;
    }
    // P2: tool tier gating — higher-tier nodes need a better tool.
    const needTier = def.toolTier ?? 1;
    if (getToolTier(this.state.player.inventory, def.skill) < needTier) {
      this.levelShortfall = false;
      this.cb.onActionEnd?.(node, "tool_shortfall");
      return false;
    }
    this.levelShortfall = false;
    this.active = node;
    this.tickAcc = 0;
    this.ticksNeeded = this.actionTicks(def);
    this.cb.onActionStart?.(node);
    return true;
  }

  get requiredLevel(): number {
    return this.active ? this.active.def.levelReq : 1;
  }

  /**
   * Action duration (ticks) — faster with mastery AND a better tool.
   *
   * Mastery is looked up for THIS resource, mirroring CraftingSystem. It used to
   * sum every mastery in the skill, so chopping normal logs sped up willow you
   * had never touched, and the summed total inflated the level well past any one
   * resource's real mastery.
   */
  private actionTicks(def: ResourceDef): number {
    const base = def.ticksPerAction;
    const m = masteryLevel(this.state.player.skills[def.skill].mastery[def.masteryKey] || 0);
    const frac = Math.min(1, m / 99);
    const floor = Math.max(4, Math.ceil(base * 0.6));
    const tool = getBestTool(this.state.player.inventory, def.skill);
    const speed = tool?.speedPct ?? 0;
    return Math.max(floor, Math.round(base * (1 - frac * 0.33) * (1 - speed / 100)));
  }

  /** P2.3: early-game XP momentum — +50% at level 1, tapering to +0% by 16. */
  private earlyBonus(skill: SkillId): number {
    const lvl = levelFromXp(this.state.player.skills[skill].xp);
    if (lvl >= 16) return 1;
    return 1 + 0.5 * (1 - (lvl - 1) / 15);
  }

  tick(dtMs: number): void {
    if (!this.active) return;
    this.tickAcc += dtMs;
    if (this.tickAcc < this.ticksNeeded * TICK_MS) return;
    this.tickAcc = 0;
    this.performGather(this.active);
  }

  private performGather(node: ResourceNode) {
    const def = node.def;
    const skill = def.skill;
    const sk = this.state.player.skills;

    const mLevel = masteryLevel(sk[skill].mastery[def.masteryKey] || 0);
    const doubleChance = Math.min(0.2, (mLevel / 99) * 0.2);
    const doubled = Math.random() < doubleChance;

    const itemId = rollDrop(def);
    if (!itemId) { this.stopGathering(node, "done"); return; }

    let amount = def.yield;
    if (doubled) amount *= 2;

    const inv = this.state.player.inventory;
    if (isBulk(itemId) && storedAmount(inv) + amount > inv.storageCap) {
      this.stopGathering(node, "inventory_full");
      return;
    }

    addItem(inv, itemId, amount);

    const baseXp = ITEMS[itemId]?.xp?.[skill] ?? 5;
    // P2.3: early-game momentum — up to +50% XP below level 16, tapering to 0
    // by level 16 so the 1→15 band feels snappy while the OSRS curve holds.
    const xpGained = Math.round(baseXp * (doubled ? 2 : 1) * this.earlyBonus(skill));
    const masteryGained = def.yield;
    sk[skill].xp += xpGained;
    addMasteryXp(sk, skill, def.masteryKey, masteryGained);

    this.state.collectionLog.add(itemId);
    this.cb.onGather?.({ node, itemId, amount, xpGained, masteryGained, doubled });

    const remaining = this.consumeNode(node);
    if (remaining === 0) this.stopGathering(node, "done");
  }

  stopGathering(node: ResourceNode, reason: "done" | "interrupted" | "inventory_full") {
    if (this.active === node) this.active = null;
    this.cb.onActionEnd?.(node, reason);
  }

  interrupt() {
    if (this.active) this.stopGathering(this.active, "interrupted");
  }
}


function rollDrop(def: { drops: { itemId: string; weight: number; min: number; max: number }[] }): string | null {
  if (!def.drops.length) return null;
  const total = def.drops.reduce((a, d) => a + d.weight, 0);
  let r = Math.random() * total;
  for (const d of def.drops) {
    r -= d.weight;
    if (r <= 0) return d.itemId;
  }
  return def.drops[0].itemId;
}