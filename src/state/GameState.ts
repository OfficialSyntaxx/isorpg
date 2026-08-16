// Central, decoupled game state. Components carry data; systems read/write it.
import type { PositionComponent } from "../components/Position";
import type { HealthComponent } from "../components/Health";
import type { SkillComponent } from "../components/Skills";
import type { InventoryComponent } from "../components/Inventory";
import type { Grid } from "../world/Grid";
import type { ResourceNode } from "../world/ResourceNode";
import type { BuildingType } from "../data/Buildings";
import type { EquipSlot } from "../data/Items";
import { createPosition } from "../components/Position";
import { createHealth } from "../components/Health";
import { createSkillComponent } from "../components/Skills";
import { createInventory } from "../components/Inventory";

export const SAVE_VERSION = "1.0.0";

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
    /** P6.4: meta-progress — kill tallies + unlocked achievements (persisted). */
    meta: { kills: Record<string, number>; achievements: string[] };
  };
  world: {
    grid: Grid;
    nodes: Map<string, ResourceNode>;
  };
  town: {
    buildings: TownBuilding[];
    /** P7.3: villager labour — job assignments + the village stock they fill. */
    labour: {
      assignments: Record<string, "woodcutting" | "mining">;
      stock: Record<string, number>;
      acc: Record<string, number>; // ms accrued per villager since last output
    };
  };
  collectionLog: Set<string>;
}

/** Build a fresh state with a given grid (world wiring added by the world system). */
export function createFreshState(grid: Grid, name: string = "Hero", startX = 10, startY = 10): GameState {
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
      meta: { kills: {}, achievements: [] },
    },
    world: { grid, nodes: new Map() },
    town: { buildings: [], labour: { assignments: {}, stock: {}, acc: {} } },
    collectionLog: new Set(),
  };
}