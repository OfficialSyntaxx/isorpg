// Central, decoupled game state. Components carry data; systems read/write it.
import type { PositionComponent } from "../components/Position";
import type { HealthComponent } from "../components/Health";
import type { SkillComponent } from "../components/Skills";
import type { InventoryComponent } from "../components/Inventory";
import type { Grid } from "../world/Grid";
import type { ResourceNode } from "../world/ResourceNode";
import { createPosition } from "../components/Position";
import { createHealth } from "../components/Health";
import { createSkillComponent } from "../components/Skills";
import { createInventory } from "../components/Inventory";

export const SAVE_VERSION = "1.0.0";

export interface GameState {
  version: string;
  timestamp: number;
  player: {
    name: string;
    pos: PositionComponent;
    health: HealthComponent;
    skills: SkillComponent;
    inventory: InventoryComponent;
  };
  world: {
    grid: Grid;
    nodes: Map<string, ResourceNode>;
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
    },
    world: { grid, nodes: new Map() },
    collectionLog: new Set(),
  };
}