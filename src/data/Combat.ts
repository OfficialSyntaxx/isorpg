// Combat data: weapons, monsters, weighted drop tables (GDD §5.C/D).
export interface WeaponDef {
  id: string;
  name: string;
  kind: "melee" | "ranged";
  // 600ms ticks between attacks (GDD: shortbow 3t/1.8s, 2H 6t/3.6s)
  ticks: number;
  itemId: string | null; // inventory item that grants this weapon (null = fists)
  maxHit: number;
  accuracy: number; // attack roll
  requiredAttack: number;
}

export interface DropEntry {
  itemId: string;
  weight: number;
  min: number;
  max: number;
}

export interface MonsterDef {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHit: number;
  attackTick: number;
  attackRoll: number;
  defenseRoll: number;
  ranged: boolean;
  aggroRange: number; // tiles; 0 = passive (attacks only when hit)
  xp: { attack: number; strength: number; defense: number; hitpoints: number };
  main: DropEntry[];
  tertiary?: { itemId: string; chance: number; min: number; max: number }[];
  petTable?: { itemId: string; chance: number }[];
  respawnMs: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  fists: { id: "fists", name: "Fists", kind: "melee", ticks: 2, itemId: null, maxHit: 1, accuracy: 2, requiredAttack: 0 },
  dagger: { id: "dagger", name: "Bronze Dagger", kind: "melee", ticks: 3, itemId: "bronze_dagger", maxHit: 4, accuracy: 8, requiredAttack: 1 },
  sword: { id: "sword", name: "Bronze Sword", kind: "melee", ticks: 4, itemId: "bronze_sword", maxHit: 6, accuracy: 12, requiredAttack: 1 },
  sword2h: { id: "sword2h", name: "Bronze 2H Sword", kind: "melee", ticks: 6, itemId: "bronze_2h", maxHit: 10, accuracy: 16, requiredAttack: 5 },
  shortbow: { id: "shortbow", name: "Shortbow", kind: "ranged", ticks: 3, itemId: "shortbow", maxHit: 5, accuracy: 14, requiredAttack: 1 },
  iron_sword: { id: "iron_sword", name: "Iron Sword", kind: "melee", ticks: 4, itemId: "iron_sword", maxHit: 9, accuracy: 20, requiredAttack: 10 },
};

export const MONSTERS: Record<string, MonsterDef> = {
  giant_rat: {
    id: "giant_rat", name: "Giant Rat", level: 1, hp: 8, maxHit: 1, attackTick: 4,
    attackRoll: 4, defenseRoll: 2, ranged: false, aggroRange: 3,
    xp: { attack: 4, strength: 2, defense: 2, hitpoints: 1 },
    main: [
      { itemId: "raw_rat_meat", weight: 50, min: 1, max: 1 },
      { itemId: "coins", weight: 180, min: 1, max: 6 },
      { itemId: "bones", weight: 60, min: 1, max: 1 },
    ],
    tertiary: [{ itemId: "rat_bone", chance: 0.02, min: 1, max: 1 }],
    petTable: [{ itemId: "pet_rat", chance: 0.0004 }],
    respawnMs: 20_000,
  },
  goblin: {
    id: "goblin", name: "Goblin", level: 2, hp: 14, maxHit: 3, attackTick: 4,
    attackRoll: 6, defenseRoll: 4, ranged: false, aggroRange: 4,
    xp: { attack: 6, strength: 3, defense: 3, hitpoints: 1 },
    main: [
      { itemId: "coins", weight: 200, min: 2, max: 10 },
      { itemId: "goblin_key", weight: 10, min: 1, max: 1 },
      { itemId: "raw_rat_meat", weight: 30, min: 1, max: 1 },
    ],
    tertiary: [{ itemId: "goblin_key", chance: 0.05, min: 1, max: 1 }],
    petTable: [{ itemId: "pet_goblin", chance: 0.0003 }],
    respawnMs: 30_000,
  },
  skeleton: {
    id: "skeleton", name: "Skeleton", level: 8, hp: 26, maxHit: 5, attackTick: 4,
    attackRoll: 12, defenseRoll: 10, ranged: false, aggroRange: 4,
    xp: { attack: 14, strength: 8, defense: 8, hitpoints: 2 },
    main: [
      { itemId: "coins", weight: 120, min: 5, max: 20 },
      { itemId: "bones", weight: 120, min: 1, max: 1 },
      { itemId: "bronze_sword", weight: 4, min: 1, max: 1 },
      { itemId: "shrimp_food", weight: 15, min: 1, max: 1 },
    ],
    tertiary: [{ itemId: "loop_half_key", chance: 0.04, min: 1, max: 1 }],
    petTable: [{ itemId: "pet_skeleton", chance: 0.00025 }],
    respawnMs: 40_000,
  },
  zombie: {
    id: "zombie", name: "Zombie", level: 13, hp: 40, maxHit: 7, attackTick: 5,
    attackRoll: 16, defenseRoll: 14, ranged: false, aggroRange: 5,
    xp: { attack: 20, strength: 12, defense: 12, hitpoints: 3 },
    main: [
      { itemId: "coins", weight: 100, min: 10, max: 40 },
      { itemId: "bronze_2h", weight: 3, min: 1, max: 1 },
      { itemId: "iron_ore", weight: 30, min: 1, max: 2 },
      { itemId: "cooked_shrimp", weight: 20, min: 1, max: 2 },
    ],
    tertiary: [{ itemId: "zombie_flesh", chance: 0.06, min: 1, max: 1 }],
    petTable: [{ itemId: "pet_zombie", chance: 0.0002 }],
    respawnMs: 50_000,
  },
};

/** Render variants keyed by monster id for the procedural generator. */
export const MONSTER_STYLES: Record<string, { body: string; accent: string; ears?: boolean }> = {
  giant_rat: { body: "#9a8a6f", accent: "#d98fb0", ears: true },
  goblin: { body: "#6fae55", accent: "#c0392b", ears: true },
  skeleton: { body: "#d8ceb8", accent: "#8e8468" },
  zombie: { body: "#7c9a6a", accent: "#4a6a54" },
};

/** Food that triggers auto-eat, by item id. */
export interface FoodDef { heal: number; tier: number; }
export const FOODS: Record<string, FoodDef> = {
  raw_rat_meat: { heal: 3, tier: 1 },
  cooked_shrimp: { heal: 6, tier: 2 },
  shrimp_food: { heal: 6, tier: 2 },
};

export function getWeapon(itemId: string | null): WeaponDef {
  if (!itemId) return WEAPONS.fists;
  for (const w of Object.values(WEAPONS)) if (w.itemId === itemId) return w;
  return WEAPONS.fists;
}