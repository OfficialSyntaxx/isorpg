// CombatSystem: 600ms-tick combat, OSRS-style damage rolls, auto-eat, weighted
// drops, xp + KC + collection log (GDD §5.C/D).
import type { GameState } from "../state/GameState";
import type { MonsterCombat } from "../world/Monster";
import { levelFromXp } from "../data/XPTable";
import { FOODS, type WeaponDef, selectWeapon, type MonsterDef, ATTACK_STYLES, BUFFS, RESOLVE_MAX, RESOLVE_REGEN_PER_TICK, RESOLVE_REGEN_RANGE } from "../data/Combat";
import type { SkillId } from "../data/Skills";
import { addItem, removeItem, type InventoryComponent } from "../components/Inventory";
import { armorBonuses } from "../components/Equipment";
import { play as sfx } from "../core/Sfx";

export interface CombatEvents {
  onPlayerHit?: (monster: MonsterCombat, damage: number) => void;
  onHurtByMonster?: (damage: number) => void;
  onKill?: (monster: MonsterCombat, drops: string[], kc: number) => void;
  onPet?: (itemId: string) => void;
  onAutoEat?: (itemId: string, healed: number) => void;
  onDeath?: () => void;
  onLevelUp?: (skill: SkillId, level: number) => void;
  /** P4b: boss telegraph ring — tile when winding up, null when it lands/fizzles. */
  onBossTelegraph?: (tile: { x: number; y: number } | null) => void;
  /** P4c: a ranged player attack connected — pitch a visible projectile. */
  onPlayerShot?: (toX: number, toY: number) => void;
  /** F.2: a buff ran out of resolve and switched itself off. */
  onBuffExhausted?: () => void;
}


const RANGED_RANGE = 5; // tiles: bows / ranged monsters engage from here

export class CombatSystem {
  private state: GameState;
  private cb: CombatEvents = {};
  private monsters = new Map<string, MonsterCombat>();
  private target: MonsterCombat | null = null;
  private playerAtkAcc = 0;
  private bossSlam: { x: number; y: number; at: number; dmg: number } | null = null;
  /** P5: active grid override (dungeon while in the dungeon). */
  private activeGrid: { isWalkable(x: number, y: number): boolean; at(x: number, y: number): { occupant: string; walkable: boolean; zoneId: string } | null; setOccupant(x: number, y: number, t: string, id: string | null): void; clearOccupant(x: number, y: number): void } | null = null;

  constructor(state: GameState) {
    this.state = state;
  }

  setCallbacks(cb: CombatEvents) { this.cb = cb; }

  /** P5: route monster AI/occupancy to a different grid (dungeon) while active. */
  setActiveGrid(g: typeof CombatSystem.prototype.activeGrid) { this.activeGrid = g; }
  private gridNow() { return this.activeGrid ?? this.state.world.grid; }

  get registry() { return this.monsters; }
  get engaged() { return this.target && !this.target.dead ? this.target : null; }
  /** P5.3: true while a boss slam is telegraphed and waiting to land. */
  get slamActive(): boolean { return this.bossSlam !== null; }
  get slamTile(): { x: number; y: number } | null { return this.bossSlam ? { x: this.bossSlam.x, y: this.bossSlam.y } : null; }
  /** Map of monster id -> kill count (persisted alongside saves). */
  static kcCounts: Record<string, number> = {};
  static kcTotal(): number {
    return Object.values(CombatSystem.kcCounts).reduce((a, b) => a + b, 0);
  }

  equippedWeapon(): WeaponDef {
    const p = this.state.player;
    return selectWeapon(p.inventory, p.equipped.weapon, levelFromXp(p.skills.attack.xp));
  }

  maxHp(): number {
    return levelFromXp(this.state.player.skills.hitpoints.xp) + 9 + armorBonuses(this.state).maxHp;
  }

  addMonster(m: MonsterCombat) {
    this.monsters.set(m.id, m);
    this.gridNow().setOccupant(m.tile.x, m.tile.y, "MONSTER", m.id);
  }

  /** P7.2: fully remove a monster (dungeon floor swaps). */
  removeMonster(m: MonsterCombat): void {
    this.monsters.delete(m.id);
    if (m.group.parent) m.group.parent.remove(m.group);
    this.gridNow().clearOccupant(m.tile.x, m.tile.y);
    if (this.target === m) this.target = null;
  }

