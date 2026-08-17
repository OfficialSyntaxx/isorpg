// Central, decoupled game state. Components carry data; systems read/write it.
import type { PositionComponent } from "../components/Position";
import type { HealthComponent } from "../components/Health";
import type { SkillComponent } from "../components/Skills";
import type { InventoryComponent } from "../components/Inventory";
import type { Grid } from "../world/Grid";
import type { FarmPlot } from "../data/Farming";
import type { ActiveClue } from "../data/Clues";
import type { ResourceNode } from "../world/ResourceNode";
import type { BuildingType } from "../data/Buildings";
import type { EquipSlot } from "../data/Items";
import type { AttackStyle } from "../data/Combat";
import { DEFAULT_ATTACK_STYLE } from "../data/Combat";
import { createPosition } from "../components/Position";
import { createHealth } from "../components/Health";
import { createSkillComponent } from "../components/Skills";
import { createInventory } from "../components/Inventory";

/**
 * 10:00 — a new hero opens in clear mid-morning light.
 *
 * dayFactor() ramps 06:30 → 12:30, so 08:00 is only 0.25 daylight (ambient 0.36,
 * sun 0.40) — still visibly gloomy. 10:00 gives 0.58, which reads as daytime
 * without pinning the clock at noon.
 */
export const DAY_START_MINUTE = 10 * 60;

/**
 * Bump when a stored field changes meaning, not merely when fields are added —
 * the sanitizer migrates by version, and a value silently reinterpreted on a new
 * scale is worse than a missing one.
 *
 * 1.1.0 — mastery XP moved off the OSRS skill curve onto its own triangular
 *         curve at 1 XP per unit (was 4).
 */
/**
 * The player character: a young mystic apprentice. Named to sit alongside the
 * settlement's cast — Bram, Wren, Tobias, Eldric — and after the corvid its
 * plum-black robe echoes.
 */
export const DEFAULT_HERO_NAME = "Corvin";

export const SAVE_VERSION = "1.1.0";

export interface TownBuilding {
  id: string;
  type: BuildingType;
  x: number;
  y: number;
  level: number;
}

export interface GameState {
  version: string;
  timestamp: number;
  player: {
    name: string;
    pos: PositionComponent;
    health: HealthComponent;
    skills: SkillComponent;
    inventory: InventoryComponent;
    /** P2 equipment: which item is in each slot (itemId). */
    equipped: Partial<Record<EquipSlot, string>>;
    /** P6: world-map state — discovered points of interest + fast-travel. */
    map: { discovered: string[]; fastTravel: boolean; explored: number[] };
    /** P6.3: quest-log — ids of quests the player has completed (persisted). */
    journal: string[];
    /** The one clue hunt in progress, or null. Persisted; see ClueSystem. */
    clue: ActiveClue | null;
    /** P6.4: meta-progress — kill tallies + unlocked achievements (persisted). */
    meta: { kills: Record<string, number>; achievements: string[]; counters: Record<string, number> };
  };
  world: {
    grid: Grid;
    nodes: Map<string, ResourceNode>;
  };
  /** P-A: in-game clock. Persisted so the time of day survives a reload
   *  instead of resetting to midnight on every launch. */
  clock: { minute: number; day: number };
  town: {
    buildings: TownBuilding[];
    /** P7.3: villager labour — job assignments + the village stock they fill. */
    labour: {
      assignments: Record<string, "woodcutting" | "mining">;
      stock: Record<string, number>;
      acc: Record<string, number>; // ms accrued per villager since last output
      /** P7.6: ms each villager has worked (drives veteran yield tiers). */
      worked: Record<string, number>;
    };
    /** P7.8: market supply/demand — sold/bought volume per item (persisted). */
    market: { supply: Record<string, number>; demand: Record<string, number> };
    /**
     * Farming beds, addressed by index. null = empty.
     *
     * A bed stores only the seed and the epoch ms it was sown, so growth is a
     * function of Date.now() — no accumulated progress to persist, and no offline
     * catch-up pass that could pay out twice.
     */
    farm: { plots: (FarmPlot | null)[] };
  };
  collectionLog: Set<string>;
  /** Player-tunable preferences. Persisted so a choice survives a reload. */
  settings: {
    /**
     * Auto-eat trigger, as a percentage of max HP (0 = never).
     *
     * Was a hardcoded 40%: too eager for a player stretching food across a long
     * trip, too late for one fighting something that can two-shot them.
     */
    autoEatPct: number;
    /** F.1: the fight stance — shifts accuracy/max-hit/defense and which skill trains. */
    attackStyle: AttackStyle;
  };
}

/** Selectable auto-eat thresholds, in percent of max HP. 0 disables it. */
export const AUTO_EAT_STEPS = [0, 20, 30, 40, 50, 60, 75] as const;
export const DEFAULT_AUTO_EAT_PCT = 40;

/** Build a fresh state with a given grid (world wiring added by the world system). */
export function createFreshState(grid: Grid, name: string = DEFAULT_HERO_NAME, startX = 10, startY = 10): GameState {
  return {
    version: SAVE_VERSION,
    timestamp: Date.now(),
    player: {
      name,
      pos: createPosition(startX, startY),
      health: createHealth(100),
      skills: createSkillComponent(),
      inventory: createInventory(),
      equipped: {},
      map: { discovered: [], fastTravel: false, explored: [] },
      journal: [],
      clue: null,
      meta: { kills: {}, achievements: [], counters: {} },
    },
    world: { grid, nodes: new Map() },
    clock: { minute: DAY_START_MINUTE, day: 1 },
    town: {
      buildings: [],
      labour: { assignments: {}, stock: {}, acc: {}, worked: {} },
      market: { supply: {}, demand: {} },
      farm: { plots: [] },
    },
    collectionLog: new Set(),
    settings: { autoEatPct: DEFAULT_AUTO_EAT_PCT, attackStyle: DEFAULT_ATTACK_STYLE },
  };
}