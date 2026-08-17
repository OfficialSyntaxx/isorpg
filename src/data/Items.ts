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

/** Equip slots (P2 equipment system). Tools are NOT equipped — the best owned
 *  tool is used automatically per skill. */
export type EquipSlot = "weapon" | "offhand" | "head" | "body" | "legs";

export interface EquipDef {
  slot: EquipSlot;
  tier: number; // 1 bronze, 2 iron, 3 steel…
  bonus?: { attack?: number; strength?: number; defense?: number; maxHp?: number };
}

/** P2: gathering tool — used automatically from the inventory. */
export interface ToolDef {
  skill: import("./Skills").SkillId;
  tier: number;
  speedPct: number; // % faster gathering actions
}

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  // Gather XP granted per successful action for each relevant skill
  xp?: Partial<Record<import("./Skills").SkillId, number>>;
  // Required skill level to obtain/craft
  levelReq?: Partial<Record<import("./Skills").SkillId, number>>;
  // NPC sell value per unit
  value: number;
  // Small blurb shown in inventory
  desc: string;
  stack: boolean;
  /** P2 equipment: slot + tier + stat bonuses (weapons & armor). */
  equip?: EquipDef;
  /** P2 tool: which gathering skill it serves + tier + speed boost. */
  tool?: ToolDef;
}