  monsterAt(x: number, y: number): MonsterCombat | null {
    const t = this.state.world.grid.at(x, y);
    if (t && t.occupant === "MONSTER" && t.occupantId) return this.monsters.get(t.occupantId) ?? null;
    return null;
  }

  /** The player targets this monster (walks adjacent in the caller, then confirmFight). */
  engage(m: MonsterCombat) {
    if (m.dead) return;
    this.target = m;
    m.inCombat = true;
    this.playerAtkAcc = 0;
  }

  confirmFight() {
    if (!this.target) return;
    this.playerAtkAcc = this.equippedWeapon().ticks; // first strike lands on the next tick
    this.target.inCombat = true;
  }

  stop() {
    if (this.target) this.target.inCombat = false;
    this.target = null;
  }

  tick(dtMs: number, now: number) {
    const health = this.state.player.health;
    health.maxHp = this.maxHp();
    if (health.hp > health.maxHp) health.hp = health.maxHp;
    this.updateResolve();
    this.aiChase();
    // P4b: bosses enrage below half HP.
    for (const mm of this.monsters.values()) {
      if (mm.def.boss) mm.enraged = mm.hp > 0 && mm.hp <= mm.maxHp / 2;
    }
    this.updateBossSlam(now);
    const target = this.target;
    if (!target || target.dead) {
      if (target && target.dead) this.target = null;
      return;
    }
    // P4b/P5.3: a boss winds up a slam at the player's current tile. Enraged
    // bosses slam every few ticks; slamChance bosses telegraph even at full HP.
    if (target.def.boss && !this.bossSlam) {
      const chance = target.enraged ? 0.15 : (target.def.slamChance ?? 0);
      if (Math.random() < chance) {
        this.bossSlam = {
          x: this.state.player.pos.gx, y: this.state.player.pos.gy, at: now,
          dmg: target.def.slamDmg ?? 6 + Math.floor(Math.random() * 5),
        };
        this.cb.onBossTelegraph?.({ x: this.bossSlam.x, y: this.bossSlam.y });
      }
    }
    const weapon = this.equippedWeapon();

    // The player's swing is range-gated the same way the monster's is. Without
    // this the hero could keep hitting a target from anywhere on the map while
    // it had no way to answer.
    this.playerAtkAcc++;
    if (this.playerAtkAcc >= weapon.ticks && this.playerCanHit(target, weapon)) {
      this.playerAtkAcc = 0;
      this.tryPlayerAttack(target, weapon, now);
    }

    target.attackAcc++;
    const atkTick = target.def.boss && target.enraged ? 2 : target.def.attackTick;
    if (this.monsterCanHit(target) && target.attackAcc >= atkTick) {
      target.attackAcc = 0;
      target.actor?.play("attack");
      this.tryMonsterAttack(target);
    }

    // Player-tunable: 0 disables auto-eat entirely, for anyone who would rather
    // ration their food by hand than have it gulped down at a fixed 40%.
    const eatPct = this.state.settings.autoEatPct;
    if (eatPct > 0 && health.hp > 0 && health.hp / health.maxHp < eatPct / 100) {
      this.autoEat();
    }
  }

  /** Can the player reach this target right now — melee adjacent, ranged within
   *  bow range? Mirrors monsterCanHit so both sides use one rule. */
  private playerCanHit(m: MonsterCombat, weapon: WeaponDef): boolean {
    const d = Math.max(Math.abs(m.tile.x - this.state.player.pos.gx), Math.abs(m.tile.y - this.state.player.pos.gy));
    return weapon.kind === "ranged" ? d <= RANGED_RANGE : d <= 1;
  }

  /** P4: can this monster actually hit the player right now (melee = adjacent,
   *  ranged = within bow range)? */
  private monsterCanHit(m: MonsterCombat): boolean {
    const d = Math.max(Math.abs(m.tile.x - this.state.player.pos.gx), Math.abs(m.tile.y - this.state.player.pos.gy));
    return m.def.ranged ? d >= 1 && d <= RANGED_RANGE : d <= 1;
  }

