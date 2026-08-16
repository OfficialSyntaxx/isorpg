// CombatSystem: 600ms-tick combat, OSRS-style damage rolls, auto-eat, weighted
// drops, xp + KC + collection log (GDD §5.C/D).
import type { GameState } from "../state/GameState";
import type { MonsterCombat } from "../world/Monster";
import { levelFromXp } from "../data/XPTable";
import { WEAPONS, FOODS, type WeaponDef, getWeapon, type MonsterDef } from "../data/Combat";
import type { SkillId } from "../data/Skills";
import { addItem, removeItem, type InventoryComponent } from "../components/Inventory";
import { armorBonuses } from "../components/Equipment";

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
}

const EAT_THRESHOLD = 0.4; // auto-eat below 40% HP
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
    // P2: the equipped weapon slot wins; otherwise the best carried weapon.
    const eq = this.state.player.equipped.weapon;
    if (eq) return getWeapon(eq);
    return getWeapon(firstWeaponItem(this.state.player.inventory));
  }

  maxHp(): number {
    return levelFromXp(this.state.player.skills.hitpoints.xp) + 9 + armorBonuses(this.state).maxHp;
  }

  addMonster(m: MonsterCombat) {
    this.monsters.set(m.id, m);
    this.gridNow().setOccupant(m.tile.x, m.tile.y, "MONSTER", m.id);
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

    this.playerAtkAcc++;
    if (this.playerAtkAcc >= weapon.ticks) {
      this.playerAtkAcc = 0;
      this.tryPlayerAttack(target, weapon, now);
    }

    target.attackAcc++;
    const atkTick = target.def.boss && target.enraged ? 2 : target.def.attackTick;
    if (this.monsterCanHit(target) && target.attackAcc >= atkTick) {
      target.attackAcc = 0;
      this.tryMonsterAttack(target);
    }

    if (health.hp > 0 && health.hp / health.maxHp < EAT_THRESHOLD) {
      this.autoEat();
    }
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

  private tryPlayerAttack(target: MonsterCombat, weapon: WeaponDef, now: number) {
    const b = armorBonuses(this.state);
    const attackLevel = levelFromXp(this.state.player.skills.attack.xp);
    const roll = weapon.accuracy + attackLevel + b.attack;
    if (Math.random() > hitChance(roll, target.def.defenseRoll)) return; // splash

    const strLevel = levelFromXp(this.state.player.skills.strength.xp);
    const maxHit = weapon.maxHit + Math.floor(strLevel / 4) + b.strength;
    const damage = 1 + Math.floor(Math.random() * Math.max(1, maxHit));

    target.hp = Math.max(0, target.hp - damage);
    target.flashUntil = now + 220;
    this.gain("attack", target.def.xp.attack);
    this.gain("strength", target.def.xp.strength);
    this.gain("hitpoints", target.def.xp.hitpoints);
    this.cb.onPlayerHit?.(target, damage);
    if (weapon.kind === "ranged") this.cb.onPlayerShot?.(target.tile.x, target.tile.y); // P4c arrow

    if (target.hp <= 0) this.onKill(target);
  }

  private tryMonsterAttack(target: MonsterCombat) {
    const health = this.state.player.health;
    const defLevel = levelFromXp(this.state.player.skills.defense.xp) + armorBonuses(this.state).defense;
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

    const main = rollWeighted(m.def.main);
    if (main) { addItem(inv, main, 1); drops.push(main); }

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
    for (const m of this.monsters.values()) {
      if (m.dead && now >= m.respawnAt) {
        m.hp = m.def.hp;
        m.dead = false;
        m.inCombat = false;
        m.attackAcc = 0;
      }
    }
  }
}

function firstWeaponItem(inv: InventoryComponent): string | null {
  // First weapon the hero carries; higher level-req weapons count too.
  for (const item of inv.items) {
    for (const w of Object.values(WEAPONS)) {
      if (w.itemId === item.id) return item.id;
    }
  }
  return null;
}

function hitChance(attackRoll: number, defenseRoll: number): number {
  if (attackRoll > defenseRoll) {
    return 1 - (defenseRoll + 2) / (2 * (attackRoll + 1));
  }
  return attackRoll / (2 * (defenseRoll + 1));
}

function rollWeighted(entries: { itemId: string; weight: number }[]): string | null {
  if (!entries.length) return null;
  const total = entries.reduce((a, e) => a + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.itemId;
  }
  return entries[entries.length - 1].itemId;
}

function rand(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}