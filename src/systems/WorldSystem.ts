// WorldSystem: terrain, procedural clutter, animated water, sky, resource
// nodes and monster spawning (deterministic from the grid seed).
import * as THREE from "three";
import type { Grid, Biome } from "../world/Grid";
import type { ResourceNode, NodeType } from "../world/ResourceNode";
import { getTerrainMaterial, getBaseMaterial } from "../generators/Materials";
import { makeTree, makeRock, makeFishingMarker, buildClutter, makeWaterMaterial, makeSkyTexture } from "../generators/Nature";
import { RESOURCES, type ResourceDef } from "../data/Skills";
import { nodeKey } from "../world/ResourceNode";
import { EngineLogger } from "../utils/Logger";
import type { CombatSystem } from "./CombatSystem";
import { MONSTERS } from "../data/Combat";
import { spawnMonster } from "../world/Monster";
import { GROUND_Y } from "../core/Scale";

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
    // Ship with the procedural sky first (guaranteed, zero-asset), then hot-swap
    // the generated skybox panorama in when it loads; fall back silently on error.
    this.scene.background = makeSkyTexture();
    // The camera orbits at radius 55, so the scene sits roughly 30–85 units away.
    // A 42→88 ramp therefore fogged EVERYTHING, washing the whole map toward the
    // fog colour. Start the haze beyond the far edge of the play area so it reads
    // as depth at the horizon instead of a grey veil over the terrain.
    this.scene.fog = new THREE.Fog(0xe8d9b0, 95, 175);
    this.fog = this.scene.fog;
    try {
      const url = new URL("sky.jpg", window.location.href).href;
      new THREE.TextureLoader().load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        // NOT EquirectangularReflectionMapping. three.js renders an equirect
        // background by sampling along the per-pixel view direction — but an
        // orthographic camera has the SAME direction for every pixel, so the
        // whole sky resolved to one flat grey. Default UVMapping renders the
        // panorama as a full-screen backdrop, which is what an isometric game
        // with a fixed camera angle actually wants.
        tex.mapping = THREE.UVMapping;
        this.scene.background = tex;
      });
    } catch {
      /* keep procedural sky */
    }
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
        // P6.2: per-biome tileset — bright cold snow, murky swamp, rich woods.
        const pal = t.biome === "SNOW" ? { r: 1.14, g: 1.18, b: 1.28 }
          : t.biome === "SWAMP" ? { r: 0.72, g: 0.84, b: 0.68 }
          : t.biome === "FOREST" ? { r: 0.86, g: 1.02, b: 0.82 }
          : { r: 1.0, g: 1.0, b: 1.0 };
        const v = 0.9 + tint() * 0.18;
        const n = mesh.geometry.attributes.position.count;
        const colors = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { colors[i * 3] = v * pal.r; colors[i * 3 + 1] = v * pal.g; colors[i * 3 + 2] = v * pal.b; }
        mesh.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        root.add(mesh);
        if (t.terrainType === "WATER") waterTiles.push({ x: gx, y: gy });
      }
    }
    this.scene.add(root);
    this.buildWater(waterTiles, yFor(-0.25) + 0.15 + 0.015);
  }

  /** One animated plane hugging only the water tiles. */
  /**
   * One flat quad per water tile, merged into a single BufferGeometry (still one
   * draw call).
   *
   * This previously built a SINGLE THREE.Shape for the whole map — moveTo on the
   * first tile, then lineTo around every subsequent tile — which is one
   * continuous self-intersecting path hopping between scattered tiles. Triangulating
   * that produced a huge wedge of "water" lying across open ground, which is the
   * wave-shaped sheet that showed up next to spawn.
   *
   * UVs are world-space so the shimmer flows continuously across a lake instead of
   * restarting per tile.
   */
  private buildWater(tiles: { x: number; y: number }[], y: number) {
    if (!tiles.length) return;

    const positions = new Float32Array(tiles.length * 6 * 3); // 2 tris × 3 verts
    const uvs = new Float32Array(tiles.length * 6 * 2);
    const UV_SCALE = 1 / 8; // ~one shimmer cycle per 3-4 tiles

    tiles.forEach((t, i) => {
      const x0 = t.x - 0.5, z0 = t.y - 0.5;
      const x1 = t.x + 0.5, z1 = t.y + 0.5;
      // Two triangles, counter-clockwise when viewed from above (+Y).
      const corners = [
        [x0, z0], [x0, z1], [x1, z1],
        [x0, z0], [x1, z1], [x1, z0],
      ];
      corners.forEach(([cx, cz], k) => {
        const p = (i * 6 + k) * 3;
        positions[p] = cx; positions[p + 1] = 0; positions[p + 2] = cz;
        const q = (i * 6 + k) * 2;
        uvs[q] = cx * UV_SCALE; uvs[q + 1] = cz * UV_SCALE;
      });
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.computeVertexNormals();

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
    const clutter = buildClutter(tiles);
    clutter.position.y = GROUND_Y; // instances are authored at y≈0.1 (ground-relative)
    this.scene.add(clutter);
  }

  /** Deterministically place resources from the grid seed. */
  /**
   * Place resources across the WHOLE map.
   *
   * This used to walk rows top-down and decrement a shared cap as it went, so the
   * first rows consumed every slot and the rest of the world was bare — which is
   * why trees only ever appeared along the top edge and fishing spots capped out
   * at one. Candidates are now collected first, shuffled deterministically by the
   * grid seed, then taken up to the cap, so density is even and the minimum
   * counts are actually met.
   */
  private spawnResources() {
    const g = this.grid;
    const trees: { x: number; y: number; biome: Biome }[] = [];
    const rocks: { x: number; y: number; biome: Biome }[] = [];
    const fish: { x: number; y: number }[] = [];

    for (let gy = 1; gy < g.height - 1; gy++) {
      for (let gx = 1; gx < g.width - 1; gx++) {
        const t = g.at(gx, gy)!;
        if (t.terrainType === "WATER") { fish.push({ x: gx, y: gy }); continue; }
        if (!t.walkable || t.occupant !== "NONE") continue;
        const r = seeded(t.seed)();
        // P6.2: what grows here depends on the biome — snow is barren but
        // mineral-rich, swamps grow willow (a P2 skill gate), woods run dense.
        // No trees in the town core — that's the settlement build area, and a
        // spawn hemmed in by trunks reads as a thicket rather than a village.
        const canTree = t.zoneId !== "TOWN_CENTER" && t.biome !== "SNOW";
        const dense = t.biome === "FOREST" ? 0.3 : 0.16;
        if (canTree && r < dense) trees.push({ x: gx, y: gy, biome: t.biome });
        else if ((t.terrainType === "DIRT" || t.terrainType === "GRASS") && r < dense + (t.biome === "SNOW" ? 0.5 : 0.14)) {
          rocks.push({ x: gx, y: gy, biome: t.biome });
        }
      }
    }

    const TREE_CAP = 85, ROCK_CAP = 55, FISH_CAP = 14;
    let treeCount = 0, rockCount = 0, fishCount = 0;
    for (const c of shuffleSeeded(trees, 8311).slice(0, TREE_CAP)) {
      const t = g.at(c.x, c.y)!;
      this.spawnNode("TREE", c.x, c.y, c.biome === "SWAMP" ? pickSwampTree(c.x, c.y) : pickTree(c.x, c.y, g));
      void t; treeCount++;
    }
    for (const c of shuffleSeeded(rocks, 5279).slice(0, ROCK_CAP)) {
      if (g.at(c.x, c.y)!.occupant !== "NONE") continue;
      this.spawnNode("ROCK", c.x, c.y, c.biome === "SNOW" ? pickColdRock(c.x, c.y) : pickRock(c.x, c.y));
      rockCount++;
    }
    for (const c of shuffleSeeded(fish, 6173).slice(0, FISH_CAP)) {
      this.spawnNode("WATER", c.x, c.y, pickFish(c.x, c.y));
      fishCount++;
    }
    EngineLogger.info(`Spawned ${treeCount} trees, ${rockCount} rocks, ${fishCount} fishing spots`);
  }


  /** Spawn a deterministic monster population in the wilderness ring. */
  private spawnMonsters() {
    const g = this.grid;
    const layout: { type: keyof typeof MONSTERS; cap: number }[] = [
      { type: "giant_rat", cap: 4 },
      { type: "goblin", cap: 3 },
      { type: "dire_wolf", cap: 3 },
      { type: "goblin_archer", cap: 3 },
      { type: "skeleton", cap: 2 },
      { type: "zombie", cap: 1 },
      { type: "frost_imp", cap: 3 },
      { type: "bog_husk", cap: 3 },
    ];
    const counts: Record<string, number> = {};
    const cx = Math.floor(g.width / 2), cy = Math.floor(g.height / 2);
    for (let gy = 1; gy < g.height - 1; gy++) {
      for (let gx = 1; gx < g.width - 1; gx++) {
        const t = g.at(gx, gy)!;
        if (t.zoneId !== "WILDERNESS_LVL1" && t.zoneId !== "WILDERNESS_LVL2") continue;
        if (!t.walkable || t.occupant !== "NONE") continue;
        const rnd = seeded(t.seed * 3 + 7);
        const r = rnd();
        const d = Math.max(Math.abs(gx - cx), Math.abs(gy - cy));
        // P6.3: every region breeds its own threats (biome pools).
        const pool = monsterPoolFor(t.biome, d);
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

    // P4b: one dormant boss prowls the deep wilderness (deterministic seed).
    outer: for (let gy = 1; gy < g.height - 1; gy++) {
      for (let gx = 1; gx < g.width - 1; gx++) {
        const t = g.at(gx, gy)!;
        if (t.zoneId !== "WILDERNESS_LVL1" || !t.walkable || t.occupant !== "NONE") continue;
        if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) < 6) continue;
        const rnd = seeded(gx * 11 + gy * 13 + 99);
        if (rnd() < 0.35) {
          const def = MONSTERS.forest_ogre;
          const m = spawnMonster("forest_ogre", def, gx, gy);
          this.combat.addMonster(m);
          this.nodeGroup.add(m.group);
          EngineLogger.info(`Boss spawned: Forest Ogre at ${gx},${gy}`);
          break outer;
        }
      }
    }
  }

  private spawnNode(type: NodeType, gx: number, gy: number, def: ResourceDef) {
    const id = nodeKey(type, gx, gy);
    const group = this.buildNodeMesh(type, def, gx, gy);
    // Props stand ON the terrain surface. These were planted at y = 0 while the
    // ground sits at GROUND_Y, burying trees and rocks up to the crown — which is
    // why a "tree" read as a bush with no visible trunk.
    group.position.set(gx, GROUND_Y, gy);
    if (type === "WATER") group.position.y = 0.4; // marker floats on the water plane
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

/** Deterministic Fisher–Yates so placement is even across the map yet stable
 *  across sessions (the world must look identical on every reload). */
function shuffleSeeded<T>(list: T[], seed: number): T[] {
  const out = list.slice();
  const rnd = seeded(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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

/** P6.3: which monsters roam a tile — the inner band is tame, the outer
 *  bands spawn biome-native threats (wolves in the woods, frost imps on the
 *  snowfields, bog husks in the mire). */
export function monsterPoolFor(biome: Biome | undefined, d: number): (keyof typeof MONSTERS)[] {
  if (d <= 8) return ["giant_rat", "goblin"];
  if (biome === "SWAMP") return ["bog_husk", "bog_husk", "skeleton"];
  if (biome === "SNOW") return ["frost_imp", "frost_imp", "dire_wolf"];
  if (biome === "FOREST") return ["dire_wolf", "dire_wolf", "skeleton"];
  return ["dire_wolf", "goblin_archer"];
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
/** P6.2: swamp trees skew willow (the P2 skill gate for swamp lumber). */
function pickSwampTree(gx: number, gy: number): ResourceDef {
  const rnd = seeded(gx * 13 + gy * 17 + 41);
  return rnd() < 0.7 ? RESOURCES.tree_willow : RESOURCES.tree_oak;
}
/** P6.2: frozen crags are metal-heavy — iron and coal dominate. */
function pickColdRock(gx: number, gy: number): ResourceDef {
  const rnd = seeded(gx * 5 + gy * 5 + 2);
  const r = rnd();
  if (r < 0.12) return RESOURCES.rock_copper;
  if (r < 0.4) return RESOURCES.rock_tin;
  if (r < 0.8) return RESOURCES.rock_iron;
  return RESOURCES.rock_coal;
}