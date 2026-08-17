// Static NPC roster: the villagers who inhabit the settlement, the ambient
// critters, and each villager's labour specialization.
//
// Data only — no three.js, no scene graph. NpcSystem gives these bodies and
// behaviour; keeping the definitions here means the wiki generator can read the
// cast (names, roles, dialogue, perks) straight from the same source the game
// runs on, so a line changed in one place cannot go stale in the other.

export interface NpcLines {
  nearCampfire: string[];
  nearStorage: string[];
  onPlaced: Record<string, string[]>;
  town: string[];
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  kind: "villager" | "critter";
  home: { x: number; y: number };
  radius: number;
  talk: string[];
  lines: NpcLines;
}

export const VILLAGERS: NpcDef[] = [
  {
    id: "bram", name: "Bram", title: "the Fisher", kind: "villager",
    home: { x: 9, y: 11 }, radius: 3,
    talk: [
      "\"The shrimp are biting today. The trout are deeper.\"",
      "\"Build a Smelter near the water if you fancy roasted fish.\"",
      "\"The pond freezes over at night — come back at dawn.\"",
    ],
    lines: {
      nearCampfire: ["\"Nothing beats a fire after a day at the water.\"", "\"The fire keeps the chill off my bones.\""],
      nearStorage: ["\"A full storehouse is a happy storehouse.\"", "\"Stash the catch before it goes off!\""],
      onPlaced: {
        CAMPFIRE: ["\"Now we can roast the day's catch!\""],
        STOREHOUSE: ["\"Room for my trout, at last.\""],
        STORAGE_BIN: ["\"A handy little crate. The fish won't mind.\""],
        default: ["\"The settlement grows. The waters are pleased.\""],
      },
      town: ["\"The settlement feeds more mouths each day.\"", "\"The water still holds secrets.\""],
    },
  },
  {
    id: "wren", name: "Wren", title: "the Woodcutter", kind: "villager",
    home: { x: 11, y: 9 }, radius: 3,
    talk: [
      "\"These oaks need a sharper axe than my old bronze.\"",
      "\"Planks come from logs, and logs come from work.\"",
      "\"Mind the goblins past the treeline.\"",
    ],
    lines: {
      nearCampfire: ["\"The fire's good for drying timber.\"", "\"Don't stand too close with that axe.\""],
      nearStorage: ["\"Logs, safe and sound.\"", "\"Keep the wood dry, keep it warm.\""],
      onPlaced: {
        CAMPFIRE: ["\"That fire will warm the whole yard.\""],
        SAWMILL: ["\"Now I can saw in comfort.\""],
        STORAGE_BIN: ["\"A dry place for my lumber.\""],
        default: ["\"Another building up. Good work.\""],
      },
      town: ["\"The forest gives, the town holds.\"", "\"These trees will fall for a good cause.\""],
    },
  },
  {
    id: "tobias", name: "Old Tobias", title: "Town Elder", kind: "villager",
    home: { x: 10, y: 10 }, radius: 2,
    talk: [
      "\"The settlement grows with every log you haul home.\"",
      "\"A Storage Bin is cheap — build one before your pouch bursts.\"",
      "\"Bury the bones. It's only proper.\"",
    ],
    lines: {
      nearCampfire: ["\"Where there's fire, there's folk.\"", "\"The town is alive at night around the fire.\""],
      nearStorage: ["\"A town that stores well, lasts well.\"", "\"Tidy stores, tidy minds.\""],
      onPlaced: {
        TOWN_HALL: ["\"The seat of the settlement stands at last.\""],
        CAMPFIRE: ["\"The heart of the town — the fire.\""],
        STOREHOUSE: ["\"Our larder grows. The winter fears us now.\""],
        default: ["\"A fine addition to the town.\""],
      },
      town: ["\"One day this will be a city.\"", "\"The town remembers every helping hand.\""],
    },
  },
];

export const CRITTERS: NpcDef[] = [
  { id: "rabbit_a", name: "Rabbit", title: "", kind: "critter", home: { x: 8, y: 9 }, radius: 4, talk: ["It hops off before you can grab it!"], lines: { nearCampfire: [], nearStorage: [], onPlaced: {}, town: [] } },
  { id: "rabbit_b", name: "Rabbit", title: "", kind: "critter", home: { x: 12, y: 12 }, radius: 4, talk: ["It twitches its nose and scampers away."], lines: { nearCampfire: [], nearStorage: [], onPlaced: {}, town: [] } },
];


/** P7.6: veteran tiers — cumulative worked hours raise the yield multiplier. */
export const VETERAN_TIERS: [minMs: number, label: string, mult: number][] = [
  [0, "New hand", 1],
  [2 * 3_600_000, "Veteran", 2],
  [8 * 3_600_000, "Reliable", 3],
  [20 * 3_600_000, "Master", 4],
];

export function veteranTier(workedMs: number): { label: string; mult: number } {
  let cur = { label: VETERAN_TIERS[0][1], mult: VETERAN_TIERS[0][2] };
  for (const [min, label, mult] of VETERAN_TIERS) if (workedMs >= min) cur = { label, mult };
  return cur;
}

export function hoursLabel(ms: number): string {
  return `${Math.floor(ms / 3_600_000)}h`;
}

/** P7.7: lore specializations — each villager brings a small unique perk. */
export interface VillagerSpec {
  role: string;
  perkName: string;
  icon: string;
  item?: string;   // per-cycle extra into the village stock
  coins?: number;  // per-cycle coin tribute
}
export const VILLAGER_SPECS: Record<string, VillagerSpec> = {
  bram: { role: "Fisher", perkName: "Fresh Catch", icon: "🎣", item: "raw_shrimp" },
  wren: { role: "Woodcutter", perkName: "Fine Timber", icon: "🪓", item: "oak_log" },
  tobias: { role: "Elder", perkName: "Elder's Due", icon: "🏛️", coins: 1 },
};
