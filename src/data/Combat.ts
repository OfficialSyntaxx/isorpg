// Combat data: weapons, monsters, weighted drop tables (GDD §5.C/D).
import type { InventoryComponent } from "../components/Inventory";

/**
 * F.1: pick a stance per fight. Each shifts the attack-roll/max-hit split and
 * trains a different skill — previously every hit trained attack, strength
 * *and* hitpoints at once, so there was no way to specialise.
 */
export type AttackStyle = "accurate" | "aggressive" | "defensive";

export interface AttackStyleDef {
  id: AttackStyle;
  name: string;
  description: string;
  /** Bonus added to the player's attack roll (hit chance). */
  accuracyBonus: number;
  /** Bonus added to the player's max-hit calculation. */
  maxHitBonus: number;
  /** Bonus added to the player's effective defense roll. */
  defenseBonus: number;
  /** The skill trained by this style, on top of the constant hitpoints trickle. */
  trains: "attack" | "strength" | "defense";
}

export const ATTACK_STYLES: Record<AttackStyle, AttackStyleDef> = {
  accurate: {
    id: "accurate", name: "Accurate", description: "+3 accuracy · trains Attack",
    accuracyBonus: 3, maxHitBonus: 0, defenseBonus: 0, trains: "attack",
  },
  aggressive: {
    id: "aggressive", name: "Aggressive", description: "+3 max hit · trains Strength",
    accuracyBonus: 0, maxHitBonus: 3, defenseBonus: 0, trains: "strength",
  },
  defensive: {
    id: "defensive", name: "Defensive", description: "+3 defense · trains Defense",
    accuracyBonus: 0, maxHitBonus: 0, defenseBonus: 3, trains: "defense",
  },
};
export const DEFAULT_ATTACK_STYLE: AttackStyle = "accurate";

/**
 * F.2: Resolve — a limited resource spent on a short combat buff, restored by
 * resting at a Campfire. Gives food a rival for bag space: a buff costs
 * nothing to carry but runs out mid-fight if you don't manage it.
 */
export type BuffId = "precision" | "power" | "warden";

export interface BuffDef {
  id: BuffId;
  name: string;
  description: string;
  accuracyBonus: number;
  maxHitBonus: number;
  defenseBonus: number;
  /** Resolve spent per combat tick (600ms) while active. */
  costPerTick: number;
}

export const BUFFS: Record<BuffId, BuffDef> = {
  precision: {
    id: "precision", name: "Precision", description: "+6 accuracy while active",
    accuracyBonus: 6, maxHitBonus: 0, defenseBonus: 0, costPerTick: 2,
  },
  power: {
    id: "power", name: "Power", description: "+4 max hit while active",
    accuracyBonus: 0, maxHitBonus: 4, defenseBonus: 0, costPerTick: 2,
  },
  warden: {
    id: "warden", name: "Warden", description: "+6 defense while active",
    accuracyBonus: 0, maxHitBonus: 0, defenseBonus: 6, costPerTick: 2,
  },
};
export const RESOLVE_MAX = 100;
/** Resolve regained per tick while resting within reach of a Campfire. */
export const RESOLVE_REGEN_PER_TICK = 3;
/** Tiles from a Campfire's centre that still count as "resting" there. */
export const RESOLVE_REGEN_RANGE = 2;

/**
 * F.3: a charge-based special per weapon, so weapon choice survives past a
 * max-hit comparison — the 2H already had slow/heavy identity from its ticks;
 * everything else swung the same way with a different number on it.
 */
export interface SpecialDef {
  name: string;
  description: string;
  /** % of a full special bar this costs (bar is 0..100). */
  cost: number;
  /** Multiplies the normal max-hit roll. */
  damageMult: number;
  /** Bypasses the accuracy roll — the hit always lands. */
  guaranteedHit: boolean;
  /** Extra multiplier applied on top when the target is below 25% HP. */
  executeMult?: number;
}