import type { SkillId } from "./Skills";
import type { InventoryComponent } from "../components/Inventory";

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

  // ——— Smithing (bars) ———
  bronze_bar: { id: "bronze_bar", name: "Bronze Bar", type: "BAR", xp: { smithing: 30 }, value: 15, desc: "Smelted copper and tin.", stack: true },
  iron_bar: { id: "iron_bar", name: "Iron Bar", type: "BAR", xp: { smithing: 60 }, levelReq: { smithing: 20 }, value: 40, desc: "Smelted iron — hard and reliable.", stack: true },
  steel_bar: { id: "steel_bar", name: "Steel Bar", type: "BAR", xp: { smithing: 100 }, levelReq: { smithing: 30 }, value: 90, desc: "Iron forged with coal. The good stuff.", stack: true },

  // ——— Carpentry (planks) ———
  plank: { id: "plank", name: "Plank", type: "MATERIAL", xp: { carpentry: 20 }, value: 8, desc: "Sawn, seasoned timber — settlement building material.", stack: true },

  // ——— Tools ——— (starter gear handed to new heroes; used automatically)
  bronze_axe: { id: "bronze_axe", name: "Bronze Axe", type: "TOOL", value: 1, desc: "A starter woodcutting axe.", stack: false, tool: { skill: "woodcutting", tier: 1, speedPct: 0 } },
  iron_axe: { id: "iron_axe", name: "Iron Axe", type: "TOOL", value: 30, desc: "Cuts wood noticeably faster.", stack: false, tool: { skill: "woodcutting", tier: 2, speedPct: 15 } },
  steel_axe: { id: "steel_axe", name: "Steel Axe", type: "TOOL", value: 90, desc: "Bites deep — swift and true.", stack: false, tool: { skill: "woodcutting", tier: 3, speedPct: 30 } },
  bronze_pickaxe: { id: "bronze_pickaxe", name: "Bronze Pickaxe", type: "TOOL", value: 1, desc: "A starter mining pickaxe.", stack: false, tool: { skill: "mining", tier: 1, speedPct: 0 } },
  iron_pickaxe: { id: "iron_pickaxe", name: "Iron Pickaxe", type: "TOOL", value: 30, desc: "Cracks ore clean off the rock.", stack: false, tool: { skill: "mining", tier: 2, speedPct: 15 } },
  steel_pickaxe: { id: "steel_pickaxe", name: "Steel Pickaxe", type: "TOOL", value: 90, desc: "The miner's best friend.", stack: false, tool: { skill: "mining", tier: 3, speedPct: 30 } },
  small_net: { id: "small_net", name: "Small Fishing Net", type: "TOOL", value: 1, desc: "Catches shrimp in open water.", stack: false, tool: { skill: "fishing", tier: 1, speedPct: 0 } },
  fly_rod: { id: "fly_rod", name: "Fly Rod", type: "TOOL", value: 40, desc: "Lets you reach deeper, faster fish.", stack: false, tool: { skill: "fishing", tier: 2, speedPct: 15 } },

  // ——— Farming (seeds are planted in Farm Plot beds; produce feeds Cooking) ———
  potato_seed: { id: "potato_seed", name: "Potato Seed", type: "SEED", levelReq: { farming: 1 }, value: 3, desc: "Plant it in a Farm Plot bed. Ready in about 5 minutes.", stack: true },
  cabbage_seed: { id: "cabbage_seed", name: "Cabbage Seed", type: "SEED", levelReq: { farming: 12 }, value: 12, desc: "A slower crop with a better yield. About 12 minutes.", stack: true },
  redberry_seed: { id: "redberry_seed", name: "Redberry Seed", type: "SEED", levelReq: { farming: 30 }, value: 40, desc: "Half an hour in the ground, and the berries brew a Combat Tonic.", stack: true },
  potato: { id: "potato", name: "Potato", type: "FOOD", xp: { cooking: 20 }, value: 6, desc: "Earthy and filling once baked.", stack: true },
  cabbage: { id: "cabbage", name: "Cabbage", type: "FOOD", xp: { cooking: 45 }, value: 14, desc: "Hearty leaves. Better in a stew than raw.", stack: true },
  redberry: { id: "redberry", name: "Redberry", type: "FOOD", value: 22, desc: "Tart and faintly medicinal — the base of a Combat Tonic.", stack: true },
  baked_potato: { id: "baked_potato", name: "Baked Potato", type: "FOOD", value: 18, desc: "Hot from the fire. Heals 9.", stack: true },
  cabbage_stew: { id: "cabbage_stew", name: "Cabbage Stew", type: "FOOD", value: 44, desc: "Thick and restoring. Heals 20.", stack: true },

  // ——— Combat drops / gear ———
  coins: { id: "coins", name: "Coins", type: "MISC", value: 1, desc: "Shiny currency the merchants accept.", stack: true },
  bones: { id: "bones", name: "Bones", type: "MISC", value: 2, desc: "Possibly worth burying.", stack: true },
  raw_rat_meat: { id: "raw_rat_meat", name: "Raw Rat Meat", type: "FOOD", xp: { cooking: 12 }, value: 4, desc: "Edible once cooked. Heals a little raw.", stack: true },
  cooked_shrimp: { id: "cooked_shrimp", name: "Cooked Shrimp", type: "FOOD", value: 12, desc: "A tasty cooked shrimp. Heals 6.", stack: true },
  shrimp_food: { id: "shrimp_food", name: "Cooked Shrimp", type: "FOOD", value: 12, desc: "A tasty cooked shrimp. Heals 6.", stack: true },
  cooked_trout: { id: "cooked_trout", name: "Cooked Trout", type: "FOOD", value: 32, desc: "Flaky and filling. Heals 14.", stack: true },
  cooked_rat_meat: { id: "cooked_rat_meat", name: "Cooked Rat Meat", type: "FOOD", value: 9, desc: "Better than it sounds. Heals 4.", stack: true },
 combat_potion: { id: "combat_potion", name: "Combat Tonic", type: "FOOD", value: 45, desc: "A fiery red tonic. Heals 30, gulped down automatically when you're hurt.", stack: true },

  // ——— Weapons (equip slot: weapon) ———
  bronze_dagger: { id: "bronze_dagger", name: "Bronze Dagger", type: "TOOL", value: 12, desc: "Fast but small. 3-tick attack.", stack: false, equip: { slot: "weapon", tier: 1 } },
  bronze_sword: { id: "bronze_sword", name: "Bronze Sword", type: "TOOL", value: 20, desc: "A solid starter sword. 4-tick attack.", stack: false, equip: { slot: "weapon", tier: 1 } },
  bronze_2h: { id: "bronze_2h", name: "Bronze 2H Sword", type: "TOOL", value: 30, desc: "Slow but heavy. 6-tick attack.", stack: false, equip: { slot: "weapon", tier: 1 } },
  iron_sword: { id: "iron_sword", name: "Iron Sword", type: "TOOL", value: 60, desc: "A sharp iron blade.", stack: false, equip: { slot: "weapon", tier: 2 } },
  steel_sword: { id: "steel_sword", name: "Steel Sword", type: "TOOL", value: 140, desc: "Forged from steel — the finest blade a settlement smith can make.", stack: false, equip: { slot: "weapon", tier: 3 } },
  shortbow: { id: "shortbow", name: "Shortbow", type: "TOOL", value: 25, desc: "A quick bow. 3-tick attack.", stack: false, equip: { slot: "weapon", tier: 1 } },

  // ——— Clue scrolls + their uniques ———
  // The scrolls are MISC so the bulk storage cap never blocks one dropping.
  clue_simple: { id: "clue_simple", name: "Simple Clue Scroll", type: "MISC", value: 0, desc: "A crude map with two marks on it. Read it to begin the hunt.", stack: true },
  clue_hard: { id: "clue_hard", name: "Hard Clue Scroll", type: "MISC", value: 0, desc: "Three marks, and none of them close to town. Read it to begin the hunt.", stack: true },
  // The first two items that fit the offhand slot, which has existed unused since
  // equipment shipped.
  wayfarers_lantern: { id: "wayfarers_lantern", name: "Wayfarer's Lantern", type: "TOOL", value: 320, desc: "Clue reward. Steadies the hand and the nerve.", stack: false, equip: { slot: "offhand", tier: 1, bonus: { defense: 3, maxHp: 4 } } },
  cartographers_tome: { id: "cartographers_tome", name: "Cartographer's Tome", type: "TOOL", value: 900, desc: "Clue reward. Eldric would very much like a look at this.", stack: false, equip: { slot: "offhand", tier: 2, bonus: { attack: 4, defense: 5, maxHp: 6 } } },

  // ——— Armor (equip slots: head / body / legs) ———
  bronze_helm: { id: "bronze_helm", name: "Bronze Helm", type: "TOOL", value: 25, desc: "+1 defence, +5 HP.", stack: false, equip: { slot: "head", tier: 1, bonus: { defense: 1, maxHp: 5 } } },
  bronze_plate: { id: "bronze_plate", name: "Bronze Platebody", type: "TOOL", value: 40, desc: "+2 defence, +10 HP.", stack: false, equip: { slot: "body", tier: 1, bonus: { defense: 2, maxHp: 10 } } },
  bronze_legs: { id: "bronze_legs", name: "Bronze Platelegs", type: "TOOL", value: 30, desc: "+1 defence, +5 HP.", stack: false, equip: { slot: "legs", tier: 1, bonus: { defense: 1, maxHp: 5 } } },
  iron_helm: { id: "iron_helm", name: "Iron Helm", type: "TOOL", value: 80, desc: "+2 defence, +10 HP.", stack: false, equip: { slot: "head", tier: 2, bonus: { defense: 2, maxHp: 10 } } },
  iron_plate: { id: "iron_plate", name: "Iron Platebody", type: "TOOL", value: 130, desc: "+4 defence, +15 HP.", stack: false, equip: { slot: "body", tier: 2, bonus: { defense: 4, maxHp: 15 } } },
  iron_legs: { id: "iron_legs", name: "Iron Platelegs", type: "TOOL", value: 100, desc: "+2 defence, +10 HP.", stack: false, equip: { slot: "legs", tier: 2, bonus: { defense: 2, maxHp: 10 } } },

  goblin_key: { id: "goblin_key", name: "Goblin Key", type: "MISC", value: 5, desc: "Rusted and noisy.", stack: true },
  dungeon_key: { id: "dungeon_key", name: "Iron Key", type: "MISC", value: 0, desc: "Fits the locked door that blocks the dungeon exit. Consumed on use.", stack: true },
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

