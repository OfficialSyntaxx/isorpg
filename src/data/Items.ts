// Static item database. All items are data-only; visuals are procedural.

export type ItemType =
  | "LOG"
  | "ORE"
  | "BAR"
  | "FOOD"
  | "FISH"
  | "SEED"
  | "GEM"
  | "TOOL"
  | "MATERIAL"
  | "MISC";

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  // Gather XP granted per successful action for each relevant skill
  xp?: Partial<Record<SkillId, number>>;
  // Required skill level to obtain/craft
  levelReq?: Partial<Record<SkillId, number>>;
  // NPC sell value per unit
  value: number;
  // Small blurb shown in inventory
  desc: string;
  stack: boolean;
}

import type { SkillId } from "./Skills";

export const ITEMS: Record<string, Item> = {
  // ——— Woodcutting ———
  normal_log: { id: "normal_log", name: "Logs", type: "LOG", xp: { woodcutting: 25 }, value: 4, desc: "A sturdy cut of ordinary wood.", stack: true },
  oak_log: { id: "oak_log", name: "Oak Logs", type: "LOG", xp: { woodcutting: 37.5 }, levelReq: { woodcutting: 15 }, value: 10, desc: "Heavier, denser oak timber.", stack: true },
  willow_log: { id: "willow_log", name: "Willow Logs", type: "LOG", xp: { woodcutting: 67.5 }, levelReq: { woodcutting: 30 }, value: 20, desc: "Flexible willow, prized by carpenters.", stack: true },

  // ——— Mining ———
  copper_ore: { id: "copper_ore", name: "Copper Ore", type: "ORE", xp: { mining: 17.5 }, value: 5, desc: "Soft, orange-gold ore.", stack: true },
  tin_ore: { id: "tin_ore", name: "Tin Ore", type: "ORE", xp: { mining: 17.5 }, value: 5, desc: "Bright silver ore.", stack: true },
  iron_ore: { id: "iron_ore", name: "Iron Ore", type: "ORE", xp: { mining: 35 }, levelReq: { mining: 15 }, value: 17, desc: "Dense grey ore, ready to smelt.", stack: true },
  coal: { id: "coal", name: "Coal", type: "ORE", xp: { mining: 50 }, levelReq: { mining: 30 }, value: 33, desc: "Black, glossy fuel for the smelter.", stack: true },

  // ——— Fishing ———
  raw_shrimp: { id: "raw_shrimp", name: "Raw Shrimp", type: "FISH", xp: { fishing: 10 }, value: 5, desc: "A fresh little shrimp.", stack: true },
  raw_trout: { id: "raw_trout", name: "Raw Trout", type: "FISH", xp: { fishing: 50 }, levelReq: { fishing: 20 }, value: 15, desc: "A lively spotted trout.", stack: true },

  // ——— Tools ——— (starter gear handed to new heroes)
  bronze_axe: { id: "bronze_axe", name: "Bronze Axe", type: "TOOL", value: 1, desc: "A starter woodcutting axe.", stack: false },
  bronze_pickaxe: { id: "bronze_pickaxe", name: "Bronze Pickaxe", type: "TOOL", value: 1, desc: "A starter mining pickaxe.", stack: false },
  small_net: { id: "small_net", name: "Small Fishing Net", type: "TOOL", value: 1, desc: "Catches shrimp in open water.", stack: false },
};

export function getItem(id: string): Item {
  const it = ITEMS[id];
  if (!it) throw new Error(`Unknown item: ${id}`);
  return it;
}