// Settlement structures: placement cost, requirements, passive yields (GDD §5.B).
export type BuildingType = "STORAGE_BIN" | "CAMPFIRE" | "TOWN_HALL" | "STOREHOUSE" | "SAWMILL" | "SMELTER" | "GRANARY";

export interface BuildingCost {
  itemId: string;
  qty: number;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  icon: string;
  desc: string;
  effect: string;
  levelReq: number; // Construction level required to place
  maxCount: number; // instances allowed per save
  baseCost: BuildingCost[];
  buildXp: number;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  STORAGE_BIN: {
    type: "STORAGE_BIN",
    name: "Storage Bin",
    icon: "📦",
    desc: "A humble wooden crate for extra resources — perfect for new settlers.",
    effect: "+50 inventory storage cap",
    levelReq: 0,
    maxCount: 5,
    baseCost: [{ itemId: "normal_log", qty: 5 }],
    buildXp: 25,
  },
  CAMPFIRE: {
    type: "CAMPFIRE",
    name: "Campfire",
    icon: "🔥",
    desc: "A crackling fire where villagers gather and food cooks faster.",
    effect: "Cooking 25% faster · villagers gather here",
    levelReq: 0,
    maxCount: 3,
    baseCost: [{ itemId: "normal_log", qty: 6 }],
    buildXp: 20,
  },
  TOWN_HALL: {
    type: "TOWN_HALL",
    name: "Town Hall",
    icon: "🏛️",
    desc: "Seat of the settlement. Taxes citizens and extends how long the town can run while you're away.",
    effect: "+4h max offline idle capacity, +2 coins/tick passive tax",
    levelReq: 1,
    maxCount: 1,
    baseCost: [{ itemId: "coins", qty: 200 }, { itemId: "plank", qty: 10 }],
    buildXp: 300,
  },
  STOREHOUSE: {
    type: "STOREHOUSE",
    name: "Storehouse",
    icon: "🏚️",
    desc: "Expands bulk resource storage so gathering runs don't cap out early.",
    effect: "+250 inventory storage cap",
    levelReq: 1,
    maxCount: 3,
    baseCost: [{ itemId: "coins", qty: 150 }, { itemId: "plank", qty: 20 }],
    buildXp: 150,
  },
  SAWMILL: {
    type: "SAWMILL",
    name: "Sawmill",
    icon: "🪵",
    desc: "Automatically saws stray logs into construction planks over time.",
    effect: "Passively converts 1 log → 1 plank per cycle",
    levelReq: 5,
    maxCount: 2,
    baseCost: [{ itemId: "coins", qty: 120 }, { itemId: "normal_log", qty: 15 }],
    buildXp: 180,
  },
  SMELTER: {
    type: "SMELTER",
    name: "Smelter",
    icon: "🔥",
    desc: "A standing furnace. Required to actively smith bars, and passively smelts spare ore.",
    effect: "Unlocks Smithing recipes; passively converts ore → bars per cycle",
    levelReq: 10,
    maxCount: 2,
    baseCost: [{ itemId: "coins", qty: 150 }, { itemId: "copper_ore", qty: 10 }, { itemId: "tin_ore", qty: 10 }],
    buildXp: 220,
  },
  GRANARY: {
    type: "GRANARY",
    name: "Granary",
    icon: "🌾",
    desc: "Boosts food production and town growth with a slow trickle of raw provisions.",
    effect: "Passively produces raw shrimp per cycle",
    levelReq: 8,
    maxCount: 2,
    baseCost: [{ itemId: "coins", qty: 100 }, { itemId: "plank", qty: 8 }],
    buildXp: 160,
  },
};

export const BUILDING_TYPES: BuildingType[] = ["STORAGE_BIN", "CAMPFIRE", "TOWN_HALL", "STOREHOUSE", "SAWMILL", "SMELTER", "GRANARY"];