export const WEAPON_SPECIALS: Record<string, SpecialDef> = {
  dagger: {
    name: "Puncture", description: "Always hits · 1.2× damage · 25% bar",
    cost: 25, damageMult: 1.2, guaranteedHit: true,
  },
  sword: {
    name: "Riposte", description: "1.3× damage · 40% bar",
    cost: 40, damageMult: 1.3, guaranteedHit: false,
  },
  sword2h: {
    name: "Cleave", description: "1.8× damage · 100% bar",
    cost: 100, damageMult: 1.8, guaranteedHit: false,
  },
  shortbow: {
    name: "Piercing Shot", description: "Always hits · 1.4× damage · 50% bar",
    cost: 50, damageMult: 1.4, guaranteedHit: true,
  },
  iron_sword: {
    name: "Execute", description: "1.2× damage (2.2× under 25% HP) · 60% bar",
    cost: 60, damageMult: 1.2, guaranteedHit: false, executeMult: 2.2,
  },
  steel_sword: {
    name: "Onslaught", description: "1.9× damage · 80% bar",
    cost: 80, damageMult: 1.9, guaranteedHit: false,
  },
};
export const SPECIAL_MAX = 100;
/** Regains over time regardless of location — unlike Resolve, this needs no Campfire. */
export const SPECIAL_REGEN_PER_TICK = 1;

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
  boss?: boolean; // P4b: boss archetype (enrages below 50% HP, telegraph slams)
  /** P5.3: bosses with slamChance telegraph a slam even at full HP (per tick). */
  slamChance?: number;
  /** P5.3: fixed slam damage if set (else the default 6–10 roll is used). */
  slamDmg?: number;
  /** F.4: which affix scaled this *instance's* def, if any — the shared MONSTERS
   *  entry is never mutated; a rolled monster carries its own scaled copy. */
  affix?: AffixId;
  xp: { attack: number; strength: number; defense: number; hitpoints: number };
  main: DropEntry[];
  tertiary?: { itemId: string; chance: number; min: number; max: number }[];
  petTable?: { itemId: string; chance: number }[];
  respawnMs: number;
}

/**
 * F.4: an occasional prefix on a common spawn — cheap variety across all ten
 * non-boss monsters without new content. Bosses keep their fixed identity;
 * they already have slam/enrage mechanics doing this job.
 */
export type AffixId = "hardened" | "swift" | "rich";

export interface AffixDef {
  id: AffixId;
  label: string;
  description: string;
  /** Emissive tint applied to the monster's idle materials as a visual tell. */
  tint: string;
}

export const AFFIXES: Record<AffixId, AffixDef> = {
  hardened: { id: "hardened", label: "Hardened", description: "+50% HP, +30% max hit, +30% defense", tint: "#ff5a3a" },
  swift: { id: "swift", label: "Swift", description: "~40% faster attacks, wider aggro range", tint: "#55d6ff" },
  rich: { id: "rich", label: "Rich", description: "Double coin drops, doubled tertiary chance", tint: "#ffd75a" },
};
export const AFFIX_CHANCE = 0.12;

/** Roll whether a freshly spawned monster gets an affix — null most of the time. */
export function rollAffix(): AffixId | null {
  if (Math.random() >= AFFIX_CHANCE) return null;
  const ids = Object.keys(AFFIXES) as AffixId[];
  return ids[Math.floor(Math.random() * ids.length)];
}

/**
 * Scale a monster def for one rolled affix, producing a fresh per-instance
 * copy — the shared MONSTERS table entry this came from is never touched, so
 * an affixed spawn never leaks its stats onto every other monster of that type.
 */
export function applyAffix(def: MonsterDef, affix: AffixId): MonsterDef {
  const named: MonsterDef = { ...def, name: `${AFFIXES[affix].label} ${def.name}`, affix };
  switch (affix) {
    case "hardened":
      return { ...named, hp: Math.round(def.hp * 1.5), maxHit: Math.round(def.maxHit * 1.3), defenseRoll: Math.round(def.defenseRoll * 1.3) };
    case "swift":
      return { ...named, attackTick: Math.max(1, Math.round(def.attackTick * 0.6)), aggroRange: def.aggroRange + 2 };
    case "rich":
      return {
        ...named,
        main: def.main.map((d) => (d.itemId === "coins" ? { ...d, min: d.min * 2, max: d.max * 2 } : d)),
        tertiary: def.tertiary?.map((t) => ({ ...t, chance: Math.min(1, t.chance * 2) })),
      };
  }
}

