// ------------------------------------------------------------------
// Central game state + deterministic tick engine.
// A fixed-interval setInterval drives game logic (independent of the
// rAF render loop). The state object is plain data so it serialises
// cleanly for save/export.
// ------------------------------------------------------------------
import { SKILLS, xpToNext, levelFromXp, BUILDINGS, ITEMS, TICK_MS, MAX_IDLE_HOURS } from './data.js';

export class EventBus {
  constructor() { this.map = {}; }
  on(ev, fn) { (this.map[ev] = this.map[ev] || []).push(fn); return this; }
  emit(ev, data) { (this.map[ev] || []).forEach(fn => fn(data)); }
}

export class Game {
  constructor() {
    this.events = new EventBus();
    this.interval = null;
    this.active = false;
  }

  newState() {
    return {
      version: 1,
      createdAt: Date.now(),
      resources: { gold: 250, wood: 60, stone: 40, food: 30, gems: 0 },
      maxCap: { gold: 5000, wood: 2000, stone: 2000, food: 2000, gems: 500 },
      skills: Object.fromEntries(Object.keys(SKILLS).map(k => [k, { xp: 0, lvl: 1 }])),
      inventory: { bread: 5, log: 4, stone: 6 },
      equipped: { weapon: null, armor: null },
      hp: 100, maxHpBase: 100,
      monstersKilled: {},
      quests: {},
      buildings: [],   // { id, tx, ty, level }
      placedTownCenter: false,
      nodes: [],       // { type, tx, ty, health }
      monsters: [],    // { type, tx, ty, hp, id }
      heroPos: { tx: 35, ty: 33 },
      expansions: 0,
      tick: 0,
      lastSave: Date.now(),
      settings: { tickMs: TICK_MS, autoEatHp: 35 }
    };
  }

  loadState(s) { this.s = s; }
  reset() { this.loadState(this.newState()); }

  // ---------- skills ----------
  skillLvl(skill) { return this.s.skills[skill] ? levelFromXp(this.s.skills[skill].xp) : 1; }
  addXp(skill, amt) {
    const sk = this.s.skills[skill];
    if (!sk) return;
    sk.xp += amt;
    const nl = levelFromXp(sk.xp);
    if (nl > sk.lvl) {
      sk.lvl = nl;
      this.events.emit('levelup', { skill, lvl: nl });
      this.toast(`⬆ ${SKILLS[skill].name} reached level ${nl}!`, 'good');
    }
    this.events.emit('change');
  }

  // buffs from buildings
  getBuff(skill) {
    let m = 1;
    for (const b of this.s.buildings) {
      const def = BUILDINGS[b.id];
      if (def.buff && def.buff[skill]) m *= def.buff[skill];
    }
    return m;
  }

  // ---------- resources ----------
  canAfford(cost) {
    return Object.entries(cost).every(([r, n]) => (this.s.resources[r] || 0) >= n);
  }
  spend(cost) {
    for (const [r, n] of Object.entries(cost)) this.s.resources[r] -= n;
    this.events.emit('change');
  }
  grant(res, n) {
    this.s.resources[res] = (this.s.resources[res] || 0) + n;
    const cap = this.maxCapFor(res);
    if (this.s.resources[res] > cap) this.s.resources[res] = cap;
    this.events.emit('change');
  }
  storageCap() {
    // Storage buildings raise capacity
    return this.s.buildings.reduce((acc, b) => {
      const def = BUILDINGS[b.id];
      return acc + (def.cap ? def.cap.add : 0);
    }, 0);
  }
  maxCapFor(res) {
    return (this.s.maxCap[res] || 500) + this.storageCap();
  }

  // ---------- inventory ----------
  addItem(item, qty) {
    this.s.inventory[item] = (this.s.inventory[item] || 0) + qty;
    this.events.emit('change');
  }
  removeItem(item, qty) {
    if ((this.s.inventory[item] || 0) < qty) return false;
    this.s.inventory[item] -= qty;
    if (this.s.inventory[item] <= 0) delete this.s.inventory[item];
    this.events.emit('change');
    return true;
  }
  hasItem(item, qty) { return (this.s.inventory[item] || 0) >= (qty || 1); }

  // ---------- health ----------
  maxHp() {
    const base = this.s.maxHpBase + (levelFromXp(this.s.skills.health.xp) - 1) * 15;
    return base;
  }
  heal(amt) { this.s.hp = Math.min(this.maxHp(), this.s.hp + amt); this.events.emit('change'); }

  // ---------- tick / passive economy ----------
  startTick() {
    if (this.interval) return;
    this.active = true;
    this.interval = setInterval(() => this.tick(), this.s.settings.tickMs);
  }
  stopTick() { if (this.interval) { clearInterval(this.interval); this.interval = null; this.active = false; } }
  setTickMs(ms) {
    this.s.settings.tickMs = ms;
    if (this.interval) this.stopTick(), this.startTick();
  }

  tick() {
    this.s.tick++;
    this.applyPassive();
    if (this.s.hp > this.maxHp()) { this.s.hp = this.maxHp(); }
    // natural regen out of combat (handled in combat module)
    this.events.emit('tick');
    this.events.emit('change');
  }

  applyPassive() {
    // building passive income per tick
    for (const b of this.s.buildings) {
      const def = BUILDINGS[b.id];
      if (def.passive) {
        for (const [r, n] of Object.entries(def.passive)) this.grant(r, n);
      }
    }
    // idle skill XP from resource production rates (tiny so no exploit)
    const idle = Math.floor(levelFromXp(this.s.skills.woodcutting.xp) * 0.02);
    if (idle > 0) this.addXp('woodcutting', idle * 0.05);
    const idleM = Math.floor(levelFromXp(this.s.skills.mining.xp) * 0.02);
    if (idleM > 0) this.addXp('mining', idleM * 0.05);
  }

  // ---------- offline ----------
  offlineGains() {
    const elapsed = Math.min((Date.now() - (this.s.lastSave || Date.now())) / 1000, this.idleCapSec());
    const ticks = elapsed / (this.s.settings.tickMs / 1000);
    const gains = {};
    for (const b of this.s.buildings) {
      const def = BUILDINGS[b.id];
      if (def.passive) for (const [r, n] of Object.entries(def.passive)) gains[r] = (gains[r] || 0) + n * ticks;
    }
    for (const r in gains) gains[r] = Math.floor(gains[r]);
    return { seconds: elapsed, gains };
  }
  idleCapSec() {
    const base = MAX_IDLE_HOURS * 3600;
    const extra = this.s.buildings.filter(b => b.id === 'house' || b.id === 'town_center').length * 3600;
    return base + extra;
  }

  toast(msg, kind) { this.events.emit('toast', { msg, kind }); }
}