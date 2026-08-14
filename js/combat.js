// ------------------------------------------------------------------
// Combat: OSRS-style tick-based auto-attacks. Each combat tick both
// the hero and the monster take a swing with accuracy/damage rolls and
// crits. Player may auto-eat food below a threshold. On monster death
// loot/XP drop and a respawn is scheduled.
// ------------------------------------------------------------------
import { MONSTERS, ITEMS } from './data.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Combat {
  constructor(game, world, hero, skills) {
    this.game = game; this.world = world; this.hero = hero; this.skills = skills;
    this.active = null; // monster id currently fought
  }

  monsterById(id) { return this.game.s.monsters.find(m => m.id === id) || null; }

  weapon() {
    const w = this.game.s.equipped.weapon;
    return w ? ITEMS[w] : null;
  }
  armor() {
    const a = this.game.s.equipped.armor;
    return a ? ITEMS[a] : null;
  }
  atkLvl() { return this.game.skillLvl('attack'); }
  defLvl() { return this.game.skillLvl('defense'); }
  hpLvl() { return this.game.skillLvl('health'); }

  // begin fighting a monster the hero is adjacent to
  startFight(id) {
    const m = this.monsterById(id);
    if (!m) return;
    this.active = id;
    this.hero.busy = true;
    this.hero.faceToward(m.tx, m.ty);
  }
  stopFight() { this.active = null; if (this.hero) this.hero.busy = false; }

  fighting() { return this.active != null; }

  adjacent(tx, ty) {
    const h = this.hero;
    return Math.max(Math.abs(h.tx - tx), Math.abs(h.ty - ty)) === 1;
  }

  // resolve one combat tick
  combatTick() {
    if (!this.active) return;
    const m = this.monsterById(this.active);
    if (!m) { this.stopFight(); return; }
    if (!this.adjacent(m.tx, m.ty)) { this.stopFight(); return; }
    const def = MONSTERS[m.type];

    // ---- player attack ----
    const wep = this.weapon();
    const atkBonus = wep ? wep.atk : 3;
    const acc = 40 + this.atkLvl() * 3 + atkBonus;
    const mev = 10 + def.def * 4;
    const hitP = clamp(0.25, 0.95, 0.55 + (acc - mev) / 200);
    if (Math.random() < hitP) {
      const maxHit = 2 + Math.floor(this.atkLvl() / 4) + (wep ? wep.atk : 1);
      let dmg = 1 + Math.floor(Math.random() * maxHit);
      const crit = Math.random() < 0.1;
      if (crit) dmg = Math.floor(dmg * 1.8 + 1);
      m.hp -= dmg;
      this.hitFloat(m.id, (crit ? '⚡' : '') + dmg);
      const xp = this.skills.buffSkill('attack', 4 + Math.floor(dmg * 0.4));
      this.game.addXp('attack', xp);
      if (m.hp <= 0) { this.kill(m, def); return; }
    } else {
      this.hitFloat(m.id, 'miss', 0xaaaaaa);
    }

    // ---- monster attack ----
    const defenseBonus = this.armor() ? this.armor().def : 0;
    const defAcc = 30 + this.defLvl() * 2 + defenseBonus;
    const mov = 15 + def.atk * 3;
    const mHitP = clamp(0.15, 0.8, 0.5 + (mov - defAcc) / 200);
    if (Math.random() < mHitP) {
      let dmg = 1 + Math.floor(Math.random() * Math.max(1, def.atk - Math.floor(defenseBonus / 2)));
      this.game.s.hp -= dmg;
      this.hitFloat(this.active, dmg, 0xef5350, true);
      this.game.addXp('defense', this.skills.buffSkill('defense', 3 + Math.floor(dmg * 0.3)));
      if (this.game.s.hp <= 0) { this.playerDied(def); return; }
    }
  }

  playerDied(def) {
    this.game.addXp('health', this.skills.buffSkill('health', 20));
    this.stopFight();
    // soft death: respawn at home
    const home = this.game.s.buildings.find(b => b.id === 'town_center');
    this.hero.place(home ? home.tx + 1 : 36, home ? home.ty + 1 : 36);
    this.game.s.hp = this.game.maxHp();
    this.game.toast(`You were slain by a ${def.name}. You woke at home.`, 'bad');
    this.game.events.emit('change');
  }

  kill(m, def) {
    // loot
    const gold = def.gold[0] + Math.floor(Math.random() * (def.gold[1] - def.gold[0] + 1));
    this.game.grant('gold', gold);
    for (const [item, p] of def.drops) {
      if (Math.random() < p) {
        if (this.slotFree()) this.game.addItem(item, 1);
        else this.game.toast('Inventory full, drop lost', 'bad');
      }
    }
    this.game.s.monstersKilled[m.type] = (this.game.s.monstersKilled[m.type] || 0) + 1;
    // XP
    this.game.addXp('attack', this.skills.buffSkill('attack', def.xp * 0.5));
    this.game.addXp('defense', this.skills.buffSkill('defense', def.xp * 0.35));
    this.game.addXp('health', this.skills.buffSkill('health', def.xp * 0.15));
    const isBoss = m.type === 'dragon' || m.type === 'dark_mage';
    this.game.toast(`Defeated ${def.name}! +${gold} gold${isBoss ? ' (boss!)' : ''}`, 'gold');
    this.world.flashMonster(m.id, 0xffffff);
    setTimeout(() => this.world.removeMonster(m.id), 260);
    this.active = null;
    this.hero.busy = false;
    // schedule respawn
    m.respawn = isBoss ? 600 : 50;
    m.hp = 0;
    m.id = null;
    this.game.events.emit('change');
  }

  slotFree() {
    const count = Object.keys(this.game.s.inventory).length;
    // allow 40 stack slots (multiples of existing items don't add slots)
    return count < 40;
  }

  regenTick() {
    // small hp regen when not fighting and not at cap threshold
    if (this.active) return;
    const maxHp = this.game.maxHp();
    if (this.game.s.hp < maxHp) {
      let regen = 0.05 + this.hpLvl() * 0.01;
      this.game.s.hp = Math.min(maxHp, this.game.s.hp + regen);
    }
  }

  // respawn timers
  respawnTick() {
    for (const m of this.game.s.monsters) {
      if (m.respawn > 0) {
        m.respawn--;
        if (m.respawn <= 0 && !m.id) {
          this.spawn(m);
        }
      }
    }
  }

  spawn(m) {
    const def = MONSTERS[m.type];
    m.hp = def.hp;
    m.respawn = 0;
    if (!m.id) {
      m.id = 'm' + Math.floor(Math.random() * 1e9);
      this.world.addMonster(m.id, m.type, m.tx, m.ty, 1);
    }
  }

  // floating damage text (simple DOM, positioned by main's projection)
  hitFloat(mid, txt, color, toPlayer) {
    if (!this.world.overlay) return;
    const m = toPlayer ? { tx: this.hero.tx, ty: this.hero.ty } : this.monsterById(mid);
    if (!m) return;
    const el = document.createElement('div');
    el.className = 'dmg-float';
    el.textContent = txt;
    el.style.color = color || '#fff';
    el.dataset.tx = m.tx; el.dataset.ty = m.ty;
    this.world.overlay.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, 850);
  }
}