export const WEAPONS: Record<string, WeaponDef> = {
  fists: { id: "fists", name: "Fists", kind: "melee", ticks: 2, itemId: null, maxHit: 1, accuracy: 2, requiredAttack: 0 },
  dagger: { id: "dagger", name: "Bronze Dagger", kind: "melee", ticks: 3, itemId: "bronze_dagger", maxHit: 4, accuracy: 8, requiredAttack: 1 },
  sword: { id: "sword", name: "Bronze Sword", kind: "melee", ticks: 4, itemId: "bronze_sword", maxHit: 6, accuracy: 12, requiredAttack: 1 },
  sword2h: { id: "sword2h", name: "Bronze 2H Sword", kind: "melee", ticks: 6, itemId: "bronze_2h", maxHit: 10, accuracy: 16, requiredAttack: 5 },
  shortbow: { id: "shortbow", name: "Shortbow", kind: "ranged", ticks: 3, itemId: "shortbow", maxHit: 5, accuracy: 14, requiredAttack: 1 },
  iron_sword: { id: "iron_sword", name: "Iron Sword", kind: "melee", ticks: 4, itemId: "iron_sword", maxHit: 9, accuracy: 20, requiredAttack: 10 },
  steel_sword: { id: "steel_sword", name: "Steel Sword", kind: "melee", ticks: 4, itemId: "steel_sword", maxHit: 13, accuracy: 28, requiredAttack: 20 },
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
    tertiary: [{ itemId: "goblin_key", chance: 0.05, min: 1, max: 1 }, { itemId: "clue_simple", chance: 0.012, min: 1, max: 1 }],
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
    tertiary: [{ itemId: "loop_half_key", chance: 0.04, min: 1, max: 1 }, { itemId: "clue_hard", chance: 0.008, min: 1, max: 1 }],
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
  dire_wolf: {
    id: "dire_wolf", name: "Dire Wolf", level: 5, hp: 22, maxHit: 4, attackTick: 3,
    attackRoll: 10, defenseRoll: 6, ranged: false, aggroRange: 5,
    xp: { attack: 10, strength: 8, defense: 6, hitpoints: 2 },
    main: [
      { itemId: "raw_rat_meat", weight: 45, min: 1, max: 1 },
      { itemId: "coins", weight: 140, min: 2, max: 8 },
      { itemId: "bones", weight: 55, min: 1, max: 2 },
    ],
    tertiary: [{ itemId: "pet_rat", chance: 0.004, min: 1, max: 1 }],
    petTable: [{ itemId: "pet_rat", chance: 0.0008 }],
    respawnMs: 25_000,
  },
  goblin_archer: {
    id: "goblin_archer", name: "Goblin Archer", level: 7, hp: 18, maxHit: 5, attackTick: 4,
    attackRoll: 14, defenseRoll: 7, ranged: true, aggroRange: 6,
    xp: { attack: 14, strength: 6, defense: 8, hitpoints: 2 },
    main: [
      { itemId: "coins", weight: 160, min: 3, max: 12 },
      { itemId: "shortbow", weight: 2, min: 1, max: 1 },
      { itemId: "goblin_key", weight: 12, min: 1, max: 1 },
      { itemId: "raw_rat_meat", weight: 30, min: 1, max: 1 },
    ],
    tertiary: [{ itemId: "goblin_key", chance: 0.06, min: 1, max: 1 }],
    petTable: [{ itemId: "pet_goblin", chance: 0.0006 }],
    respawnMs: 30_000,
  },
  forest_ogre: {
    id: "forest_ogre", name: "Forest Ogre", level: 18, hp: 110, maxHit: 10, attackTick: 5,
    attackRoll: 24, defenseRoll: 20, ranged: false, aggroRange: 5, boss: true,
    xp: { attack: 42, strength: 28, defense: 28, hitpoints: 8 },
    main: [
      { itemId: "coins", weight: 60, min: 25, max: 80 },
      { itemId: "cooked_trout", weight: 25, min: 1, max: 3 },
      { itemId: "iron_ore", weight: 40, min: 2, max: 5 },
      { itemId: "bronze_2h", weight: 10, min: 1, max: 1 },
      { itemId: "iron_sword", weight: 6, min: 1, max: 1 },
    ],
    tertiary: [{ itemId: "goblin_key", chance: 0.2, min: 1, max: 1 }],
    petTable: [{ itemId: "pet_skeleton", chance: 0.02 }],
    respawnMs: 120_000,
  },
  cave_bat: {
    id: "cave_bat", name: "Cave Bat", level: 6, hp: 14, maxHit: 3, attackTick: 3,
    attackRoll: 9, defenseRoll: 5, ranged: false, aggroRange: 5,
    xp: { attack: 8, strength: 5, defense: 5, hitpoints: 1 },
    main: [
      { itemId: "bones", weight: 60, min: 1, max: 1 },
      { itemId: "coins", weight: 100, min: 1, max: 5 },
    ],
    petTable: [{ itemId: "pet_rat", chance: 0.003 }],
    respawnMs: 20_000,
  },
  cave_slasher: {
    id: "cave_slasher", name: "Cave Slasher", level: 12, hp: 52, maxHit: 8, attackTick: 4,
    attackRoll: 18, defenseRoll: 13, ranged: false, aggroRange: 6,
    xp: { attack: 26, strength: 16, defense: 14, hitpoints: 4 },
    main: [
      { itemId: "coins", weight: 130, min: 8, max: 30 },
      { itemId: "bronze_sword", weight: 8, min: 1, max: 1 },
      { itemId: "bronze_2h", weight: 4, min: 1, max: 1 },
      { itemId: "cooked_trout", weight: 18, min: 1, max: 1 },
    ],
    tertiary: [{ itemId: "goblin_key", chance: 0.1, min: 1, max: 1 }],
    petTable: [{ itemId: "pet_goblin", chance: 0.001 }],
    respawnMs: 45_000,
  },
  // P5.3: the dungeon mini-boss — guards the exit room just past the locked
  // door. Telegraphs a slam even at full HP; revives fresh on every descent.
  cave_brute: {
    id: "cave_brute", name: "Cave Brute", level: 15, hp: 90, maxHit: 9, attackTick: 5,
    attackRoll: 22, defenseRoll: 16, ranged: false, aggroRange: 6,
    boss: true, slamChance: 0.08, slamDmg: 14,
    xp: { attack: 40, strength: 26, defense: 26, hitpoints: 7 },
    main: [
      { itemId: "coins", weight: 60, min: 30, max: 120 },
      { itemId: "cooked_trout", weight: 30, min: 1, max: 2 },
      { itemId: "iron_ore", weight: 40, min: 2, max: 6 },
      { itemId: "bronze_2h", weight: 8, min: 1, max: 1 },
      { itemId: "iron_sword", weight: 10, min: 1, max: 1 },
    ],
    tertiary: [{ itemId: "goblin_key", chance: 0.25, min: 1, max: 1 }],
    petTable: [{ itemId: "pet_goblin", chance: 0.01 }],
    respawnMs: 3_600_000, // never mid-visit — DungeonSystem.enter() revives it
  },
  // P6.3: biome natives — the frozen north and the southern mires bring their
  // own wildlife so every region reads as a distinct threat.
  frost_imp: {
    id: "frost_imp", name: "Frost Imp", level: 14, hp: 38, maxHit: 4, attackTick: 4,
    attackRoll: 20, defenseRoll: 15, ranged: false, aggroRange: 6,
    xp: { attack: 16, strength: 15, defense: 18, hitpoints: 3 },
    main: [
      { itemId: "coins", weight: 60, min: 6, max: 20 },
      { itemId: "bones", weight: 50, min: 1, max: 1 },
      { itemId: "raw_rat_meat", weight: 30, min: 1, max: 2 },
    ],
    tertiary: [{ itemId: "goblin_key", chance: 0.04, min: 1, max: 1 }],
    petTable: [{ itemId: "pet_rat", chance: 0.005 }],
    respawnMs: 30_000,
  },
  bog_husk: {
    id: "bog_husk", name: "Bog Husk", level: 10, hp: 44, maxHit: 5, attackTick: 5,
    attackRoll: 15, defenseRoll: 14, ranged: false, aggroRange: 6,
    xp: { attack: 10, strength: 10, defense: 10, hitpoints: 2 },
    main: [
      { itemId: "coins", weight: 60, min: 4, max: 16 },
      { itemId: "bones", weight: 60, min: 1, max: 1 },
      { itemId: "raw_rat_meat", weight: 40, min: 1, max: 1 },
    ],
    tertiary: [{ itemId: "goblin_key", chance: 0.08, min: 1, max: 1 }],
    petTable: [{ itemId: "pet_goblin", chance: 0.004 }],
    respawnMs: 30_000,
  },
};

