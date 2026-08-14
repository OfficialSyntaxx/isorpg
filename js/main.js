// ------------------------------------------------------------------
// Isorpg — entry point. Boots the engine, world, game systems, input,
// deterministic tick loop and render loop. Keeps gameplay logic on a
// fixed-interval tick independent of frame-rate.
// ------------------------------------------------------------------
import * as THREE from 'three';
import { Engine } from './engine.js';
import { Tilemap, T } from './tilemap.js';
import { Pathfinder } from './pathfinding.js';
import { Game } from './game.js';
import { SaveManager } from './save.js';
import { Hero } from './hero.js';
import { Skills } from './skills.js';
import { Combat } from './combat.js';
import { WorldObjects } from './entities.js';
import { UI } from './ui.js';
import { BUILDINGS, ITEMS, MONSTERS, QUESTS, TICK_MS } from './data.js';

const $ = id => document.getElementById(id);

function hideLoading() {
  const l = document.getElementById('loading');
  if (l) l.style.display = 'none';
}
function bootError(msg) {
  const t = document.getElementById('loading-text');
  const s = document.querySelector('.loader-spin');
  if (!t) return;
  if (s) s.style.display = 'none';
  t.style.color = '#ff6b6b';
  t.style.maxWidth = '90vw';
  t.textContent = 'Isorpg hit a startup error: ' + (msg || 'unknown').toString();
}

class Isorpg {
  constructor() {
    this.engine = new Engine($('gl-canvas'));
    this.tilemap = new Tilemap(this.engine.scene);
    const placed = this.tilemap.generate();
    this.game = new Game();
    this.save = new SaveManager(this.game);
    this.world = new WorldObjects(this.engine.scene);
    this.hero = new Hero(this.engine.scene);
    this.skills = new Skills(this.game, this.world, this.hero);
    this.combat = new Combat(this.game, this.world, this.hero, this.skills);

    // overlay container for damage floats (pointer-events none)
    this.world.overlay = $('gl-overlay');

    // wire placed world objects into a game
    this.game.s.nodes = placed.nodes;
    this.game.s.nodes.forEach(n => { n.health = n.health || 1; n.depleted = n.depleted || 0; });
    // monster entries: assign ids on first spawn
    this.game.s.monsters = placed.monsters;
    this.game.s.monsters.forEach(m => { m.id = null; m.respawn = m.respawn || 0; m.hp = Number.isFinite(m.hp) && m.hp > 0 ? m.hp : MONSTERS[m.type].hp; });

    // pathfinder over live occupancy
    this.pathfinder = new Pathfinder(
      (tx, ty) => this.isObstacle(tx, ty),
      this.tilemap.W, this.tilemap.H);

    this.ui = new UI(this.game, this.world, this.hero, this.skills, this.combat, this.save, this.engine);

    this.camTarget = new THREE.Vector3(this.tilemap.W / 2, 0, this.tilemap.H / 2);
    this.cameraDist = 40;
    this.engine.focus(this.camTarget, this.cameraDist);
    this.panning = { active: false, x: 0, y: 0 };

    // shadow light follows world center
    const c = this.tilemap.W / 2;
    this.engine.dir.position.set(c + 30, 60, c + 18);
    this.engine.dir.target.position.set(c, 0, c);

    // stamp hero position into saves before persisting
    this.save.onSave = () => {
      this.game.s.heroPos = { tx: this.hero.tx, ty: this.hero.ty };
    };
  }

  isBuildTerrain(t) { return t === T.PATH || t === T.GRASS || t === T.SAND; }

  isObstacle(tx, ty) {
    const t = this.tilemap.terrain[ty] && this.tilemap.terrain[ty][tx];
    if (t === undefined || t === T.WATER) return true;
    if (this.nodeAt(tx, ty)) return true;
    if (this.buildingAt(tx, ty)) return true;
    if (this.monsterAt(tx, ty)) return true;
    return false;
  }

  nodeAt(tx, ty) {
    return this.game.s.nodes.find(n => n.tx === tx && n.ty === ty && !n.depleted);
  }
  buildingAt(tx, ty) {
    return this.game.s.buildings.find(b =>
      tx >= b.tx && tx < b.tx + BUILDINGS[b.id].size &&
      ty >= b.ty && ty < b.ty + BUILDINGS[b.id].size);
  }
  monsterAt(tx, ty) {
    return this.game.s.monsters.find(m => m.tx === tx && m.ty === ty && m.id != null);
  }

