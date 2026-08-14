// ------------------------------------------------------------------
// World object rendering: buildings, resource nodes, monsters and the
// hover/selection highlight. All geometry is procedural low-poly.
// Meshes are keyed so gameplay can create/remove/update them without
// leaking memory.
// ------------------------------------------------------------------
import * as THREE from 'three';
import { BUILDINGS, MONSTERS } from './data.js';

const M = new THREE.MeshStandardMaterial({ color: 0xffffff });
function box(w, h, d, color) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8 })); }
const pos = (m, x, y, z) => { m.position.set(x, y, z); return m; };

export class Highlight {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.RingGeometry(0.46, 0.5, 4);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this.mesh.rotation.z = Math.PI / 4;
    this.mesh.visible = false;
    this.scene.add(this.mesh);
    this.target = null;
  }
  show(tx, ty) { this.mesh.visible = true; this.mesh.position.set(tx + 0.5, 0.02, ty + 0.5); this.target = [tx, ty]; }
  hide() { this.mesh.visible = false; this.target = null; }
}

export class WorldObjects {
  constructor(scene) {
    this.scene = scene;
    this.buildingGroups = new Map();   // id -> group
    this.nodeGroups = new Map();        // "tx,ty" -> group
    this.monsterGroups = new Map();     // id -> { group, bar }
    this.highlight = new Highlight(scene);
    this.nodeCache = {};
  }

  clear() {
    for (const g of this.buildingGroups.values()) this.scene.remove(g);
    for (const g of this.nodeGroups.values()) this.scene.remove(g);
    for (const o of this.monsterGroups.values()) this.scene.remove(o.group);
    this.buildingGroups.clear(); this.nodeGroups.clear(); this.monsterGroups.clear();
  }

  // ---------------- Buildings ----------------
  buildingColor(id) {
    return { town_center: 0xd8a24f, house: 0xb06f3f, lumber_mill: 0x6f7d4f, stone_mason: 0x8f857a,
      smithy: 0x5a5a4a, farm: 0x7fa24f, storage: 0x7a7a6a, workshop: 0x9a7a4a, alchemy_lab: 0x7a4a8a,
      barracks: 0x7a4a4a }[id] || 0x667788;
  }

