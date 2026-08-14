// Skill definitions shared by components, systems and UI.

export type SkillId =
  | "woodcutting" | "mining" | "fishing"
  | "cooking" | "smithing" | "carpentry" | "construction"
  | "attack" | "strength" | "defense" | "hitpoints";

export interface SkillDef {
  id: SkillId;
  name: string;
  short: string;
  icon: string; // emoji placeholder, glyph-free procedural later
  kind: "gathering" | "artisan" | "combat_lvl" | "combat_skill";
  // Resource node / action types this skill drives
  nodeKind?: "TREE" | "ROCK" | "WATER";
}

export const SKILLS: Record<SkillId, SkillDef> = {
  woodcutting: { id: "woodcutting", name: "Woodcutting", short: "WC", icon: "🪓", kind: "gathering", nodeKind: "TREE" },
  mining: { id: "mining", name: "Mining", short: "MIN", icon: "⛏️", kind: "gathering", nodeKind: "ROCK" },
  fishing: { id: "fishing", name: "Fishing", short: "FISH", icon: "🎣", kind: "gathering", nodeKind: "WATER" },
  cooking: { id: "cooking", name: "Cooking", short: "COOK", icon: "🍳", kind: "artisan" },
  smithing: { id: "smithing", name: "Smelting", short: "SMITH", icon: "🔨", kind: "artisan" },
  carpentry: { id: "carpentry", name: "Carpentry", short: "CARP", icon: "🪚", kind: "artisan" },
  construction: { id: "construction", name: "Construction", short: "CON", icon: "🏗️", kind: "artisan" },
  attack: { id: "attack", name: "Attack", short: "ATK", icon: "⚔️", kind: "combat_skill" },
  strength: { id: "strength", name: "Strength", short: "STR", icon: "💪", kind: "combat_skill" },
  defense: { id: "defense", name: "Defense", short: "DEF", icon: "🛡️", kind: "combat_skill" },
  hitpoints: { id: "hitpoints", name: "Hitpoints", short: "HP", icon: "❤️", kind: "combat_lvl" },
};

export const SKILL_IDS: SkillId[] = [
  "attack", "strength", "defense", "hitpoints", "cooking", "smithing", "carpentry", "construction", "woodcutting", "mining", "fishing",
];
/** Skills craftable via the Craft panel (artisan, excludes construction which uses the Build panel). */
export const CRAFT_SKILLS: SkillId[] = ["cooking", "smithing", "carpentry"];
/** The three skills visible in the gather quick-bar (M1 era) + combat trio. */
export const GATHER_SKILLS: SkillId[] = ["woodcutting", "mining", "fishing"];
export const COMBAT_SKILLS: SkillId[] = ["attack", "strength", "defense", "hitpoints"];

export interface ResourceDrop {
  itemId: string;
  weight: number; // relative weight within the drop table
  min: number;
  max: number;
}

export interface ResourceDef {
  nodeType: "TREE" | "ROCK" | "WATER";
  skill: SkillId;
  // Identifier key for mastery (e.g. "oak").
  masteryKey: string;
  // Level required to harvest this node type.
  levelReq: number;
  // Time in ticks (600ms) per gathering action.
  ticksPerAction: number;
  // Units yielded per action (before mastery/double bonuses).
  yield: number;
  drops: ResourceDrop[];
  // Whether the node depletes and respawns, or is infinite.
  depletes: boolean;
  maxUses?: number;
}

export const RESOURCES: Record<string, ResourceDef> = {
  tree_normal: {
    nodeType: "TREE", skill: "woodcutting", masteryKey: "normal", levelReq: 1,
    ticksPerAction: 15, yield: 1,
    drops: [{ itemId: "normal_log", weight: 1, min: 1, max: 1 }],
    depletes: true, maxUses: 4,
  },
  tree_oak: {
    nodeType: "TREE", skill: "woodcutting", masteryKey: "oak", levelReq: 15,
    ticksPerAction: 22, yield: 1,
    drops: [{ itemId: "oak_log", weight: 1, min: 1, max: 1 }],
    depletes: true, maxUses: 6,
  },
  tree_willow: {
    nodeType: "TREE", skill: "woodcutting", masteryKey: "willow", levelReq: 30,
    ticksPerAction: 28, yield: 1,
    drops: [{ itemId: "willow_log", weight: 1, min: 1, max: 1 }],
    depletes: true, maxUses: 8,
  },
  rock_copper: {
    nodeType: "ROCK", skill: "mining", masteryKey: "copper", levelReq: 1,
    ticksPerAction: 20, yield: 1,
    drops: [{ itemId: "copper_ore", weight: 1, min: 1, max: 1 }],
    depletes: true, maxUses: 5,
  },
  rock_tin: {
    nodeType: "ROCK", skill: "mining", masteryKey: "tin", levelReq: 1,
    ticksPerAction: 20, yield: 1,
    drops: [{ itemId: "tin_ore", weight: 1, min: 1, max: 1 }],
    depletes: true, maxUses: 5,
  },
  rock_iron: {
    nodeType: "ROCK", skill: "mining", masteryKey: "iron", levelReq: 15,
    ticksPerAction: 26, yield: 1,
    drops: [{ itemId: "iron_ore", weight: 1, min: 1, max: 1 }],
    depletes: true, maxUses: 6,
  },
  rock_coal: {
    nodeType: "ROCK", skill: "mining", masteryKey: "coal", levelReq: 30,
    ticksPerAction: 32, yield: 1,
    drops: [{ itemId: "coal", weight: 1, min: 1, max: 1 }],
    depletes: true, maxUses: 7,
  },
  water_shrimp: {
    nodeType: "WATER", skill: "fishing", masteryKey: "shrimp", levelReq: 1,
    ticksPerAction: 12, yield: 1,
    drops: [{ itemId: "raw_shrimp", weight: 1, min: 1, max: 1 }],
    depletes: false,
  },
  water_trout: {
    nodeType: "WATER", skill: "fishing", masteryKey: "trout", levelReq: 20,
    ticksPerAction: 18, yield: 1,
    drops: [{ itemId: "raw_trout", weight: 1, min: 1, max: 1 }],
    depletes: false,
  },
};