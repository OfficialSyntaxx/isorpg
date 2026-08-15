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
    inputs: [{ itemId: "iron_ore", qty: 1 }, { itemId: "coal", qty: 1 }], output: { itemId: "iron_bar", qty: 1 },
    requiresBuilding: "SMELTER" },

  // ——— Carpentry (requires a Sawmill built in the settlement) ———
  { id: "plank_normal", skill: "carpentry", name: "Saw Plank (Normal)", levelReq: 1, ticks: 2, xp: 20,
    inputs: [{ itemId: "normal_log", qty: 1 }], output: { itemId: "plank", qty: 1 }, requiresBuilding: "SAWMILL" },
  { id: "plank_oak", skill: "carpentry", name: "Saw Plank (Oak)", levelReq: 15, ticks: 3, xp: 45,
    inputs: [{ itemId: "oak_log", qty: 1 }], output: { itemId: "plank", qty: 2 }, requiresBuilding: "SAWMILL" },
  { id: "plank_willow", skill: "carpentry", name: "Saw Plank (Willow)", levelReq: 30, ticks: 4, xp: 80,
    inputs: [{ itemId: "willow_log", qty: 1 }], output: { itemId: "plank", qty: 3 }, requiresBuilding: "SAWMILL" },
];

export function recipesFor(skill: SkillId): CraftRecipe[] {
  return RECIPES.filter((r) => r.skill === skill);
}

export function getRecipe(id: string): CraftRecipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