  /** P4: monsters hunt — approach the player when aggroed, back off (ranged) to
   *  keep their distance, and leash back home when they stray too far. + safe
   *  zones (4c): town/settlement tiles are no-place-for-monsters — they never
   *  chase into them and leave immediately if they end up there. */
  private aiChase() {
    const p = this.state.player.pos;
    for (const m of this.monsters.values()) {
      if (m.dead) continue;
      // Safe zone: inside the settlement ring ⇒ de-aggro and head home.
      if (this.isSafeTile(m.tile.x, m.tile.y)) {
        m.inCombat = false;
        this.returnHome(m);
        continue;
      }
      const d = Math.max(Math.abs(m.tile.x - p.gx), Math.abs(m.tile.y - p.gy));
      if (!m.inCombat && d > m.def.aggroRange) { this.returnHome(m); continue; }
      // Leash: too far from the spawn anchor — give up and head home.
      if (Math.max(Math.abs(m.tile.x - m.home.x), Math.abs(m.tile.y - m.home.y)) > 8) {
        m.inCombat = false;
        this.step(m, m.home.x, m.home.y);
        continue;
      }
      m.inCombat = true;
      if (m.def.ranged) {
        if (d < RANGED_RANGE - 1) this.stepAway(m, p.gx, p.gy, true); // too close — back off
        else if (d > RANGED_RANGE) this.step(m, p.gx, p.gy, true); // too far — close distance
      } else if (d > 1) {
        this.step(m, p.gx, p.gy, true); // chase, but never into the settlement
      }
    }
  }

  private isSafeTile(x: number, y: number): boolean {
    const t = this.state.world.grid.at(x, y);
    return !!t && (t.zoneId === "TOWN_CENTER" || t.zoneId === "SETTLEMENT");
  }

  private returnHome(m: MonsterCombat) {
    if (Math.max(Math.abs(m.tile.x - m.home.x), Math.abs(m.tile.y - m.home.y)) > 1) {
      this.step(m, m.home.x, m.home.y);
    }
  }

  /** Move one tile toward (tx,ty), never onto water/buildings/another monster,
   *  and (with avoidSafe) never into the settlement ring. */
  private step(m: MonsterCombat, tx: number, ty: number, avoidSafe = false) {
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    for (const [dx, dy] of dirs) {
      const nx = m.tile.x + dx, ny = m.tile.y + dy;
      const t = this.gridNow().at(nx, ny);
      if (!t || !t.walkable || t.occupant !== "NONE") continue;
      if (avoidSafe && (t.zoneId === "TOWN_CENTER" || t.zoneId === "SETTLEMENT")) continue;
      const score = Math.abs(nx - tx) + Math.abs(ny - ty);
      if (score < bestScore) { bestScore = score; best = { x: nx, y: ny }; }
    }
    if (best) this.moveMonster(m, best.x, best.y);
  }

  /** Move one tile AWAY from (tx,ty) — ranged monsters keep their distance. */
  private stepAway(m: MonsterCombat, tx: number, ty: number, avoidSafe = false) {
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (const [dx, dy] of dirs) {
      const nx = m.tile.x + dx, ny = m.tile.y + dy;
      const t = this.gridNow().at(nx, ny);
      if (!t || !t.walkable || t.occupant !== "NONE") continue;
      if (avoidSafe && (t.zoneId === "TOWN_CENTER" || t.zoneId === "SETTLEMENT")) continue;
      const score = Math.abs(nx - tx) + Math.abs(ny - ty);
      if (score > bestScore) { bestScore = score; best = { x: nx, y: ny }; }
    }
    if (best) this.moveMonster(m, best.x, best.y);
  }

  private moveMonster(m: MonsterCombat, nx: number, ny: number) {
    this.gridNow().clearOccupant(m.tile.x, m.tile.y);
    m.tile = { x: nx, y: ny };
    this.gridNow().setOccupant(nx, ny, "MONSTER", m.id);
    m.group.position.set(nx, 0, ny);
  }

  /** F.2: drain resolve while a buff burns, else regen it resting by a Campfire. */
  private updateResolve() {
    const p = this.state.player;
    if (p.activeBuff) {
      const cost = BUFFS[p.activeBuff].costPerTick;
      p.resolve = Math.max(0, p.resolve - cost);
      if (p.resolve <= 0) {
        p.activeBuff = null;
        this.cb.onBuffExhausted?.();
      }
      return;
    }
    if (p.resolve < RESOLVE_MAX && this.nearCampfire()) {
      p.resolve = Math.min(RESOLVE_MAX, p.resolve + RESOLVE_REGEN_PER_TICK);
    }
  }

