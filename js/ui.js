// ------------------------------------------------------------------
// UI: DOM overlays on top of the WebGL canvas. Top bar resources, hero
// chip, context left panel, bottom dock panels (inventory/skills/quests),
// build palette, settings & save modal, toasts and the offline report.
// ------------------------------------------------------------------
import { SKILLS, SKILL_ORDER, BUILDINGS, ITEMS, MONSTERS, QUESTS, NODES, xpToNext, levelFromXp } from './data.js';
import { RECIPES } from './skills.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class UI {
  constructor(game, world, hero, skills, combat, save, engine) {
    this.game = game; this.world = world; this.hero = hero;
    this.skills = skills; this.combat = combat; this.save = save; this.engine = engine;
    this.panel = null;      // open panel name
    this.placeDef = null;   // building being placed
    this.buildSelection = null;
    this.bindDock();
    this.bindEvents();
  }

  bindEvents() {
    this.game.events.on('change', () => this.renderTop());
    this.game.events.on('toast', ({ msg, kind }) => this.toast(msg, kind));
    this.game.events.on('levelup', ({ skill }) => this.levelUpFlash(skill));
  }

  bindDock() {
    const dock = $('dock');
    dock.addEventListener('click', e => {
      const btn = e.target.closest('.dock-btn');
      if (!btn) return;
      this.leavePlaceMode();
      const name = btn.dataset.panel;
      if (name === 'build') { this.toggleBuildPalette(); return; }
      this.openPanel(name, btn);
    });
    $('left-close').addEventListener('click', () => this.closePanel());
    $('build-btn').addEventListener('click', e => e.stopPropagation());
  }

  // ---------------- Top bar ----------------
  renderTop() {
    const s = this.game.s;
    const colors = { gold: '#ffd54f', wood: '#b07a42', stone: '#aab', food: '#e67e44', gems: '#6fd3ff' };
    const icons = { gold: '💰', wood: '🪵', stone: '🪨', food: '🍖', gems: '💎' };
    $('res-row').innerHTML = '';
    for (const r of ['gold', 'wood', 'stone', 'food', 'gems']) {
      const v = Math.floor(s.resources[r] || 0);
      const cap = this.game.maxCapFor(r);
      const div = el('div', 'res');
      div.innerHTML = `<span class="ico">${icons[r]}</span><span class="val" style="color:${r === 'gold' ? colors.gold : 'inherit'}">${v}</span>`;
      div.title = `${r.toUpperCase()} (cap ${Math.floor(cap)})`;
      $('res-row').appendChild(div);
    }
    $('hero-lvl').textContent = `Lv ${this.combat.atkLvl()}`;
    const hp = Math.max(0, Math.floor(s.hp));
    const max = Math.floor(this.game.maxHp());
    $('hp-fill').style.width = (hp / max * 100) + '%';
    $('tick-val').textContent = s.settings.tickMs + 'ms';
  }

  levelUpFlash(skill) {
    this.toast(`⬆ ${SKILLS[skill].name} level up!`, 'good');
  }

  // ---------------- Toasts ----------------
  toast(msg, kind) {
    const t = el('div', 'toast ' + (kind || ''), msg);
    $('toast-area').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 420); }, 3200);
  }

  // ---------------- Context left panel ----------------
  showTarget(desc) {
    $('left-panel').classList.remove('hidden');
    const body = $('left-body');
    body.innerHTML = '';
    const close = el('button', 'x', '');
    if (desc.kind === 'node') this.nodeTarget(body, desc);
    else if (desc.kind === 'monster') this.monsterTarget(body, desc);
    else if (desc.kind === 'building') this.buildingTarget(body, desc);
    else { body.innerHTML = `<p>Nothing there.</p>`; }
  }

  nodeTarget(body, desc) {
    const def = NODES[desc.type];
    const lvl = this.game.skillLvl(def.skill);
    const can = lvl >= (def.lvl || 1);
    body.appendChild(el('h3', '', `${def.ico} ${def.name}`));
    body.appendChild(el('p', '', `Skill: <b>${SKILLS[def.skill].name}</b>`));
    if (def.lvl) body.appendChild(el('p', '', can ? `✅ You can gather this` : `🔒 Requires ${SKILLS[def.skill].name} lv ${def.lvl} (you: ${lvl})`));
    const yields = def.yields.map(y => {
      const it = ITEMS[y.item];
      return `<b>${it ? it.ico : y.item} ${it ? it.name : y.item}</b>` + (y.p ? ` (${Math.round(y.p * 100)}%${y.min ? `, ${y.min}-${y.max}` : ''})` : '');
    }).join(', ');
    body.appendChild(el('p', '', `Drops: ${yields}`));
    body.appendChild(el('p', '', `Click it to start ${SKILLS[def.skill].name}.`));
  }

  monsterTarget(body, desc) {
    const m = this.combat.monsterById(desc.id);
    if (!m) return;
    const def = MONSTERS[m.type];
    body.appendChild(el('h3', '', `${def.ico} ${def.name}`));
    this.statRow(body, 'HP', `${Math.max(0, Math.floor(m.hp))}/${def.hp}`);
    this.statRow(body, 'Attack', def.atk);
    this.statRow(body, 'Defense', def.def);
    this.statRow(body, 'Gold', `${def.gold[0]}-${def.gold[1]}`);
    const drops = def.drops.map(d => { const it = ITEMS[d[0]]; return `${it ? it.ico : ''} ${it ? it.name : d[0]} (${Math.round(d[1] * 100)}%)`; }).join(', ');
    body.appendChild(el('p', '', `Drops: ${drops || 'nothing'}`));
    const atk = el('button', 'btn primary', '⚔ Attack');
    atk.onclick = () => this.closePanel();
    body.appendChild(atk);
  }

  buildingTarget(body, desc) {
    const def = BUILDINGS[desc.id];
    body.appendChild(el('h3', '', `${def.ico} ${def.name}`));
    body.appendChild(el('p', '', desc.level ? `Level ${desc.level}${def.unique ? ' (Town landmark)' : ''}` : ''));
    body.appendChild(el('p', '', def.desc));
    if (def.passive) body.appendChild(el('p', '', `Passive per tick: ${Object.entries(def.passive).map(([r, n]) => `${n * desc.level} ${r}`).join(', ')}`));
    if (desc.id === 'town_center') body.appendChild(el('p', '', `Offline idle cap: ${Math.round(this.game.idleCapSec() / 3600)}h`));
    if (def.buff) body.appendChild(el('p', '', `Buffs: ${Object.entries(def.buff).map(([s, m]) => `+${Math.round((m - 1) * 100)}% ${SKILLS[s].name}`).join(', ')}`));
    // Upgrade
    if (def.passive) {
      const cost = { wood: (def.cost.wood || 20) * desc.level, stone: (def.cost.stone || 0) * desc.level, gold: (def.cost.gold || 10) * desc.level };
      const btn = el('button', 'btn', `⬆ Upgrade (${this.costStr(cost)})`);
      btn.onclick = () => {
        if (!this.game.canAfford(cost)) { this.toast('Not enough resources', 'bad'); return; }
        this.game.spend(cost);
        for (const b of this.game.s.buildings) if (b.tx === desc.tx && b.ty === desc.ty) b.level = (b.level || 1) + 1;
        this.game.toast(`${def.name} upgraded to level ${desc.level + 1}`, 'good');
        this.renderTop();
        this.refreshBodies();
      };
      body.appendChild(btn);
    }
  }

  statRow(body, k, v) {
    const r = el('div', 'row'); r.innerHTML = `<span>${k}</span><span>${v}</span>`;
    body.appendChild(r);
  }

  costStr(cost) {
    const icons = { wood: '🪵', stone: '🪨', gold: '💰' };
    return Object.entries(cost).filter(([, n]) => n > 0).map(([r, n]) => `${icons[r] || r} ${n}`).join(' ');
  }

  // ---------------- Panels ----------------
  openPanel(name, btn) {
    this.closePanel();
    this.panel = name;
    if (btn) btn.classList.add('active');
    $('left-panel').classList.remove('hidden');
    $('left-body').innerHTML = '';
    if (name === 'inventory') this.inventoryPanel();
    else if (name === 'skills') this.skillsPanel();
    else if (name === 'quests') this.questsPanel();
    else if (name === 'settings') this.settingsPanel();
  }

  closePanel() {
    this.panel = null;
    $('left-panel').classList.add('hidden');
    document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));
    this.leavePlaceMode();
    this.world.highlight.hide();
  }

  refreshBodies() {
    if (this.panel === 'inventory') this.inventoryPanel();
    else if (this.panel === 'skills') this.skillsPanel();
    else if (this.panel === 'quests') this.questsPanel();
  }

  inventoryPanel() {
    const body = $('left-body');
    body.appendChild(el('div', 'panel-title', '🎒 Inventory'));
    const grid = el('div', 'inv-slot-grid');
    const entries = Object.entries(this.game.s.inventory).filter(([, q]) => q > 0);
    if (entries.length === 0) body.appendChild(el('p', '', 'Empty. Go gather!'));
    for (const [id, qty] of entries) {
      const it = ITEMS[id];
      const slot = el('div', 'inv-slot');
      if (id === this.game.s.equipped.weapon || id === this.game.s.equipped.armor) slot.classList.add('equipped');
      slot.innerHTML = `<span class="grow">${it.ico}</span><span class="qty">×${qty}</span>`;
      slot.title = `${it.name} — ${it.desc}`;
      slot.onclick = () => this.invAction(id, it, slot);
      grid.appendChild(slot);
    }
    body.appendChild(grid);
    body.appendChild(el('p', '', 'Tip: click an item to eat (food), equip (weapon/armor), or drop (mats).'));
  }

  invAction(id, it, slot) {
    const s = this.game.s;
    if (it.type === 'food') {
      this.game.heal(it.heal);
      this.game.removeItem(id, 1);
      this.toast(`Ate ${it.name} (+${it.heal} HP)`, 'good');
    } else if (it.type === 'weapon' || it.type === 'armor') {
      const slotKey = it.type;
      s.equipped[slotKey] = id;
      if (it.type === 'weapon') { if (s.equipped.armor === id) s.equipped.armor = null; }
      else { if (s.equipped.weapon === id) s.equipped.weapon = null; }
      this.toast(`Equipped ${it.name}`, 'good');
    } else {
      // drop a material
      this.game.removeItem(id, 1);
      this.toast(`Dropped ${it.name}`);
    }
    this.refreshBodies();
    this.renderTop();
  }

  skillsPanel() {
    const body = $('left-body');
    body.appendChild(el('div', 'panel-title', '📊 Skills'));
    for (const name of SKILL_ORDER) {
      const sk = SKILLS[name];
      const lvl = this.game.skillLvl(name);
      const xp = this.game.s.skills[name].xp;
      const need = xpToNext(lvl);
      const row = el('div', 'skill-row');
      const bar = el('div', 'skill-bar'); bar.innerHTML = `<div style="width:${Math.min(100, (xp / (xp + need)) * 100)}%"></div>`;
      row.innerHTML = `<span class="sname">${sk.ico} ${sk.name}</span>`;
      const right = el('span', 'sval');
      right.innerHTML = `Lv ${lvl} `;
      right.appendChild(bar);
      right.insertAdjacentHTML('beforeend', ` <b>${Math.floor(xp / need * 100)}%</b>`);
      row.appendChild(right);
      body.appendChild(row);
    }
    // Crafting
    body.appendChild(el('div', 'panel-title', '⚗ Craft'));
    for (const r of RECIPES) {
      const lvl = this.game.skillLvl(r.skill);
      const ok = lvl >= r.lvl;
      const card = el('div', 'build-card' + (ok ? '' : ' locked'));
      const hasAll = Object.entries(r.inputs).every(([it, q]) => this.game.hasItem(it, q));
      card.innerHTML = `<div class="n">${r.ico} ${r.name} <span style="color:${ok ? 'var(--good)' : 'var(--bad)'}">${ok ? SKILLS[r.skill].name : `🔒 ${r.skill} ${r.lvl}`}</span></div>
        <div class="d">${r.desc}</div>
        <div class="c ${hasAll ? 'ok' : ''}">${this.costStr(r.inputs)} → ${r.out && Object.entries(r.out).map(([o, q]) => `<b>${ITEMS[o].ico}×${q}</b>`).join(' ')}</div>`;
      card.onclick = () => this.skills.craft(r.id);
      body.appendChild(card);
    }
  }

  questsPanel() {
    const body = $('left-body');
    body.appendChild(el('div', 'panel-title', '🧭 Quests'));
    for (const q of QUESTS) {
      const done = !!this.game.s.quests[q.id];
      const prog = this.questProgress(q);
      const item = el('div', 'quest-item' + (done ? ' done' : ''));
      item.innerHTML = `<h4>${done ? '✅' : '📌'} ${q.name}</h4>
        <div class="qdesc">${q.desc}</div>
        ${done ? '<div class="qprog">Complete! Reward claimed.</div>' : `<div class="qprog">${prog.cur}/${prog.target || '—'}</div>`}`;
      body.appendChild(item);
    }
  }

  questProgress(q) {
    const s = this.game.s;
    switch (q.type) {
      case 'item': return { cur: s.inventory[q.item] || 0, target: q.target };
      case 'skill': return { cur: this.game.skillLvl(q.skill), target: q.target };
      case 'kill': return { cur: s.monstersKilled[q.monster] || 0, target: q.target };
      case 'build': return { cur: s.buildings.some(b => b.id === q.building) ? 1 : 0, target: 1 };
      default: return { cur: 0, target: q.target };
    }
  }

  // ---------------- Settings / save ----------------
  settingsPanel() {
    const body = $('left-body');
    body.appendChild(el('div', 'panel-title', '⚙ Settings & Save'));
    body.appendChild(el('p', '', 'Progress auto-saves every 30 seconds.'));
    const btnSave = el('button', 'btn primary', '💾 Save now');
    btnSave.onclick = () => { this.save.save(); this.toast('Game saved', 'good'); };
    const btnEx = el('button', 'btn', '⬇ Export JSON');
    btnEx.onclick = () => this.save.downloadJSON();
    const btnCopy = el('button', 'btn', '📋 Copy base64');
    btnCopy.onclick = () => {
      const b64 = this.save.exportBase64();
      navigator.clipboard && navigator.clipboard.writeText(b64);
      this.toast('Base64 copied (huge — also try JSON file)');
    };
    const btnImport = el('button', 'btn', '⬆ Import');
    btnImport.onclick = () => this.importModal();
    const btnWipe = el('button', 'btn danger', '🗑 Reset / wipe saves');
    btnWipe.onclick = () => this.confirm((cb) => { this.save.wipe(); this.game.reset(); this.refreshBodies(); this.renderTop(); cb(); });
    body.appendChild(btnSave); body.appendChild(btnEx); body.appendChild(btnCopy); body.appendChild(btnImport);
    body.appendChild(el('p', '', ''));
    // tick speed
    body.appendChild(el('label', '', 'Tick speed:'));
    const speeds = [200, 400, 600, 800, 1000];
    const sel = el('select') ;
    speeds.forEach(sp => { const o = el('option', '', sp + 'ms'); o.value = sp; if (sp === this.game.s.settings.tickMs) o.selected = true; sel.appendChild(o); });
    sel.style.cssText = 'width:100%;background:#0d1318;color:#fff;border:1px solid var(--border);padding:6px;border-radius:8px;margin:6px 0;';
    sel.onchange = () => { this.game.setTickMs(+sel.value); this.toast(`Tick: ${sel.value}ms`, 'good'); };
    body.appendChild(sel);
    body.appendChild(el('label', '', 'Auto-eat below HP:'));
    const eat = el('input'); eat.type = 'number'; eat.value = this.game.s.settings.autoEatHp; eat.min = 0; eat.max = 100;
    eat.style.cssText = 'width:100%;background:#0d1318;color:#fff;border:1px solid var(--border);padding:6px;border-radius:8px;margin:6px 0;';
    eat.onchange = () => { this.game.s.settings.autoEatHp = Math.max(0, Math.min(100, +eat.value || 35)); this.toast('Auto-eat updated'); };
    body.appendChild(eat);
    body.appendChild(btnWipe);
  }

  importModal() { this.modal(`<h2>Import save</h2><p>Paste a JSON export, or a base64 string, below.</p><textarea id="imp" rows="6" placeholder="Paste save data..."></textarea>`); }

  confirm(fn) {
    this.modal(`<h2>Confirm</h2><p>This cannot be undone. Proceed?</p>
      <div class="modal-actions"><button class="btn" id="cf-no">Cancel</button><button class="btn danger" id="cf-yes">Yes, do it</button></div>`);
    $('cf-no').onclick = () => this.closeModal();
    $('cf-yes').onclick = () => { this.closeModal(); fn && fn(); };
  }

  // ---------------- Build palette ----------------
  toggleBuildPalette() {
    const p = $('build-palette');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) this.renderBuildList();
    else this.leavePlaceMode();
    const btn = $('build-btn');
    if (!p.classList.contains('hidden')) btn.classList.add('active'); else btn.classList.remove('active');
  }

  renderBuildList() {
    const list = $('build-list');
    list.innerHTML = '';
    for (const [id, def] of Object.entries(BUILDINGS)) {
      if (id === 'town_center') continue; // built by default
      const card = el('div', 'build-card' + (this.buildSelection === id ? ' selected' : ''));
      const lvl = this.game.skillLvl('construction');
      const req = def.lvl.construction || 1;
      const locked = lvl < req;
      card.innerHTML = `<div class="n">${def.ico} ${def.name} <span style="font-size:11px;color:var(--muted)">${def.size}×${def.size}</span></div>
        <div class="d">${def.desc}</div>
        <div class="c ${locked ? 'locked' : 'ok'}">${locked ? `🔒 Const. lv ${req}` : this.costStr(def.cost)}</div>`;
      card.onclick = () => { this.buildSelection = id; this.renderBuildList(); this.enterPlaceMode(id); };
      list.appendChild(card);
    }
  }

  enterPlaceMode(id) {
    this.placeDef = BUILDINGS[id];
    this.toast(`Placing ${this.placeDef.name} — click the ground`, 'gold');
  }
  leavePlaceMode() {
    this.placeDef = null;
    this.buildSelection = null;
    this.world.highlight.hide();
    const pal = $('build-palette');
    if (!pal.classList.contains('hidden')) pal.classList.add('hidden');
    document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));
    if (this.renderBuildList) ; // no-op
  }

  // ---------------- Modal ---------------- 
  modal(html) {
    this.closeModal();
    const veil = el('div', 'modal-veil');
    veil.innerHTML = `<div class="modal">${html}<div class="modal-actions"><button class="btn" id="modal-close">Close</button></div></div>`;
    veil.id = 'active-modal';
    veil.addEventListener('click', e => { if (e.target === veil) this.closeModal(); });
    $('modal-root').appendChild(veil);
    veil.querySelector('#modal-close').onclick = () => this.closeModal();
    return veil;
  }
  closeModal() {
    const v = $('active-modal');
    if (v) v.remove();
    const btn = $('modal-close-extra'); if (btn) btn.remove();
  }

  offlineReport(seconds, gains) {
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
    const rows = Object.entries(gains).map(([r, n]) => `<div class="kv"><span>${r}</span><span>+${n}</span></div>`).join('');
    const v = this.modal(`<h2>📜 Offline gains</h2><p>While you were away (${h}h ${m}m) your settlement produced:</p>${rows || '<p>Nothing — build passive producers!</p>'}`);
  }
}