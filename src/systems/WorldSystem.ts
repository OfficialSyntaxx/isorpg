// WorldSystem: builds the tile meshes, spawns deterministic resource nodes,
// and answers "what is on this tile" for the input/routing logic.
import * as THREE from "three";
import type { Grid } from "../world/Grid";
import type { ResourceNode, NodeType } from "../world/ResourceNode";
import { getTerrainMaterial, getBaseMaterial } from "../generators/Materials";
import { makeTree, makeRock, makeFishingMarker } from "../generators/Nature";
import { RESOURCES, type ResourceDef } from "../data/Skills";
import { nodeKey } from "../world/ResourceNode";
import { EngineLogger } from "../utils/Logger";

export interface WorldCallbacks {
  onNodeDepleted?: (node: ResourceNode) => void;
}

export class WorldSystem {
  readonly scene: THREE.Scene;
  readonly grid: Grid;
  private nodeGroup: THREE.Group;
  private cb: WorldCallbacks = {};
  private respawnTimers = new Map<string, number>();

  constructor(scene: THREE.Scene, grid: Grid) {
    this.scene = scene;
    this.grid = grid;
    this.nodeGroup = new THREE.Group();
    scene.add(this.nodeGroup);
    this.buildTerrain();
    this.spawnResources();
  }

  setCallbacks(cb: WorldCallbacks) { this.cb = cb; }

  private buildTerrain() {
    const root = new THREE.Group();
    root.name = "terrain";

    // Base slab under everything (dark earth)
    const baseGeo = new THREE.PlaneGeometry(this.grid.width, this.grid.height);
    baseGeo.rotateX(-Math.PI / 2);
    const base = new THREE.Mesh(baseGeo, getBaseMaterial());
    base.position.set(this.grid.width / 2 - 0.5, -0.12, this.grid.height / 2 - 0.5);
    root.add(base);

    const yFor = (elev: number) => elev * 0.6 + 0.3;
    for (let gy = 0; gy < this.grid.height; gy++) {
      for (let gx = 0; gx < this.grid.width; gx++) {
        const t = this.grid.at(gx, gy)!;
        const mat = getTerrainMaterial(t.terrainType);
        const geo = new THREE.BoxGeometry(1, 0.6, 1);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(gx, yFor(t.elevation), gy);
        mesh.receiveShadow = true;
        mesh.userData.tile = { x: gx, y: gy };
        root.add(mesh);
      }
    }
    this.scene.add(root);
  }

  /** Deterministically place resources from the grid seed. */
  private spawnResources() {
    const g = this.grid;
    let treeCount = 0, rockCount = 0, fishCount = 0;
    for (let gy = 1; gy < g.height - 1; gy++) {
      for (let gx = 1; gx < g.width - 1; gx++) {
        const t = g.at(gx, gy)!;
        // Only interior, walkable tiles in unlocked-ish regions get nodes.
        if (!t.walkable) continue;
        if (t.zoneId === "WILDERNESS_LVL1" && !g.isRegionUnlocked(gx, gy)) continue;

        const rnd = seeded(gx, gy);
        const r = rnd();

        if (t.terrainType === "GRASS" && r < 0.22 && treeCount < 26) {
          const tier = pickTree(gx, gy);
          this.spawnNode("TREE", gx, gy, tier);
          treeCount++;
        } else if ((t.terrainType === "DIRT" || t.terrainType === "GRASS") && r >= 0.22 && r < 0.30 && rockCount < 14) {
          const tier = pickRock(gx, gy);
          this.spawnNode("ROCK", gx, gy, tier);
          rockCount++;
        }
      }
    }
    // Fishing spots on interior water
    for (let gy = 1; gy < g.height - 1; gy++) {
      for (let gx = 1; gx < g.width - 1; gx++) {
        const t = g.at(gx, gy)!;
        if (t.terrainType === "WATER" && fishCount < 6 && t.zoneId !== "WILDERNESS_LVL1") {
          const rnd = seeded(gx + 500, gy + 500);
          if (rnd() < 0.4) {
            this.spawnNode("WATER", gx, gy, pickFish(gx, gy));
            fishCount++;
          }
        }
      }
    }
    EngineLogger.info(`Spawned ${treeCount} trees, ${rockCount} rocks, ${fishCount} fishing spots`);
  }