/** Emoji placeholder icons for the bag UI (zero-asset, readable on mobile). */
export const ITEM_ICONS: Record<string, string> = {
  normal_log: "🪵", oak_log: "🌳", willow_log: "🌿",
  copper_ore: "🟠", tin_ore: "⚪", iron_ore: "⚙️", coal: "⚫",
  raw_shrimp: "🦐", raw_trout: "🐟",
  bronze_bar: "🟤", iron_bar: "🔩", steel_bar: "⛓️",
  potato_seed: "🌰", cabbage_seed: "🌱", redberry_seed: "🫘",
  potato: "🥔", cabbage: "🥬", redberry: "🍒", baked_potato: "🥔", cabbage_stew: "🍲",
  plank: "🪵",
  bronze_axe: "🪓", iron_axe: "🪓", steel_axe: "🪓",
  bronze_pickaxe: "⛏️", iron_pickaxe: "⛏️", steel_pickaxe: "⛏️",
  small_net: "🥅", fly_rod: "🎣",
  coins: "🪙", bones: "🦴",
  raw_rat_meat: "🍖", cooked_shrimp: "🍤", shrimp_food: "🍤", cooked_trout: "🍣", cooked_rat_meat: "🍗",
 combat_potion: "🧪",
  bronze_dagger: "🗡️", bronze_sword: "⚔️", bronze_2h: "⚔️", iron_sword: "⚔️", steel_sword: "⚔️", shortbow: "🏹",
  bronze_helm: "⛑️", bronze_plate: "🛡️", bronze_legs: "🦵",
  iron_helm: "⛑️", iron_plate: "🛡️", iron_legs: "🦵",
  goblin_key: "🗝️", dungeon_key: "🗝️", rat_bone: "🦴", loop_half_key: "🗝️", zombie_flesh: "🧟",
  clue_simple: "📜", clue_hard: "📜", wayfarers_lantern: "🏮", cartographers_tome: "📖",
  pet_rat: "🐀", pet_goblin: "👹", pet_skeleton: "💀", pet_zombie: "🧟",
};

