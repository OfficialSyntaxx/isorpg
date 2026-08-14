// ------------------------------------------------------------------
// World generation + isometric tile rendering.
// A single expanding square grid; terrain is laid out in zones
// (settlement core, forest, mines, lake, wilderness, dungeons) using a
// seeded RNG so the same seed always produces the same world.
// Rendered as an InstancedMesh of unit boxes with per-tile colour + height.
// ------------------------------------------------------------------
import * as THREE from 'three';

export const T = { WATER:0, GRASS:1, SAND:2, FOREST:3, ROCK:4, WILD:5, DUNGEON:6, PATH:7 };
const TERRAIN_COLOR = {
  [T.WATER]:   0x1d5f8c,
  [T.GRASS]:   0x4f8f4e,
  [T.SAND]:    0xc7b271,
  [T.FOREST]:  0x2f6b3a,
  [T.ROCK]:    0x7d7a72,
  [T.WILD]:    0x5a4a38,
  [T.DUNGEON]: 0x33242b,
  [T.PATH]:    0x9b8448,
};

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class Tilemap {
  constructor(scene) {
    this.scene = scene;
    this.W = 72; this.H = 72;
    this.terrain = [];
    this.rand = mulberry32(20240817);
  }

  // Build terrain grid into this.terrain and return placed entities:
  // { nodes: [], monsters: [] } placed into the world (fed to Game).
  generate() {
    const W = this.W, H = this.H;
    this.terrain = Array.from({ length: H }, () => new Array(W).fill(T.GRASS));

    // Border water
    for (let x = 0; x < W; x++) { this.terrain[0][x] = T.WATER; this.terrain[H - 1][x] = T.WATER; }
    for (let y = 0; y < H; y++) { this.terrain[y][0] = T.WATER; this.terrain[y][W - 1] = T.WATER; }

    // Settlement core
    const s0 = 26, s1 = 46;
    for (let y = s0; y <= s1; y++) for (let x = s0; x <= s1; x++) this.terrain[y][x] = T.PATH;

    // Lake (SW)
    for (let y = 48; y < H - 1; y++) for (let x = 1; x < 22; x++) this.terrain[y][x] = T.WATER;

    // Forest (N + NW)
    for (let y = 2; y < s0; y++) for (let x = 2; x < W - 1; x++) {
      if (this.terrain[y][x] === T.GRASS) this.terrain[y][x] = T.FOREST;
    }

    // Rocks (E)
    for (let y = 2; y < H - 1; y++) for (let x = s1 + 2; x < W - 1; x++) {
      this.terrain[y][x] = T.ROCK;
    }

    // Scatter some forest/rock just outside the settlement ring for early access
    const scatterR = (c) => { const r = this.rand(); return r < c; };
    for (let y = s1 + 1; y < s1 + 6; y++) for (let x = s0 - 6; x <= s1; x++) {
      if (this.terrain[y][x] === T.GRASS && scatterR(0.5)) this.terrain[y][x] = T.FOREST;
    }

    // Wilderness = remaining walkable land
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (this.terrain[y][x] === T.GRASS) this.terrain[y][x] = T.WILD;
    }

    // Dungeon corners (far tiles)
    this.corners = [[4,4],[W-5,4],[4,H-5],[W-5,H-5]];
    for (const [cx, cy] of this.corners) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x > 0 && y > 0 && x < W - 1 && y < H - 1) this.terrain[y][x] = T.DUNGEON;
      }
    }

    this._buildMeshes();
    return this._populate();
  }

  _buildMeshes() {
    const W = this.W, H = this.H;
    this.tileMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.96, 0.12, 0.96), new THREE.MeshStandardMaterial({ roughness: 0.9 }), W * H);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let i = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = this.terrain[y][x];
      const jitter = (this.rand() * 2 - 1) * 0.02 + (x % 7) * 0.003;
      const h = t === T.WATER ? -0.1 : jitter;
      dummy.position.set(x + 0.5, h, y + 0.5);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.tileMesh.setMatrixAt(i, dummy.matrix);
      color.setHex(TERRAIN_COLOR[t]);
      // subtle variation
      const v = 0.94 + this.rand() * 0.08;
      color.multiplyScalar(v);
      this.tileMesh.setColorAt(i, color);
      i++;
    }
    this.tileMesh.instanceMatrix.needsUpdate = true;
    if (this.tileMesh.instanceColor) this.tileMesh.instanceColor.needsUpdate = true;
    this.tileMesh.receiveShadow = true;
    this.scene.add(this.tileMesh);
  }

  // Place resource nodes & monster spawns.
  _populate() {
    const nodes = [], monsters = [];
    const W = this.W, H = this.H;
    const blockers = new Set();

    const isBlocked = (x, y) => blockers.has(y * W + x);

    // Trees in forest zone (sparse)
    for (let y = 2; y < 26; y++) {
      for (let x = 2; x < W - 1; x++) {
        if (this.terrain[y][x] === T.FOREST && this.rand() < 0.11) {
          if (isBlocked(x, y)) continue;
          const type = this.rand() < 0.12 ? 'yew' : 'tree';
          nodes.push({ type, tx: x, ty: y, health: this.rand() < 0.15 ? 2 : 1, depleted: 0 });
          blockers.add(y * W + x);
        }
      }
    }
    // Early forest ring (south of settlement gives quick wood)
    for (let y = 47; y <= 51; y++) for (let x = 28; x <= 44; x++) {
      if (this.terrain[y][x] === T.FOREST && !isBlocked(x, y) && this.rand() < 0.4) {
        nodes.push({ type: 'tree', tx: x, ty: y, health: 1, depleted: 0 });
        blockers.add(y * W + x);
      }
    }

    // Rocks in mining zone
    for (let y = 2; y < H - 1; y++) for (let x = 50; x < W - 1; x++) {
      const roll = this.rand();
      if (roll < 0.09 && !isBlocked(x, y)) {
        const type = roll < 0.03 ? 'rock_gold' : (roll < 0.06 ? 'rock_iron' : 'rock_copper');
        nodes.push({ type, tx: x, ty: y, health: this.rand() < 0.2 ? 2 : 1, depleted: 0 });
        blockers.add(y * W + x);
      }
    }

    // Fishing: sandy shore tiles touching the lake
    for (let y = 47; y < H - 1; y++) for (let x = 1; x < 23; x++) {
      const t = this.terrain[y][x];
      if (t === T.GRASS || t === T.SAND || t === T.WILD) {
        // adjacent to water?
        let adjWater = false;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          if (this.terrain[y + dy] && this.terrain[y + dy][x + dx] === T.WATER) adjWater = true;
        }
        if (adjWater && !isBlocked(x, y)) {
          if (this.terrain[y][x] !== T.WILD) this.terrain[y][x] = T.SAND;
          if (this.rand() < 0.5) {
            nodes.push({ type: 'fishing', tx: x, ty: y, health: 50, depleted: 0 });
            blockers.add(y * W + x);
          }
        }
      }
    }

    // Rebuild mesh after shore sand update
    this._rebuildTileColors();

    // Monsters: spawn in wilderness & dungeons, distributed ring
    const spawnCandidates = [];
    for (let y = 2; y < H - 1; y++) for (let x = 2; x < W - 1; x++) {
      const t = this.terrain[y][x];
      const dist = Math.max(Math.abs(x - 36), Math.abs(y - 36));
      if (t === T.WILD && dist > 10 && dist < 32 && !isBlocked(x, y)) spawnCandidates.push([x, y]);
    }
    for (const [x, y] of spawnCandidates) {
      if (this.rand() < 0.16) {
        const tier = Math.max(Math.abs(x - 36), Math.abs(y - 36));
        const type = this._monsterForTier(tier);
        monsters.push({ type, tx: x, ty: y, hp: 0, respawn: 0, id: null });
        blockers.add(y * W + x);
      }
    }
    // Bosses in dungeon corners
    for (const [cx, cy] of this.corners) {
      monsters.push({ type: 'dragon', tx: cx, ty: cy, hp: 0, respawn: 0, id: null });
    }

    return { nodes, monsters };
  }

  _monsterForTier(tier) {
    if (tier >= 26) return ['dark_mage','dragon','bandit'][Math.floor(this.rand() * 3)];
    if (tier >= 20) return ['bandit','zombie','skeleton'][Math.floor(this.rand() * 3)];
    if (tier >= 15) return ['skeleton','zombie','goblin'][Math.floor(this.rand() * 3)];
    return ['rat','wolf','goblin'][Math.floor(this.rand() * 3)];
  }

  _rebuildTileColors() {
    if (!this.tileMesh) return;
    const color = new THREE.Color();
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      const t = this.terrain[y][x];
      const i = y * this.W + x;
      color.setHex(TERRAIN_COLOR[t]);
      color.multiplyScalar(0.94 + ((x + y) % 5) * 0.02);
      this.tileMesh.setColorAt(i, color);
    }
    this.tileMesh.instanceColor.needsUpdate = true;
  }
}