  private nearCampfire(): boolean {
    const pos = this.state.player.pos;
    return this.state.town.buildings.some((b) =>
      b.type === "CAMPFIRE" && Math.max(Math.abs(b.x - pos.gx), Math.abs(b.y - pos.gy)) <= RESOLVE_REGEN_RANGE);
  }

  /** F.2: the active buff's contribution to the player's rolls — 0s if none. */
  private buffBonus() {
    const id = this.state.player.activeBuff;
    return id ? BUFFS[id] : { accuracyBonus: 0, maxHitBonus: 0, defenseBonus: 0 };
  }

  private tryPlayerAttack(target: MonsterCombat, weapon: WeaponDef, now: number) {
    const style = ATTACK_STYLES[this.state.settings.attackStyle];
    const buff = this.buffBonus();
    const b = armorBonuses(this.state);
    const attackLevel = levelFromXp(this.state.player.skills.attack.xp);
    const roll = weapon.accuracy + attackLevel + b.attack + style.accuracyBonus + buff.accuracyBonus;
    if (Math.random() > hitChance(roll, target.def.defenseRoll)) return; // splash

    const strLevel = levelFromXp(this.state.player.skills.strength.xp);
    const maxHit = weapon.maxHit + Math.floor(strLevel / 4) + b.strength + style.maxHitBonus + buff.maxHitBonus;
    const damage = 1 + Math.floor(Math.random() * Math.max(1, maxHit));

    target.hp = Math.max(0, target.hp - damage);
    target.flashUntil = now + 220;
    // F.1: the chosen stance trains exactly one of attack/strength/defense —
    // hitpoints trickles in regardless, same as before styles existed.
    this.gain(style.trains, target.def.xp[style.trains]);
    this.gain("hitpoints", target.def.xp.hitpoints);
    this.cb.onPlayerHit?.(target, damage);
    if (weapon.kind === "ranged") this.cb.onPlayerShot?.(target.tile.x, target.tile.y); // P4c arrow

    if (target.hp <= 0) this.onKill(target);
  }

  private tryMonsterAttack(target: MonsterCombat) {
    const health = this.state.player.health;
    const style = ATTACK_STYLES[this.state.settings.attackStyle];
    const buff = this.buffBonus();
    const defLevel = levelFromXp(this.state.player.skills.defense.xp) + armorBonuses(this.state).defense + style.defenseBonus + buff.defenseBonus;
    if (Math.random() > hitChance(target.def.attackRoll, 2 + defLevel)) return; // dodge

    const dmgMax = target.def.maxHit + (target.enraged ? 2 : 0); // P4b: enraged hits harder
    const damage = 1 + Math.floor(Math.random() * Math.max(1, dmgMax));
    health.hp = Math.max(0, health.hp - damage);
    this.gain("defense", target.def.xp.defense);
    this.gain("hitpoints", Math.max(1, Math.round(target.def.xp.hitpoints * 0.5)));
    this.cb.onHurtByMonster?.(damage);

    if (health.hp <= 0) this.diePlayer();
  }

  /** Player death: toast, respawn at town centre healed, clear the fight. */
  private diePlayer() {
    this.cb.onDeath?.();
    const c = Math.floor(this.state.world.grid.width / 2);
    this.state.player.pos.gx = c; this.state.player.pos.gy = c;
    this.state.player.pos.wx = c; this.state.player.pos.wz = c;
    this.state.player.health.hp = this.state.player.health.maxHp;
    this.stop();
  }

  /** P4b: an armed boss slam lands ~1.6s after it was telegraphed. Standing on
   *  the marked tile takes heavy damage — step off to dodge. */
  private updateBossSlam(now: number) {
    const slam = this.bossSlam;
    if (!slam) return;
    if (now >= slam.at + 1600) {
      this.cb.onBossTelegraph?.(null);
      this.bossSlam = null;
      const p = this.state.player.pos;
      if (p.gx === slam.x && p.gy === slam.y) {
        const dmg = slam.dmg;
        this.state.player.health.hp = Math.max(0, this.state.player.health.hp - dmg);
        this.cb.onHurtByMonster?.(dmg);
        if (this.state.player.health.hp <= 0) this.diePlayer();
      }
    }
  }