/** Render variants keyed by monster id for the procedural generator. */
export const MONSTER_STYLES: Record<string, { body: string; accent: string; ears?: boolean }> = {
  giant_rat: { body: "#9a8a6f", accent: "#d98fb0", ears: true },
  goblin: { body: "#6fae55", accent: "#c0392b", ears: true },
  skeleton: { body: "#d8ceb8", accent: "#8e8468" },
  zombie: { body: "#7c9a6a", accent: "#4a6a54" },
  dire_wolf: { body: "#6b6f7d", accent: "#3c3f4a", ears: true },
  goblin_archer: { body: "#7a9a5a", accent: "#4a3a26", ears: true },
  forest_ogre: { body: "#5f4e3c", accent: "#c98f4a", ears: true },
  cave_bat: { body: "#4a4450", accent: "#c98f4a", ears: true },
  cave_slasher: { body: "#5f6a6e", accent: "#c0392b", ears: true },
  cave_brute: { body: "#6b7280", accent: "#a32a3a", ears: true },
  frost_imp: { body: "#a9cfe0", accent: "#3f6f96", ears: true },
  bog_husk: { body: "#4d5f3c", accent: "#7a5828", ears: true },
};

/** Food that triggers auto-eat, by item id. */
export interface FoodDef { heal: number; tier: number; }
export const FOODS: Record<string, FoodDef> = {
  raw_rat_meat: { heal: 3, tier: 1 },
  cooked_rat_meat: { heal: 4, tier: 1 },
  cooked_shrimp: { heal: 6, tier: 2 },
  shrimp_food: { heal: 6, tier: 2 },
  baked_potato: { heal: 9, tier: 2 },
  cooked_trout: { heal: 14, tier: 3 },
  cabbage_stew: { heal: 20, tier: 3 },
 combat_potion: { heal: 30, tier: 4 },
};