export function itemIcon(id: string): string {
  return ITEM_ICONS[id] ?? "❔";
}

/**
 * Item ids with a real generated icon at `/icons/<id>.png` (Phase H.1: one
 * generated grid sheet per item group, sliced by `scripts/slice-atlas.cjs` —
 * see `assets/icon-atlas/README.md`). All 62 items are covered — `shrimp_food`
 * shares `cooked_shrimp`'s file (a literal file copy, not just a lookup
 * alias) since it's a legacy duplicate with no manifest cell of its own.
 * Deliberately reversible: a bad or missing file just falls back to emoji,
 * nothing breaks the bag.
 */
export const ITEM_ICON_IMAGE_IDS: ReadonlySet<string> = new Set<string>([
  "normal_log", "oak_log", "willow_log",
  "copper_ore", "tin_ore", "iron_ore", "coal",
  "raw_shrimp", "raw_trout",
  "bronze_bar", "iron_bar", "steel_bar",
  "plank",
  "bronze_axe", "iron_axe", "steel_axe",
  "bronze_pickaxe", "iron_pickaxe", "steel_pickaxe",
  "small_net", "fly_rod",
  "potato_seed", "cabbage_seed", "redberry_seed",
  "potato", "cabbage", "redberry", "baked_potato", "cabbage_stew",
  "coins", "bones",
  "raw_rat_meat", "cooked_shrimp", "shrimp_food", "cooked_trout", "cooked_rat_meat",
  "combat_potion",
  "bronze_dagger", "bronze_sword", "bronze_2h", "iron_sword", "steel_sword", "shortbow",
  "clue_simple", "clue_hard", "wayfarers_lantern", "cartographers_tome",
  "bronze_helm", "bronze_plate", "bronze_legs",
  "iron_helm", "iron_plate", "iron_legs",
  "goblin_key", "dungeon_key", "rat_bone", "loop_half_key", "zombie_flesh",
  "pet_rat", "pet_goblin", "pet_skeleton", "pet_zombie",
]);

/**
 * The bag/panel icon slot's HTML: a real icon image where one exists,
 * otherwise the emoji placeholder as plain text — the same value `itemIcon`
 * has always returned, so this is a no-op until icons start shipping.
 */
export function itemIconHtml(id: string): string {
  return ITEM_ICON_IMAGE_IDS.has(id)
    ? `<img class="item-icon-img" src="/icons/${id}.png" alt="" loading="lazy">`
    : itemIcon(id);
}

/** Best owned gathering tool for a skill (P2). Null = no tool for it. */
export function getBestTool(inv: InventoryComponent, skill: SkillId): { tier: number; speedPct: number } | null {
  let best: { tier: number; speedPct: number } | null = null;
  for (const s of inv.items) {
    const t = ITEMS[s.id]?.tool;
    if (!t || t.skill !== skill) continue;
    if (!best || t.tier > best.tier) best = { tier: t.tier, speedPct: t.speedPct };
  }
  return best;
}

/** Highest owned tool tier for a skill (0 = none). */
export function getToolTier(inv: InventoryComponent, skill: SkillId): number {
  return getBestTool(inv, skill)?.tier ?? 0;
}
