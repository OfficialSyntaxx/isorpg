// Artisan crafting recipes: Cooking, Smithing, Carpentry (GDD §5.A).
import type { SkillId } from "./Skills";
import type { BuildingType } from "./Buildings";

export interface RecipeInput {
  itemId: string;
  qty: number;
}

export interface CraftRecipe {
  id: string;
  skill: SkillId;
  name: string;
  levelReq: number;
  ticks: number; // base ticks per craft (mastery reduces, like gathering)
  xp: number;
  inputs: RecipeInput[];
  output: { itemId: string; qty: number };
  requiresBuilding?: BuildingType;
  burnable?: boolean; // cooking-only: chance to fail at low level, reduced by level/mastery
}

export const RECIPES: CraftRecipe[] = [
  // ——— Cooking ———
  { id: "cook_shrimp", skill: "cooking", name: "Cook Shrimp", levelReq: 1, ticks: 2, xp: 30,
    inputs: [{ itemId: "raw_shrimp", qty: 1 }], output: { itemId: "cooked_shrimp", qty: 1 }, burnable: true },
  { id: "cook_rat_meat", skill: "cooking", name: "Cook Rat Meat", levelReq: 5, ticks: 2, xp: 40,
    inputs: [{ itemId: "raw_rat_meat", qty: 1 }], output: { itemId: "cooked_rat_meat", qty: 1 }, burnable: true },
  { id: "cook_trout", skill: "cooking", name: "Cook Trout", levelReq: 20, ticks: 3, xp: 70,
    inputs: [{ itemId: "raw_trout", qty: 1 }], output: { itemId: "cooked_trout", qty: 1 }, burnable: true },

  // ——— Smithing (requires a Smelter built in the settlement) ———
  { id: "smelt_bronze", skill: "smithing", name: "Smelt Bronze Bar", levelReq: 1, ticks: 3, xp: 30,
    inputs: [{ itemId: "copper_ore", qty: 1 }, { itemId: "tin_ore", qty: 1 }], output: { itemId: "bronze_bar", qty: 1 },
    requiresBuilding: "SMELTER" },
  { id: "smelt_iron", skill: "smithing", name: "Smelt Iron Bar", levelReq: 20, ticks: 4, xp: 60,
    inputs: [{ itemId: "iron_ore", qty: 2 }], output: { itemId: "iron_bar", qty: 1 },
    requiresBuilding: "SMELTER" },
  { id: "smelt_steel", skill: "smithing", name: "Smelt Steel Bar", levelReq: 30, ticks: 5, xp: 100,
    inputs: [{ itemId: "iron_bar", qty: 1 }, { itemId: "coal", qty: 1 }], output: { itemId: "steel_bar", qty: 1 },
    requiresBuilding: "SMELTER" },

  // P2 tool smithing (bars -> tools/armour)
  { id: "smith_bronze_axe", skill: "smithing", name: "Forge Bronze Axe", levelReq: 1, ticks: 4, xp: 40,
    inputs: [{ itemId: "bronze_bar", qty: 3 }], output: { itemId: "bronze_axe", qty: 1 }, requiresBuilding: "SMELTER" },
  { id: "smith_bronze_pick", skill: "smithing", name: "Forge Bronze Pickaxe", levelReq: 1, ticks: 4, xp: 40,
    inputs: [{ itemId: "bronze_bar", qty: 3 }], output: { itemId: "bronze_pickaxe", qty: 1 }, requiresBuilding: "SMELTER" },
  { id: "smith_iron_axe", skill: "smithing", name: "Forge Iron Axe", levelReq: 20, ticks: 5, xp: 70,
    inputs: [{ itemId: "iron_bar", qty: 3 }], output: { itemId: "iron_axe", qty: 1 }, requiresBuilding: "SMELTER" },
  { id: "smith_iron_pick", skill: "smithing", name: "Forge Iron Pickaxe", levelReq: 20, ticks: 5, xp: 70,
    inputs: [{ itemId: "iron_bar", qty: 3 }], output: { itemId: "iron_pickaxe", qty: 1 }, requiresBuilding: "SMELTER" },
  { id: "smith_steel_axe", skill: "smithing", name: "Forge Steel Axe", levelReq: 35, ticks: 6, xp: 110,
    inputs: [{ itemId: "steel_bar", qty: 3 }], output: { itemId: "steel_axe", qty: 1 }, requiresBuilding: "SMELTER" },
  { id: "smith_steel_pick", skill: "smithing", name: "Forge Steel Pickaxe", levelReq: 35, ticks: 6, xp: 110,
    inputs: [{ itemId: "steel_bar", qty: 3 }], output: { itemId: "steel_pickaxe", qty: 1 }, requiresBuilding: "SMELTER" },
  { id: "smith_bronze_helm", skill: "smithing", name: "Forge Bronze Helm", levelReq: 3, ticks: 3, xp: 30,
    inputs: [{ itemId: "bronze_bar", qty: 2 }], output: { itemId: "bronze_helm", qty: 1 }, requiresBuilding: "SMELTER" },
  { id: "smith_bronze_plate", skill: "smithing", name: "Forge Bronze Platebody", levelReq: 5, ticks: 4, xp: 45,
    inputs: [{ itemId: "bronze_bar", qty: 3 }], output: { itemId: "bronze_plate", qty: 1 }, requiresBuilding: "SMELTER" },
  { id: "smith_bronze_legs", skill: "smithing", name: "Forge Bronze Platelegs", levelReq: 4, ticks: 3, xp: 35,
    inputs: [{ itemId: "bronze_bar", qty: 2 }], output: { itemId: "bronze_legs", qty: 1 }, requiresBuilding: "SMELTER" },
  { id: "smith_iron_helm", skill: "smithing", name: "Forge Iron Helm", levelReq: 22, ticks: 4, xp: 65,
    inputs: [{ itemId: "iron_bar", qty: 2 }], output: { itemId: "iron_helm", qty: 1 }, requiresBuilding: "SMELTER" },
  { id: "smith_iron_plate", skill: "smithing", name: "Forge Iron Platebody", levelReq: 24, ticks: 5, xp: 85,
    inputs: [{ itemId: "iron_bar", qty: 3 }], output: { itemId: "iron_plate", qty: 1 }, requiresBuilding: "SMELTER" },
  { id: "smith_iron_legs", skill: "smithing", name: "Forge Iron Platelegs", levelReq: 23, ticks: 4, xp: 70,
    inputs: [{ itemId: "iron_bar", qty: 2 }], output: { itemId: "iron_legs", qty: 1 }, requiresBuilding: "SMELTER" },

  // ——— Carpentry (requires a Sawmill built in the settlement) ———
  { id: "plank_normal", skill: "carpentry", name: "Saw Plank (Normal)", levelReq: 1, ticks: 2, xp: 20,
    inputs: [{ itemId: "normal_log", qty: 1 }], output: { itemId: "plank", qty: 1 }, requiresBuilding: "SAWMILL" },
  { id: "plank_oak", skill: "carpentry", name: "Saw Plank (Oak)", levelReq: 15, ticks: 3, xp: 45,
    inputs: [{ itemId: "oak_log", qty: 1 }], output: { itemId: "plank", qty: 2 }, requiresBuilding: "SAWMILL" },
  { id: "plank_willow", skill: "carpentry", name: "Saw Plank (Willow)", levelReq: 30, ticks: 4, xp: 80,
    inputs: [{ itemId: "willow_log", qty: 1 }], output: { itemId: "plank", qty: 3 }, requiresBuilding: "SAWMILL" },
  { id: "craft_fly_rod", skill: "carpentry", name: "Carve Fly Rod", levelReq: 10, ticks: 4, xp: 55,
    inputs: [{ itemId: "plank", qty: 2 }, { itemId: "bronze_bar", qty: 1 }], output: { itemId: "fly_rod", qty: 1 }, requiresBuilding: "SAWMILL" },
];

export function recipesFor(skill: SkillId): CraftRecipe[] {
  return RECIPES.filter((r) => r.skill === skill);
}

export function getRecipe(id: string): CraftRecipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
