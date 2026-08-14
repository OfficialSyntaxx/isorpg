// WorldSystem: terrain, procedural clutter, animated water, sky, resource
// nodes and monster spawning (deterministic from the grid seed).
import * as THREE from "three";
import type { Grid } from "../world/Grid";
import type { ResourceNode, NodeType } from "../world/ResourceNode";
import { getTerrainMaterial, getBaseMaterial } from "../generators/Materials";
import { makeTree, makeRock, makeFishingMarker, buildClutter, makeWaterMaterial, makeSkyTexture } from "../generators/Nature";
import { RESOURCES, type ResourceDef } from "../data/Skills";
import { nodeKey } from "../world/ResourceNode";
import { EngineLogger } from "../utils/Logger";
import type { CombatSystem } from "../systems/CombatSystem";
import { MONSTERS } from "../data/Combat";
import { spawnMonster } from "../world/Monster";

export interface WorldCallbacks {
  onNodeDepleted?: (node: ResourceNode) => void;
}

export class WorldSystem {
  readonly scene: THREE.Scene;
  readonly grid: Grid;
  private nodeGroup: THREE.Group;
  private cb: WorldCallbacks = {};
  private respawnTimers = new Map<string, number>();
  private nodes = new Map<string, ResourceNode>();
  private combat: CombatSystem;
  private waterMat: THREE.ShaderMaterial | null = null;
  private waterNode: THREE.Object3D | null = null;

  constructor(scene: THREE.Scene, grid: Grid, combat: Combat) {
    this.scene = scene;
    this.grid = grid;
    this.combat = combat;
    this.nodeGroup = new THREE.Group();
    scene.add(this.nodeGroup);
    this.buildTerrain();
    this.buildSky();
    this.buildClutter();
    this.spawnResources();
    this.spawnMonsters();
  }

  setCallbacks(cb: WorldCallbacks) { this.cb = cb; }

  private buildSky() {
    this.scene.background = makeSkyTexture();
    this.scene.fog = new THREE.Fog(0xe8d9b0, 42, 88);
  }

