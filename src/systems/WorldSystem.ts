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
import type { CombatSystem } from "./CombatSystem";
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
  private fog: THREE.Fog | null = null;

  constructor(scene: THREE.Scene, grid: Grid, combat: CombatSystem) {
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
    this.fog = this.scene.fog;
  }

  /** P3: tint fog from night (deep blue) to day (warm haze). */
  setDayNight(d: number) {
    if (this.fog) this.fog.color.lerpColors(new THREE.Color("#0d1626"), new THREE.Color("#e8d9b0"), d);
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
        // Per-tile brightness tint so adjacent ground isn't one flat sheet.
        const tint = seeded(t.seed * 7 + 3);
        const v = 0.9 + tint() * 0.18;
        const n = mesh.geometry.attributes.position.count;
        const colors = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { colors[i * 3] = v; colors[i * 3 + 1] = v; colors[i * 3 + 2] = v; }
        mesh.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
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
    this.waterMat = makeWaterMaterial();
    const plane = new THREE.Mesh(geo, this.waterMat);
    plane.position.y = y;
    plane.renderOrder = 2;
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
          this.spawnNode("TREE", gx, gy, pickTree(gx, gy, g));
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

  /** Spawn a deterministic monster population in the wilderness ring. */
  private spawnMonsters() {
    const g = this.grid;
    const layout: { type: keyof typeof MONSTERS; cap: number }[] = [
      { type: "giant_rat", cap: 4 },
      { type: "goblin", cap: 3 },
      { type: "skeleton", cap: 2 },
      { type: "zombie", cap: 1 },
    ];
    const counts: Record<string, number> = {};
    for (let gy = 1; gy < g.height - 1; gy++) {
      for (let gx = 1; gx < g.width - 1; gx++) {
        if (!g.isRegionUnlocked(gx, gy)) continue;
        const t = g.at(gx, gy)!;
        if (t.zoneId !== "WILDERNESS_LVL1") continue;
        if (!t.walkable || t.occupant !== "NONE") continue;
        const rnd = seeded(t.seed * 3 + 7);
        const r = rnd();
        const cx = Math.floor(g.width / 2), cy = Math.floor(g.height / 2);
        const d = Math.max(Math.abs(gx - cx), Math.abs(gy - cy));
        const pool: (keyof typeof MONSTERS)[] = d >= 8 ? ["skeleton", "zombie"] : ["giant_rat", "goblin"];
        const type = pool[Math.floor(r * pool.length) % pool.length] as keyof typeof MONSTERS;
        const defCfg = layout.find((l) => l.type === type)!;
        if ((counts[type] ?? 0) >= defCfg.cap) continue;
        if (r > 0.5) continue; // thin density
        const def = MONSTERS[type];
        const m = spawnMonster(type, def, gx, gy);
        this.combat.addMonster(m);
        this.nodeGroup.add(m.group);
        counts[type] = (counts[type] ?? 0) + 1;
      }
    }
    EngineLogger.info("Monsters: " + JSON.stringify(counts));
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
    const variant = Math.floor(seeded(gx * 131 + gy * 733)() * 1000);
    if (type === "TREE") return makeTree(variant + def.levelReq);
    if (type === "ROCK") return makeRock(variant + def.levelReq);
    const spot = new THREE.Group();
    spot.add(makeFishingMarker());
    spot.rotation.y = seeded(gx * 131 + gy * 733 + 1)() * Math.PI;
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
        node.remaining = node.def.maxUses ?? 5;
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
    if (this.waterMat) this.waterMat.uniforms.uTime.value = timeMs / 1000;
  }
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickTree(gx: number, gy: number, g: Grid): ResourceDef {
  // Starter grove: every tree in a ring right around the settlement centre is
  // a level-1 normal tree, so a brand-new player can ALWAYS start chopping.
  const cx = Math.floor(g.width / 2), cy = Math.floor(g.height / 2);
  const d = Math.max(Math.abs(gx - cx), Math.abs(gy - cy));
  if (d <= 5) return RESOURCES.tree_normal;
  const rnd = seeded(gx * 3 + gy * 3 + 1);
  const r = rnd();
  if (r < 0.55) return RESOURCES.tree_normal;
  if (r < 0.8) return RESOURCES.tree_oak;
  return RESOURCES.tree_willow;
}
function pickRock(gx: number, gy: number): ResourceDef {
  const rnd = seeded(gx * 5 + gy * 5 + 2);
  const r = rnd();
  if (r < 0.4) return RESOURCES.rock_copper;
  if (r < 0.75) return RESOURCES.rock_tin;
  if (r < 0.9) return RESOURCES.rock_iron;
  return RESOURCES.rock_coal;
}
function pickFish(gx: number, gy: number): ResourceDef {
  const rnd = seeded(gx * 7 + gy * 7 + 3);
  return rnd() < 0.5 ? RESOURCES.water_shrimp : RESOURCES.water_trout;
}