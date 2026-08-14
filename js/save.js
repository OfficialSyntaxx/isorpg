// ------------------------------------------------------------------
// Save / Load / Export / Import.
// Persists to localStorage with a rotating backup, sanitises any loaded
// JSON against the known schema (malformed/injected saves roll back to
// the last stable autosave), and offers manual JSON download + base64.
// ------------------------------------------------------------------
import { SKILLS, BUILDINGS, ITEMS, MONSTERS, NODES } from './data.js';

const KEY = 'isorpg_save_v1';
const KEY_BACKUP = 'isorpg_save_v1_backup';

export class SaveManager {
  constructor(game) { this.game = game; this.onSave = null; }

  now() { this.game.s.lastSave = Date.now(); }

  save() {
    if (this.onSave) this.onSave();
    this.now();
    const str = JSON.stringify(this.game.s);
    try {
      const prev = localStorage.getItem(KEY);
      localStorage.setItem(KEY_BACKUP, prev || '');
      localStorage.setItem(KEY, str);
    } catch (e) {
      // quota exceeded: drop to backup slot only
      try { localStorage.setItem(KEY_BACKUP, str); } catch (_) {}
      return false;
    }
    return true;
  }

  autoSave() { this.save(); }

  loadLatest() {
    // prefer main, else backup
    let raw = localStorage.getItem(KEY);
    let fromBackup = false;
    if (!raw) { raw = localStorage.getItem(KEY_BACKUP); fromBackup = true; }
    const s = this._loadRaw(raw);
    if (s) {
      this.game.loadState(s);
      if (fromBackup) this.game.toast('Loaded backup save', 'good');
      return s;
    }
    return null;
  }

  _loadRaw(raw) {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const s = this.sanitize(parsed);
      if (!s) return null;
      return s;
    } catch (e) {
      // malformed -> try backup
      const backup = this._loadRaw(localStorage.getItem(KEY_BACKUP));
      return backup;
    }
  }

  // Deep-validate and repair a loaded save against the schema.
  sanitize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const base = this.game.newState();
    try {
      const s = Object.assign({}, base, raw);
      // resources: numbers
      for (const k in s.resources) if (typeof s.resources[k] !== 'number' || !isFinite(s.resources[k]) || s.resources[k] < 0) s.resources[k] = base.resources[k] || 0;
      // skills
      for (const k of Object.keys(SKILLS)) {
        const sk = s.skills[k];
        if (!sk || typeof sk.xp !== 'number' || !isFinite(sk.xp) || sk.xp < 0) s.skills[k] = { xp: 0, lvl: 1 };
        else if (typeof sk.lvl !== 'number') sk.lvl = 1;
      }
      // inventory: item ids must be real; values positive integers
      const cleanInv = {};
      for (const [k, v] of Object.entries(s.inventory || {})) {
        const id = k in ITEMS ? k : (Object.keys(ITEMS).find(i => ITEMS[i].name === k) || null);
        if (id && Number.isFinite(v) && v > 0) cleanInv[id] = Math.floor(v);
      }
      s.inventory = cleanInv;
      // equipped
      for (const slot of ['weapon', 'armor']) {
        const e = s.equipped && s.equipped[slot];
        if (e && !(e in ITEMS)) s.equipped[slot] = null;
      }
      if (!s.equipped) s.equipped = { weapon: null, armor: null };
      // hp
      if (typeof s.hp !== 'number' || !isFinite(s.hp)) s.hp = 100;
      // buildings: {id, tx, ty, level}
      s.buildings = (Array.isArray(s.buildings) ? s.buildings : []).filter(b =>
        b && b.id in BUILDINGS && Number.isFinite(b.tx) && Number.isFinite(b.ty) &&
        Math.abs(b.tx) < 10000 && Math.abs(b.ty) < 10000).map(b => ({
          id: b.id, tx: Math.floor(b.tx), ty: Math.floor(b.ty),
          level: Number.isFinite(b.level) && b.level > 0 ? Math.floor(b.level) : 1 }));
      // nodes
      s.nodes = (Array.isArray(s.nodes) ? s.nodes : []).filter(n =>
        n && n.type in NODES && Number.isFinite(n.tx) && Number.isFinite(n.ty)).map(n => ({
          type: n.type, tx: Math.floor(n.tx), ty: Math.floor(n.ty),
          health: Number.isFinite(n.health) ? n.health : 1,
          depleted: Number.isFinite(n.depleted) ? Math.floor(n.depleted) : 0 }));
      // monsters
      s.monsters = (Array.isArray(s.monsters) ? s.monsters : []).filter(m =>
        m && m.type in MONSTERS && Number.isFinite(m.tx) && Number.isFinite(m.ty)).map(m => ({
          type: m.type, tx: Math.floor(m.tx), ty: Math.floor(m.ty),
          hp: Number.isFinite(m.hp) ? m.hp : MONSTERS[m.type].hp,
          respawn: Number.isFinite(m.respawn) ? Math.floor(m.respawn) : 0,
          id: typeof m.id === 'string' ? m.id : null }));
      if (!s.monstersKilled || typeof s.monstersKilled !== 'object') s.monstersKilled = {};
      if (!s.quests || typeof s.quests !== 'object') s.quests = {};
      // hero position
      const hp_ = s.heroPos;
      s.heroPos = ({ tx, ty }) => ({ tx: Math.floor(Number(tx)), ty: Math.floor(Number(ty)) })({
        tx: hp_ && Number.isFinite(hp_.tx) ? hp_.tx : 35,
        ty: hp_ && Number.isFinite(hp_.ty) ? hp_.ty : 33 });
      if (typeof s.tick !== 'number' || !isFinite(s.tick)) s.tick = 0;
      s.version = 1;
      s.lastSave = Number.isFinite(s.lastSave) ? s.lastSave : Date.now();
      s.settings = Object.assign({ tickMs: 600, autoEatHp: 35 }, s.settings || {});
      if (![100, 200, 300, 400, 500, 600, 700, 800, 1000].includes(s.settings.tickMs)) s.settings.tickMs = 600;
      return s;
    } catch (e) { return null; }
  }

  // ---- Export / Import ----
  exportJSON() {
    this.now();
    return JSON.stringify(this.game.s, null, 2);
  }
  exportBase64() { return btoa(unescape(encodeURIComponent(this.exportJSON()))); }

  importJSON(str) {
    let parsed;
    try { parsed = JSON.parse(str); } catch (e) {
      // maybe base64?
      try { parsed = JSON.parse(decodeURIComponent(escape(atob(str.trim())))); } catch (e2) {
        return { ok: false, reason: 'Could not parse JSON or base64 data.' };
      }
    }
    const s = this.sanitize(parsed);
    if (!s) return { ok: false, reason: 'Invalid save file.' };
    this.game.loadState(s);
    this.save();
    return { ok: true, s };
  }

  downloadJSON() {
    const blob = new Blob([this.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'isorpg-save-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  wipe() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_BACKUP);
  }
}