  // ---------- camera ----------
  onWheel(e) {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.001);
    this.cameraDist = this.cameraDist || 40;
    this.cameraDist = THREE.MathUtils.clamp(this.cameraDist * factor, 14, 90);
    this.engine.focus(this.camTarget, this.cameraDist);
  }
  startPan(clientX, clientY) {
    this.panning = { active: true, x: clientX, y: clientY };
  }
  onPan(clientX, clientY) {
    if (!this.panning.active) return [{}, {}];
    const dx = clientX - this.panning.x, dy = clientY - this.panning.y;
    this.panning.x = clientX; this.panning.y = clientY;
    const halfH = this.cameraDist || 40, halfW = halfH * (window.innerWidth / Math.max(1, window.innerHeight));
    const worldX = -dx * (2 * halfW) / window.innerWidth;
    const worldZ = -dy * (2 * halfH) / window.innerHeight;
    this.camTarget.x = THREE.MathUtils.clamp(this.camTarget.x + worldX, -20, this.tilemap.W + 20);
    this.camTarget.z = THREE.MathUtils.clamp(this.camTarget.z + worldZ, -20, this.tilemap.H + 20);
    this.engine.focus(this.camTarget, this.cameraDist || 40);
  }
  endPan() { this.panning.active = false; }

  // ---------- save / boot ----------
  bootNewGame() {
    // place town center + starter buildings
    const tc = { id: 'town_center', tx: 34, ty: 34, level: 1 };
    this.game.s.buildings.push(tc);
    this.game.s.buildings.push({ id: 'house', tx: 37, ty: 34, level: 1 });
    this.game.s.buildings.push({ id: 'house', tx: 34, ty: 37, level: 1 });
    this.hero.place(33, 36);
    this.game.s.heroPos = { tx: 33, ty: 36 };
  }

  play() {
    const loaded = this.save.loadLatest();
    if (loaded) {
      // rebuild world meshes from saved entities
      this.applyWorldState();
      const hp_ = loaded.heroPos || {};
      this.hero.place(Number.isFinite(hp_.tx) ? Math.max(1, Math.min(this.tilemap.W - 2, hp_.tx)) : 35,
        Number.isFinite(hp_.ty) ? Math.max(1, Math.min(this.tilemap.H - 2, hp_.ty)) : 33);
    } else {
      this.bootNewGame();
      this.applyWorldState();
      this.game.toast('Welcome to your new settlement! Click the trees to gather.', 'gold');
    }
    // spawn monsters with ids (skip those still on respawn cooldown)
    this.game.s.monsters.forEach(m => {
      if (m.respawn > 0) return;
      if (!m.id) { m.id = 'm' + Math.floor(Math.random() * 1e9); }
      this.world.addMonster(m.id, m.type, m.tx, m.ty, m.hp / MONSTERS[m.type].hp);
    });

    // offline gains
    setTimeout(() => {
      const off = this.game.offlineGains();
      if (off.seconds > 60) {
        for (const [r, n] of Object.entries(off.gains)) if (n > 0) this.game.grant(r, n);
        this.ui.offlineReport(off.seconds, off.gains);
      }
      this.game.s.lastSave = Date.now();
      this.save.save();
    }, 400);

    this.ui.renderTop();
    this.bindInput();
    this.startLoop();
    // Validate the first render synchronously, then reveal the world.
    this.engine.render();
    hideLoading();
  }

  // Rebuild building/node meshes from saved state
  applyWorldState() {
    this.world.clear();
    for (const b of this.game.s.buildings) this.world.addBuilding(b.id, b.tx, b.ty);
    // place meshes for undepleted nodes; depleted ones count down via respawnTick
    for (const n of this.game.s.nodes) {
      if (!n.depleted) this.world.addNode(n.type, n.tx, n.ty);
    }
  }

  // ---------- input ----------
  bindInput() {
    const cv = this.engine.renderer.domElement;
    cv.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    cv.addEventListener('mousedown', e => {
      if (e.button === 1 || e.button === 2) { this.startPan(e.clientX, e.clientY); return; }
      if (e.button === 0) this.onClick(e);
    });
    window.addEventListener('mousemove', e => {
      if (this.panning.active) { this.onPan(e.clientX, e.clientY); return; }
      this.onHover(e);
    });
    window.addEventListener('mouseup', () => this.endPan());
    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => {
      const step = 4;
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') this.camTarget.z -= this.unitsPerKey(step);
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') this.camTarget.z += this.unitsPerKey(step);
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') this.camTarget.x -= this.unitsPerKey(step);
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') this.camTarget.x += this.unitsPerKey(step);
      this.camTarget.x = THREE.MathUtils.clamp(this.camTarget.x, -20, this.tilemap.W + 20);
      this.camTarget.z = THREE.MathUtils.clamp(this.camTarget.z, -20, this.tilemap.H + 20);
      this.engine.focus(this.camTarget, this.cameraDist || 40);
      if (e.key === 'Escape') this.ui.closePanel();
    });
  }
  unitsPerKey(step) { return step * ((this.cameraDist || 40) / 40); }

  onHover(e) {
    const p = this.engine.pickTile(e.clientX, e.clientY);
    if (!p) { this.world.highlight.hide(); return; }
    const inside = p.tx >= 0 && p.ty >= 0 && p.tx < this.tilemap.W && p.ty < this.tilemap.H;
    if (!inside) { this.world.highlight.hide(); return; }
    if (this.ui.placeDef) {
      const def = this.ui.placeDef;
      const ok = this.canPlace(def, p.tx, p.ty);
      this.world.highlight.mesh.material.color.setHex(ok ? 0x39ff5a : 0xff3b3b);
      this.world.highlight.show(p.tx, p.ty);
    } else {
      this.world.highlight.mesh.material.color.setHex(0xffd54f);
      this.world.highlight.show(p.tx, p.ty);
    }
  }

  onClick(e) {
    const p = this.engine.pickTile(e.clientX, e.clientY);
    if (!p) return;
    const inside = p.tx >= 0 && p.ty >= 0 && p.tx < this.tilemap.W && p.ty < this.tilemap.H;
    if (!inside) return;

    // Building placement mode
    if (this.ui.placeDef) {
      if (this.canPlace(this.ui.placeDef, p.tx, p.ty)) {
        this.placeBuilding(this.ui.placeDef, p.tx, p.ty);
      } else {
        this.game.toast('Can\'t place here', 'bad');
      }
      return;
    }

    // Interact with something
    const node = this.nodeAt(p.tx, p.ty);
    const monster = this.monsterAt(p.tx, p.ty);
    const building = this.buildingAt(p.tx, p.ty);
    if (node || monster || building) {
      this.interactTarget(p.tx, p.ty, node || monster || building);
      return;
    }
    // plain move
    this.moveTo(p.tx, p.ty);
  }

  interactTarget(tx, ty, target) {
    // stop current action
    this.skills.stopGather();
    this.combat.stopFight();

    const isMonster = this.game.s.monsters.includes(target);
    const isNode = this.game.s.nodes.includes(target);

    // already adjacent: act immediately
    if (isMonster && this.combat.adjacent(tx, ty)) {
      this.combat.startFight(target.id);
      this.ui.showTarget({ kind: 'monster', id: target.id });
      return;
    }
    if (isNode && this.combat.adjacent(tx, ty)) {
      this.skills.startGather(target);
      this.ui.showTarget({ kind: 'node', type: target.type, tx, ty });
      return;
    }
    if (!isMonster && !isNode) {
      this.selectBuildingTarget(tx, ty);
      return;
    }

    // path to an adjacent walkable tile, then act
    const path = this.pathToAdjacent(tx, ty);
    if (!path) { this.game.toast('Can\'t reach that', 'bad'); return; }
    const onArrive = () => {
      if (isMonster) { this.combat.startFight(target.id); this.ui.showTarget({ kind: 'monster', id: target.id }); }
      else { this.skills.startGather(target); this.ui.showTarget({ kind: 'node', type: target.type, tx, ty }); }
    };
    this.hero.goToTile(tx, ty, onArrive, path);
  }

  selectBuildingTarget(tx, ty) {
    // find the building occupying this tile
    const b = this.buildingAt(tx, ty);
    if (b) this.ui.showTarget({ kind: 'building', id: b.id, tx: b.tx, ty: b.ty, level: b.level });
  }

  // Path to a walkable tile adjacent to (tx,ty) — ends one tile short so
  // the hero stands beside obstacles to interact.
  pathToAdjacent(tx, ty) {
    const goal = (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) === 1;
    const strip = p => { if (p && p.length && p[0][0] === this.hero.tx && p[0][1] === this.hero.ty) p.shift(); return p; };
    let path = this.pathfinder.find([this.hero.tx, this.hero.ty], [tx, ty], goal);
    if (path) return strip(path);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx = tx + dx, ny = ty + dy;
      if (this.inBounds(nx, ny) && !this.isObstacle(nx, ny)) {
        const p = this.pathfinder.find([this.hero.tx, this.hero.ty], [nx, ny]);
        if (p) return strip(p);
      }
    }
    return null;
  }

  moveTo(tx, ty) {
    this.skills.stopGather();
    this.combat.stopFight();
    const path = this.pathfinder.find([this.hero.tx, this.hero.ty], [tx, ty]);
    if (!path || path.length === 0) { this.game.toast('Can\'t reach that tile', 'bad'); return; }
    this.hero.goToTile(tx, ty, null, path);
  }

  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.tilemap.W && ty < this.tilemap.H; }

  canPlace(def, tx, ty) {
    const s = def.size;
    if (!this.inBounds(tx, ty) || !this.inBounds(tx + s - 1, ty + s - 1)) return false;
    for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) {
      const t = this.tilemap.terrain[y][x];
      if (!this.isBuildTerrain(t)) return false;
      if (this.buildingAt(x, y)) return false;
      if (this.nodeAt(x, y)) return false;
      if (this.monsterAt(x, y)) return false;
    }
    return true;
  }

  placeBuilding(def, tx, ty) {
    if (!this.game.canAfford(def.cost)) { this.game.toast('Not enough resources', 'bad'); return; }
    if (this.game.skillLvl('construction') < (def.lvl.construction || 1)) { this.game.toast(`Need Construction lv ${def.lvl.construction}`, 'bad'); return; }
    this.game.spend(def.cost);
    this.game.s.buildings.push({ id: def.id, tx, ty, level: 1 });
    this.world.addBuilding(def.id, tx, ty);
    this.game.addXp('construction', 40 + (def.lvl.construction || 1) * 10);
    this.game.toast(`${def.name} built! (+Construction XP)`, 'good');
    this.ui.leavePlaceMode();
    this.ui.refreshBodies();
  }

  // ---------- game loop ----------
  startLoop() {
    // deterministic logic ticks
    this.game.events.on('tick', () => this.logicTick());
    this.game.startTick();

    // render loop (rAF)
    let last = performance.now();
    let revealed = false;
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      try {
        this.hero.update(dt, now / 1000);
        this.heroMovementStopCheck();
        this.positionDamageFloats();
        this.engine.render();
      } catch (err) {
        bootError(err.message);
        throw err;
      }
      if (!revealed) { revealed = true; hideLoading(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    // autosave
    this.autoSaveInt = setInterval(() => { this.save.save(); }, 30000);
  }

  heroMovementStopCheck() { /* combat loop already keyed to adjacency */ }

  logicTick() {
    this.skills.gatherTick();
    this.skills.respawnTick();
    this.combat.respawnTick();
    this.combat.regenTick();
    if (this.combat.fighting()) this.combat.combatTick();
    else this.autoEatCheck();
    this.checkQuests();
    this.ui.renderTop();
  }

  autoEatCheck() {
    // consume best food when HP <= threshold (or near death)
    if (this.combat.fighting()) return;
    const thr = this.game.s.settings.autoEatHp || 0;
    if (thr <= 0) return;
    const hp = this.game.s.hp, max = this.game.maxHp();
    if (hp <= thr && hp < max) {
      const candidates = Object.entries(this.game.s.inventory)
        .filter(([id]) => id !== this.game.s.equipped.weapon && id !== this.game.s.equipped.armor)
        .map(([id, q]) => ({ id, it: ITEMS[id] }))
        .filter(x => x.it && x.it.type === 'food');
      if (candidates.length) {
        candidates.sort((a, b) => b.it.heal - a.it.heal);
        const f = candidates[0];
        this.game.heal(f.it.heal);
        this.game.removeItem(f.id, 1);
        this.game.toast(`Auto-ate ${f.it.name}`, 'good');
      }
    }
  }

  checkQuests() {
    let changed = false;
    for (const q of QUESTS) {
      if (this.game.s.quests[q.id]) continue;
      if (this.questMet(q)) {
        this.game.s.quests[q.id] = true;
        this.game.grant('gold', 60);
        this.game.addXp('attack', 20);
        this.game.toast(`🎉 Quest complete: ${q.name} (+60 gold)`, 'gold');
        changed = true;
      }
    }
    if (changed) this.ui.refreshBodies();
  }

  questMet(q) {
    const s = this.game.s;
    switch (q.type) {
      case 'item': return (s.inventory[q.item] || 0) >= q.target;
      case 'skill': return this.game.skillLvl(q.skill) >= q.target;
      case 'kill': return (s.monstersKilled[q.monster] || 0) >= q.target;
      case 'build': return s.buildings.some(b => b.id === q.building);
      case 'tile': return this.hero.tx === q.tx && this.hero.ty === q.ty;
      default: return false;
    }
  }

  positionDamageFloats() {
    const els = document.querySelectorAll('#gl-overlay .dmg-float');
    if (!els.length) return;
    const halfH = this.cameraDist || 40, halfW = halfH * (window.innerWidth / Math.max(1, window.innerHeight));
    for (const el of els) {
      const tx = +el.dataset.tx, ty = +el.dataset.ty;
      const v = new THREE.Vector3(tx + 0.5, 0.6, ty + 0.5);
      v.project(this.engine.cam);
      const x = (v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      el.style.left = x + 'px'; el.style.top = y + 'px';
    }
  }
}

function start() {
  window.addEventListener('error', ev => {
    if (ev && ev.message && document.getElementById('loading') && document.getElementById('loading').style.display !== 'none') {
      bootError(ev.message);
    }
  });
  try {
    const app = new Isorpg();
    app.play();
  } catch (err) {
    console.error(err);
    bootError(err && err.message ? err.message : 'unexpected error during startup');
  }
}
start();