export function getWeapon(itemId: string | null): WeaponDef {
  if (!itemId) return WEAPONS.fists;
  for (const w of Object.values(WEAPONS)) if (w.itemId === itemId) return w;
  return WEAPONS.fists;
}

/** Rough power ordering — what "best" means when auto-picking a weapon. */
function weaponScore(w: WeaponDef): number {
  // Damage per tick plus accuracy, so a fast dagger can beat a slow 2H on
  // sustained damage rather than on the max-hit number alone.
  return (w.maxHit / w.ticks) * 10 + w.accuracy;
}

/**
 * The single answer to "what is the hero swinging?".
 *
 * The equipped slot wins when the hero still carries that item and meets its
 * Attack requirement; otherwise the best *usable* carried weapon; otherwise
 * fists. `requiredAttack` is enforced here, which is the point — there were
 * three separate implementations of this (combat, the UI panel, and a helper),
 * none of which checked it, so a level-1 hero swung an iron sword that needs
 * Attack 10 and the stats panel could name a different weapon than the one
 * combat was actually using.
 */
export function selectWeapon(
  inv: InventoryComponent,
  equippedItemId: string | null | undefined,
  attackLevel: number
): WeaponDef {
  const carried = (id: string | null | undefined) => !!id && inv.items.some((i) => i.id === id);
  const usable = (w: WeaponDef) => w.requiredAttack <= attackLevel;

  if (carried(equippedItemId)) {
    const eq = getWeapon(equippedItemId ?? null);
    if (eq.itemId && usable(eq)) return eq;
  }

  let best = WEAPONS.fists;
  for (const w of Object.values(WEAPONS)) {
    if (!w.itemId || !carried(w.itemId) || !usable(w)) continue;
    if (weaponScore(w) > weaponScore(best)) best = w;
  }
  return best;
}