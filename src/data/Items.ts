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

  // ——— Combat drops / gear ———
  coins: { id: "coins", name: "Coins", type: "MISC", value: 1, desc: "Shiny cur fers the merchants accept.", stack: true },
  bones: { id: "bones", name: "Bones", type: "MISC", value: 2, desc: "Possibly worth burying.", stack: true },
  raw_rat_meat: { id: "raw_rat_meat", name: "Raw Rat Meat", type: "FOOD", xp: { cooking: 12 }, value: 4, desc: "Edible once cooked. Heals a little raw.", stack: true },
  cooked_shrimp: { id: "cooked_shrimp", name: "Cooked Shrimp", type: "FOOD", value: 12, desc: "A tasty cooked shrimp. Heals 6.", stack: true },
  shrimp_food: { id: "shrimp_food", name: "Cooked Shrimp", type: "FOOD", value: 12, desc: "A tasty cooked shrimp. Heals 6.", stack: true },
  bronze_dagger: { id: "bronze_dagger", name: "Bronze Dagger", type: "TOOL", value: 12, desc: "Fast but small. 3-tick attack.", stack: false },
  bronze_sword: { id: "bronze_sword", name: "Bronze Sword", type: "TOOL", value: 20, desc: "A solid starter sword. 4-tick attack.", stack: false },
  bronze_2h: { id: "bronze_2h", name: "Bronze 2H Sword", type: "TOOL", value: 30, desc: "Slow but heavy. 6-tick attack.", stack: false },
  iron_sword: { id: "iron_sword", name: "Iron Sword", type: "TOOL", value: 60, desc: "A sharp iron blade.", stack: false },
  shortbow: { id: "shortbow", name: "Shortbow", type: "TOOL", value: 25, desc: "A quick bow. 3-tick attack.", stack: false },
  goblin_key: { id: "goblin_key", name: "Goblin Key", type: "MISC", value: 5, desc: "Rusted and noisy.", stack: true },
  rat_bone: { id: "rat_bone", name: "Rat Bone (Triangular)", type: "MISC", value: 1, desc: "A curious irregular bone.", stack: true },
  loop_half_key: { id: "loop_half_key", name: "Loop Half of a Key", type: "MISC", value: 20, desc: "Half a mysterious key.", stack: true },
  zombie_flesh: { id: "zombie_flesh", name: "Zombie Flesh", type: "MISC", value: 3, desc: "Moves slightly on its own.", stack: true },

  // ——— Pets (ultra-rare cosmetic) ———
  pet_rat: { id: "pet_rat", name: "Tiny Rat", type: "MISC", value: 1, desc: "Unlocks a follower. 1/2500 per kill.", stack: true },
  pet_goblin: { id: "pet_goblin", name: "Eager Goblin", type: "MISC", value: 1, desc: "Unlocks a follower. 1/3333 per kill.", stack: true },
  pet_skeleton: { id: "pet_skeleton", name: "Bones Malone", type: "MISC", value: 1, desc: "Unlocks a follower. 1/4000 per kill.", stack: true },
  pet_zombie: { id: "pet_zombie", name: "Mortimer", type: "MISC", value: 1, desc: "Unlocks a follower. 1/5000 per kill.", stack: true },
};

export function getItem(id: string): Item {
  const it = ITEMS[id];
  if (!it) throw new Error(`Unknown item: ${id}`);
  return it;
}