  private spawnNode(type: NodeType, gx: number, gy: number, def: ResourceDef) {
    const id = nodeKey(type, gx, gy);
    const group = this.buildNodeMesh(type, def, gx, gy);
    group.position.set(gx, 0, gy);
    // Fishing spots sit at water level
    if (type === "WATER") group.position.y = 0.16;
    const node: ResourceNode = {
      id, defId: def.masteryKey, def, type,
      tile: { x: gx, y: gy },
      remaining: def.depletes ? def.maxUses ?? 5 : undefined,
      group,
      respawnAt: 0,
      depleted: false,
    };
    this.grid.setOccupant(gx, gy, "RESOURCE_NODE", id);
    this.nodeGroup.add(group);
    // Not in state map here — spawned fresh each load. Register on the live grid.
    this.nodes.set(id, node);
  }

  private buildNodeMesh(type: NodeType, def: ResourceDef, gx: number, gy: number): THREE.Group {
    const rnd = seeded(gx, gy);
    const variant = Math.floor(rnd() * 1000);
    if (type === "TREE") return makeTree(variant + def.levelReq);
    if (type === "ROCK") return makeRock(variant + def.levelReq);
    // WATER fishing spot
    const spot = new THREE.Group();
    spot.add(makeFishingMarker());
    spot.rotation.y = rnd() * Math.PI;
    return spot;
  }

  // Live registry (kept in Parallel to the grid occupants)
  private nodes = new Map<string, ResourceNode>();

  get nodeRegistry() { return this.nodes; }

  nodeAt(gx: number, gy: number): ResourceNode | null {
    const t = this.grid.at(gx, gy);
    if (t && t.occupant === "RESOURCE_NODE" && t.occupantId) {
      return this.nodes.get(t.occupantId) ?? null;
    }
    return null;
  }

  /** Called on a tick: any depleted node past its respawn timer comes back. */
  updateRespawns(now: number) {
    for (const node of this.nodes.values()) {
      if (node.depleted && node.respawnAt > 0 && now >= node.respawnAt) {
        node.depleted = false;
        node.respawnAt = 0;
        node.remaining = node.def.maxUses ?? 5;
        node.group.visible = true;
        this.cb.onNodeDepleted?.(node);
      }
    }
  }

  /** Deplete/harvest result: reduce remaining, hide when empty. Returns new remaining. */
  consume(node: ResourceNode): number {
    if (node.def.depletes) {
      node.remaining = Math.max(0, (node.remaining ?? 1) - 1);
      if (node.remaining <= 0) {
        node.depleted = true;
        node.respawnAt = Date.now() + 30_000; // 30s respawn for milestone 1
        node.group.visible = false;
      }
    }
    return node.remaining ?? -1;
  }
}

function seeded(sx: number, sy: number): () => number {
  let a = sx * 374761393 + sy * 668265263;
  a = (a ^ (a >> 13)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickTree(gx: number, gy: number): ResourceDef {
  const rnd = seeded(gx * 3 + 1, gy * 3 + 1);
  const r = rnd();
  if (r < 0.6) return RESOURCES.tree_normal;
  if (r < 0.85) return RESOURCES.tree_oak;
  return RESOURCES.tree_willow;
}

function pickRock(gx: number, gy: number): ResourceDef {
  const rnd = seeded(gx * 5 + 2, gy * 5 + 2);
  const r = rnd();
  if (r < 0.4) return RESOURCES.rock_copper;
  if (r < 0.75) return RESOURCES.rock_tin;
  if (r < 0.9) return RESOURCES.rock_iron;
  return RESOURCES.rock_coal;
}

function pickFish(gx: number, gy: number): ResourceDef {
  const rnd = seeded(gx * 7 + 3, gy * 7 + 3);
  return rnd() < 0.5 ? RESOURCES.water_shrimp : RESOURCES.water_trout;
}