  private gain(skill: SkillId, xp: number) {
    const s = this.state.player.skills[skill];
    const before = levelFromXp(s.xp);
    s.xp += xp;
    const after = levelFromXp(s.xp);
    if (after > before) this.cb.onLevelUp?.(skill, after);
  }

  private autoEat() {
    const inv = this.state.player.inventory;
    let best: string | null = null;
    let bestTier = -1;
    for (const item of inv.items) {
      const f = FOODS[item.id];
      if (f && f.tier > bestTier) { bestTier = f.tier; best = item.id; }
    }
    if (!best) return;
    removeItem(inv, best, 1);
    const heal = FOODS[best].heal;
    this.state.player.health.hp = Math.min(this.state.player.health.maxHp, this.state.player.health.hp + heal);
    this.cb.onAutoEat?.(best, heal);
  }

  private onKill(m: MonsterCombat) {
    const inv = this.state.player.inventory;
    const drops: string[] = [];

    // Roll the whole entry, not just its id: the main table's min/max were being
    // discarded, so every drop paid exactly 1 — a Zombie's "10–40 coins" paid 1.
    const main = rollWeighted(m.def.main);
    if (main) {
      const qty = rand(main.min ?? 1, main.max ?? 1);
      addItem(inv, main.itemId, qty);
      drops.push(main.itemId);
    }

    if (m.def.tertiary) {
      for (const t of m.def.tertiary) {
        if (Math.random() < t.chance) { addItem(inv, t.itemId, rand(t.min, t.max)); drops.push(t.itemId); }
      }
    }
    if (m.def.petTable) {
      for (const p of m.def.petTable) {
        if (Math.random() < p.chance) {
          addItem(inv, p.itemId, 1);
          this.cb.onPet?.(p.itemId);
          this.state.collectionLog.add(p.itemId);
        }
      }
    }

    const kc = (this.state.player.meta.kills[m.def.id] ?? 0) + 1;
    // P6.4: tallies persist with the save so the Meta page survives reloads.
    this.state.player.meta.kills[m.def.id] = kc;
    CombatSystem.kcCounts[m.id] = kc;
    drops.forEach((d) => this.state.collectionLog.add(d));

    m.dead = true;
    m.respawnAt = Date.now() + m.def.respawnMs;
    m.inCombat = false;
    this.cb.onKill?.(m, drops, kc);
    this.target = null;
  }

  private playerAdjacent(m: MonsterCombat): boolean {
    const p = this.state.player.pos;
    return Math.max(Math.abs(m.tile.x - p.gx), Math.abs(m.tile.y - p.gy)) <= 1;
  }

  /** Respawn dead monsters late in the tick. */
  update(dtMs: number, now: number) {
    // Animation state per monster: walking if it moved since the last update,
    // otherwise idle. Attack is triggered on the swing itself (see tick()), and
    // wins until the next state change because play() ignores repeats.
    for (const m of this.monsters.values()) {
      if (!m.dead && m.actor) {
        const moved = !m.lastTile || m.lastTile.x !== m.tile.x || m.lastTile.y !== m.tile.y;
        m.actor.play(moved ? "walk" : "idle");
      }
      m.lastTile = { x: m.tile.x, y: m.tile.y };
    }
    for (const m of this.monsters.values()) {
if (m.dead && now >= m.respawnAt) {
          m.hp = m.def.hp;
          m.dead = false;
          sfx("monster_spawn");
        m.inCombat = false;
        m.attackAcc = 0;
      }
    }
  }
}

function hitChance(attackRoll: number, defenseRoll: number): number {
  if (attackRoll > defenseRoll) {
    return 1 - (defenseRoll + 2) / (2 * (attackRoll + 1));
  }
  return attackRoll / (2 * (defenseRoll + 1));
}

interface WeightedDrop { itemId: string; weight: number; min?: number; max?: number; }

function rollWeighted<T extends WeightedDrop>(entries: T[]): T | null {
  if (!entries.length) return null;
  const total = entries.reduce((a, e) => a + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

function rand(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}