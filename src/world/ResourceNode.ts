// Resource node entity: the data describing a harvestable node + its meshes.
import * as THREE from "three";
import type { ResourceDef } from "../data/Skills";

export type NodeType = "TREE" | "ROCK" | "WATER";

export interface ResourceNode {
  id: string;
  defId: string;
  def: ResourceDef;
  type: NodeType;
  tile: { x: number; y: number };
  // Remaining harvests before the node depletes (undefined = infinite).
  remaining?: number;
  // Mesh(s) shown in the world.
  group: THREE.Group;
  // Growing back timer in ms (depleted trees/rocks respawn).
  respawnAt: number;
  depleted: boolean;
}

export function nodeKey(type: NodeType, x: number, y: number): string {
  return `${type}_${x}_${y}`;
}