  private buildTerrain() {
    const root = new THREE.Group();
    root.name = "terrain";
    const baseGeo = new THREE.PlaneGeometry(this.grid.width, this.grid.height);
    baseGeo.rotateX(-Math.PI / 2);
    const base = new THREE.Mesh(baseGeo, getBaseMaterial());
    base.position.set(this.grid.width / 2 - 0.5, -0.14, this.grid.height / 2 - 0.5);
    root.add(base);

    const yFor = (elev: number) => elev * 0.6 + 0.3;
    const waterTiles: { x: number; y: number }[] = [];
    for (let gy = 0; gy < this.grid.height; gy++) {
      for (let gx = 0; gx < this.grid.width; gx++) {
        const t = this.grid.at(gx, gy)!;
        const mat = getTerrainMaterial(t.terrainType);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1), mat);
        mesh.position.set(gx, yFor(t.elevation), gy);
        mesh.receiveShadow = true;
        mesh.userData.tile = { x: gx, y: gy };
        root.add(mesh);
        if (t.terrainType === "WATER") waterTiles.push({ x: gx, y: gy });
      }
    }
    this.scene.add(root);
    this.buildWater(waterTiles, yFor(-0.25) + 0.15 + 0.015);
  }

  /** One animated plane hugging only the water tiles. */
  private buildWater(tiles: { x: number; y: number }[], y: number) {
    if (!tiles.length) return;
    const shape = new THREE.Shape();
    tiles.forEach((t, i) => {
      const x = t.x - 0.5, z = t.y - 0.5;
      if (i === 0) shape.moveTo(x, z);
      shape.lineTo(x + 1, z);
      shape.lineTo(x + 1, z + 1);
      shape.lineTo(x, z + 1);
      shape.lineTo(x, z);
    });
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    this.waterNode = makeWaterMaterial();
    const plane = new THREE.Mesh(geo, this.waterNode);
    plane.position.y = y;
    plane.renderOrder = 1;
    this.scene.add(plane);
  }

  private buildClutter() {
    const tiles = [];
    for (let gy = 1; gy < this.grid.height - 1; gy++) {
      for (let gx = 1; gx < this.grid.width - 1; gx++) {
        const t = this.grid.at(gx, gy)!;
        tiles.push({ x: gx, y: gy, terrain: t.terrainType, seed: t.seed });
      }
    }
    this.scene.add(buildClutter(tiles));
  }

  /** Deterministically place resources from the grid seed. */
  private spawnResources() {
    const g = this.grid;
    let treeCount = 0, rockCount = 0, fishCount = 0;
    for (let gy = 1; gy < g.height - 1; gy++) {
      for (let gx = 1; gx < g.width - 1; gx++) {
        const t = g.at(gx, gy)!;
        if (!t.walkable || t.occupant !== "NONE") continue;
        if (t.zoneId === "WILDERNESS_LVL1") continue;
        const rnd = seeded(t.seed);
        const r = rnd();
        if (t.terrainType === "GRASS" && r < 0.22 && treeCount < 26) {
          this.spawnNode("TREE", gx, gy, pickTree1(gx, gy));
          treeCount++;
        } else if ((t.terrainType === "DIRT" || t.terrainType === "GRASS") && r >= 0.22 && r < 0.30 && rockCount < 14) {
          this.spawnNode("ROCK", gx, gy, pickRock(gx, gy));
          rockCount++;
        }
      }
    }
    for (let gy = 1; gy < g.height - 1; gy++) {
      for (let gx = 1; gx < g.width - 1; gx++) {
        const t = g.at(gx, gy)!;
        if (t.terrainType === "WATER" && fishCount < 6 && t.zoneId !== "WILDERNESS_LVL1") {
          const rnd = seeded(t.seed + 500);
          if (rnd() < 0.4) { this.spawnNode("WATER", gx, gy, pickFish(gx, gy)); fishCount++; }
        }
      }
    }
    EngineLogger.info(`Spawned ${treeCount} trees, ${rockCount} rocks, ${fishCount} fishing spots`);
  }

  private spawnNode(type: NodeType, gx: number, gy: number, def: ResourceDef) {
    const id = nodeKey(type, gx, gy);
    const group = this.buildNodeMesh(type, def, gx, gy);
    group.position.set(gx, 0, gy);
    if (type === "WATER") group.position.y = 0.4;
    const node: ResourceNode = { id, defId: def.masteryKey, def, type, tile: { x: gx, y: gy }, remaining: def.depletes ? def.maxUses ?? 5 : undefined, group, respawnAt: 0, depleted: false };
    this.grid.setOccupant(gx, gy, "RESOURCE_NODE", id);
    this.nodeGroup.add(group);
    this.nodes.set(id, node);
  }

  private buildNodeMesh(type: NodeType, def: ResourceDef, gx: number, gy: number): THREE.Group {
    const variant = Math.floor(seeded(gx, gy)() * 1000);
    if (type === "TREE") return makeTree(variant + def.levelReq);
    if (type === "ROCK") return makeRock(variant + def.levelReq);
    const spot = new THREE.Group();
    spot.add(makeFishingMarker());
    spot.rotation.y = seeded(gx, gy)() * Math.PI;
    return spot;
  }

  get nodeRegistry() { return this.nodes; }

  nodeAt(gx: number, gy: number): ResourceNode | null {
    const t = this.grid.at(gx, gy);
    if (t && t.occupant === "RESOURCE_NODE" && t.occupantId) return this.nodes.get(t.occupantId) ?? null;
    return null;
  }

  updateRespawns(now: number) {
    for (const node of this.nodes.values()) {
      if (node.depleted && node.respawnAt > 0 && now >= node.respawnAt) {
        node.depleted = false;
        node.respawnAt = 0;
        node.resource = node.def.maxUses ?? 5;
        node.group.visible = true;
        this.cb.onNodeDepleted?.(node);
      }
    }
  }

  consume(node: ResourceNode): number {
    if (node.def.depletes) {
      node.remaining = Math.max(0, (node.remaining ?? 1) - 1);
      if (node.remaining <= 0) {
        node.depleted = true;
        node.respawnAt = Date.now() + 30_000;
        node.group.visible = false;
      }
    }
    return node.remaining ?? -1;
  }

  /** Advance animated water each frame. */
  update(timeMs: number) {
    if (this.waterNode) this.waterNode.uniforms.uTime.value = timeMs / 1000;
  }
}