  addBuilding(id, tx, ty) {
    const def = BUILDINGS[id];
    const size = def.size || 1;
    const g = new THREE.Group();
    const color = this.buildingColor(id);
    const roof = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const wall = new THREE.MeshStandardMaterial({ color: shade(color, 0.72), roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(size - 0.04, 0.5, size - 0.04), wall);
    base.position.y = 0.26;
    g.add(base);
    if (id === 'town_center' || id === 'barracks') {
      // taller keep with tower
      const tower = new THREE.Mesh(new THREE.BoxGeometry(size * 0.5, size * 1.1, size * 0.5), wall);
      tower.position.y = 0.26 + 0.55;
      const spire = new THREE.Mesh(new THREE.ConeGeometry(size * 0.32, size * 0.9, 4), roof);
      spire.position.y = 0.26 + 1.1 + 0.45;
      spire.rotation.y = Math.PI / 4;
      g.add(tower, spire);
    } else {
      const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(size * 0.78, size * 0.55, 4), roof);
      roofMesh.position.y = 0.26 + 0.5 + 0.22;
      roofMesh.rotation.y = Math.PI / 4;
      g.add(roofMesh);
    }
    // door marker facing south-ish
    const door = new THREE.Mesh(new THREE.BoxGeometry(size * 0.22, 0.3, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x333a42 }));
    door.position.set(0, 0.15, size * 0.5);
    g.add(door);
    const cent = size / 2 - 0.5;
    g.position.set(tx + size / 2, 0.02, ty + size / 2);
    g.rotation.y = 0;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    const key = id + ':' + tx + ',' + ty;
    this.buildingGroups.set(key, g);
    return key;
  }
  addBuildingMesh(id, tx, ty) { this.addBuilding(id, tx, ty); }

  removeBuilding(key) {
    const g = this.buildingGroups.get(key);
    if (g) { this.scene.remove(g); this.buildingGroups.delete(key); }
  }
  getBuildingKey(tx, ty, size) {
    // given tile is the origin tile of a building of given size
    return this.buildingGroups.keys().find(k => k.endsWith(tx + ',' + ty));
  }
  removeAllBuildings() { for (const g of this.buildingGroups.values()) this.scene.remove(g); this.buildingGroups.clear(); }

  // ---------------- Nodes ----------------
  _nodeMesh(type) {
    const g = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2f, roughness: 0.9 });
    if (type === 'tree' || type === 'yew') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.5, 7), trunkMat);
      trunk.position.y = 0.28;
      const foliageColor = type === 'yew' ? 0xc2a94a : 0x3f7a3a;
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 7),
        new THREE.MeshStandardMaterial({ color: foliageColor, flatShading: true }));
      foliage.position.y = 0.72;
      const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 6),
        new THREE.MeshStandardMaterial({ color: shade(foliageColor, 0.82), flatShading: true }));
      f2.position.y = 1.02;
      g.add(trunk, foliage, f2);
    } else if (type.startsWith('rock')) {
      const stone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 6),
        new THREE.MeshStandardMaterial({ color: type === 'rock_gold' ? 0xb7a24a : 0x8f8d85, flatShading: true }));
      stone.position.y = 0.25;
      stone.rotation.z = 0.3;
      const r2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18),
        new THREE.MeshStandardMaterial({ color: 0x7a7872, flatShading: true }));
      r2.position.set(0.18, 0.16, 0.1); r2.rotation.y = 0.7; r2.scale.y = 0.6;
      g.add(stone, r2);
      if (type === 'rock_gold') {
        const vein = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.12),
          new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0x7a5a00 }));
        vein.position.y = 0.42;
        g.add(vein);
      }
    } else if (type === 'fishing') {
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20),
        new THREE.MeshStandardMaterial({ color: 0x2f86c0, transparent: true, opacity: 0.85, roughness: 0.2 }));
      water.rotation.x = -Math.PI / 2; water.position.y = 0.02;
      const ripple = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 20),
        new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      ripple.rotation.x = -Math.PI / 2; ripple.position.y = 0.03;
      g.add(water, ripple);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    return g;
  }

  addNode(type, tx, ty) {
    const g = this._nodeMesh(type);
    g.position.set(tx + 0.5, 0.02, ty + 0.5);
    this.scene.add(g);
    this.nodeGroups.set(tx + ',' + ty, g);
    return tx + ',' + ty;
  }
  removeNode(tx, ty) {
    const key = tx + ',' + ty;
    const g = this.nodeGroups.get(key);
    if (g) { this.scene.remove(g); this.nodeGroups.delete(key); }
  }
  respawnNode(type, tx, ty) {
    this.removeNode(tx, ty);
    this.addNode(type, tx, ty);
  }

  // ---------------- Monsters ----------------
  monsterColor(type) {
    return { rat: 0x9a7a5a, wolf: 0x6a6a7a, goblin: 0x7a9a4a, skeleton: 0xd8cfc0,
      zombie: 0x6a8a5a, bandit: 0x8a4a3a, dark_mage: 0x6a3a7a, dragon: 0x9a3a2a }[type] || 0x888888;
  }
  monsterBody(type) {
    const color = this.monsterColor(type);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true });
    const g = new THREE.Group();
    if (type === 'rat' || type === 'wolf') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.7), mat); body.position.y = 0.26;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.2), mat); head.position.set(0, 0.32, 0.46);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), mat); tail.position.set(0, 0.3, -0.5); tail.rotation.x = 0.5;
      g.add(body, head, tail);
    } else if (type === 'dragon') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 2), mat); body.position.y = 0.7;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.5), mat); head.position.set(0, 1.3, 1.2);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.9, 7), mat); neck.position.set(0, 0.95, 0.9);
      const wings = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 1), mat); wings.position.set(0, 1.4, 0); wings.rotation.z = 0.15;
      g.add(body, head, neck, wings);
    } else if (type === 'dark_mage' || type === 'skeleton' || type === 'zombie' || type === 'bandit' || type === 'goblin') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.2), mat); body.position.y = 0.6;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24),
        new THREE.MeshStandardMaterial({ color: type === 'skeleton' ? 0xe9ded0 : type === 'goblin' ? 0x6a9a4a : 0xcfae86 })); head.position.y = 0.96;
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.09), mat); armL.position.set(-0.22, 0.55, 0);
      const armR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.09), mat); armR.position.set(0.22, 0.55, 0);
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.1), mat); legL.position.set(-0.09, 0.18, 0);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.1), mat); legR.position.set(0.09, 0.18, 0);
      g.add(body, head, armL, armR, legL, legR);
      if (type === 'dark_mage') {
        const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), new THREE.MeshStandardMaterial({ color: 0x2a2f38 })); staff.position.set(0.32, 0.6, 0);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshStandardMaterial({ color: 0xb24aff, emissive: 0x6a1a9a })); orb.position.set(0.32, 0.95, 0);
        g.add(staff, orb);
      } else if (type === 'bandit') {
        const hood = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.24, 4), mat); hood.position.y = 1.08; hood.rotation.y = Math.PI / 4;
        g.add(hood);
      }
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    return g;
  }

  addMonster(id, type, tx, ty, hpPct) {
    const group = new THREE.Group();
    group.add(this.monsterBody(type));
    // HP bar sprite
    const bar = this.makeHpBar(type, hpPct);
    bar.position.y = 1.6;
    group.add(bar);
    group.position.set(tx + 0.5, 0.02, ty + 0.5);
    this.scene.add(group);
    this.monsterGroups.set(id, { group, bar });
  }
  makeHpBar(type, hpPct) {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 10;
    this._drawBar(cv, hpPct, type);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sp.scale.set(0.7, 0.12, 1);
    return sp;
  }
  _drawBar(cv, pct, type) {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, cv.width, cv.height);
    const boss = type === 'dragon' || type === 'dark_mage';
    const col = pct > 0.5 ? '#66bb6a' : pct > 0.25 ? '#ffb74d' : '#ef5350';
    ctx.fillStyle = col;
    ctx.fillRect(1, 1, (cv.width - 2) * Math.max(0, Math.min(1, pct)), cv.height - 2);
    if (boss) { ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, cv.width, cv.height); }
  }
  updateMonsterHp(id, pct, type) {
    const o = this.monsterGroups.get(id);
    if (!o) return;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 10;
    this._drawBar(cv, pct, type);
    o.bar.material.map.dispose();
    o.bar.material.map = new THREE.CanvasTexture(cv);
    o.bar.material.needsUpdate = true;
  }
  removeMonster(id) {
    const o = this.monsterGroups.get(id);
    if (o) {
      this.scene.remove(o.group);
      o.bar.material.map.dispose();
      this.monsterGroups.delete(id);
    }
  }
  removeAllMonsters() {
    for (const id of [...this.monsterGroups.keys()]) this.removeMonster(id);
  }

  // pleasant defeat pop
  flashMonster(id, color = 0xffffff) {
    const o = this.monsterGroups.get(id);
    if (o) {
      o.group.traverse(m => { if (m.isMesh) m.material.color.setHex(color); });
    }
  }
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c;
}