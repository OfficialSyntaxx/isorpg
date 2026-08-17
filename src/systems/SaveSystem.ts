// Persistence: localStorage autosave, IndexedDB backup, sanitized load with
// fallback recovery, JSON import/export, and offline progression (GDD §7).
import type { GameState } from "../state/GameState";
import { Storage } from "../utils/Storage";
import { sanitizeSave } from "../utils/Sanitizer";
import { EngineLogger } from "../utils/Logger";
import { RESOURCES, type ResourceDef, type SkillId } from "../data/Skills";
import { SKILL_IDS } from "../data/Skills";
import { levelFromXp } from "../data/XPTable";
import { addItem } from "../components/Inventory";
import { TICK_MS } from "../core/Engine";
import { accrueLabourOffline } from "./LabourSystem";
import { RESOLVE_MAX, SPECIAL_MAX } from "../data/Combat";

/** P7.9: offline Town Hall tax — 2 coins per level per ~6s idle cycle (capped by the same cap). */
export function offlineTaxFor(hallLevel: number, awaySeconds: number): number {
  if (hallLevel <= 0 || awaySeconds <= 0) return 0;
  const cycles = Math.floor(awaySeconds / 6);
  return hallLevel * 2 * Math.max(0, cycles);
}

const AUTOSAVE_EVERY_TICKS = 20; // ~12s
const DEFAULT_OFFLINE_CAP_S = 8 * 3600; // 8 hours (Town Hall extends to 12h)

export interface OfflineSummary {
  capApplied: boolean;
  awaySeconds: number;
  lines: string[];
  xpEarned: number;
}

export class SaveSystem {
  private state: GameState;
  private tickCount = 0;
  private lastSaveTs = Date.now();
  private offlineCapHours: () => number = () => DEFAULT_OFFLINE_CAP_S / 3600;

  constructor(state: GameState) { this.state = state; }

  /** Wire in BuildSystem's Town Hall bonus once it exists (main.ts). */
  setOfflineCapProvider(fn: () => number) { this.offlineCapHours = fn; }

  /** Serialize exactly the GDD schema. */
  serialize(): Record<string, unknown> {
    const p = this.state.player;
    const skills: Record<string, unknown> = {};
    for (const id of SKILL_IDS) {
      const s = p.skills[id];
      skills[id] = { xp: s.xp, mastery: { ...s.mastery } };
    }
    return {
      version: this.state.version,
      timestamp: Date.now(),
      player: {
        name: p.name,
        position: { x: p.pos.gx, y: p.pos.gy },
        stats: { hp: p.health.hp, maxHp: p.health.maxHp },
        skills,
        inventory: p.inventory.items.map((i) => ({ id: i.id, amount: i.amount })),
        equipped: { ...p.equipped },
        journal: [...p.journal],
        meta: { kills: { ...p.meta.kills }, achievements: [...p.meta.achievements], counters: { ...p.meta.counters } },
        clue: p.clue ? { tier: p.clue.tier, seed: p.clue.seed, step: p.clue.step, sites: p.clue.sites.map((s2) => ({ x: s2.x, y: s2.y })) } : null,
        resolve: p.resolve,
        activeBuff: p.activeBuff,
        specialEnergy: p.specialEnergy,
      },
      town: {
        buildings: this.state.town.buildings.map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, level: b.level })),
        labour: {
          assignments: { ...this.state.town.labour.assignments },
          stock: { ...this.state.town.labour.stock },
          acc: { ...this.state.town.labour.acc },
          worked: { ...this.state.town.labour.worked },
        },
        market: { supply: { ...this.state.town.market.supply }, demand: { ...this.state.town.market.demand } },
        farm: { plots: this.state.town.farm.plots.map((p) => (p ? { seedId: p.seedId, plantedAt: p.plantedAt } : null)) },
      },
      collectionLog: { unlocked: [...this.state.collectionLog] },
      settings: { autoEatPct: this.state.settings.autoEatPct, attackStyle: this.state.settings.attackStyle },
      clock: { minute: this.state.clock.minute, day: this.state.clock.day },
      map: {
        discovered: [...this.state.player.map.discovered],
        fastTravel: this.state.player.map.fastTravel,
        explored: [...this.state.player.map.explored],
      },
    };
  }

  /** Apply a sanitized payload back onto live state (shared by load + import). */
  apply(obj: unknown): { ok: boolean; summary?: OfflineSummary } {
    const res = sanitizeSave(obj);
    if (!res.ok) {
      EngineLogger.logError("Save importer", res.reason ?? "invalid");
      return { ok: false };
    }
    const s = res.state as any;
    const p = this.state.player;
    // The saved timestamp is what "how long were you away" is measured from.
    // Without this, computeOffline() measured from process start — always ~0 —
    // so a returning player's idle window silently paid out nothing.
    this.state.timestamp = s.timestamp;
    p.name = s.player.name;
    p.pos.gx = s.player.position.x;
    p.pos.gy = s.player.position.y;
    p.health.hp = s.player.stats.hp;
    p.health.maxHp = s.player.stats.maxHp;
    for (const id of SKILL_IDS) {
      const sv = s.player.skills[id];
      if (sv) {
        p.skills[id].xp = sv.xp ?? 0;
        p.skills[id].mastery = { ...(sv.mastery ?? {}) };
      }
    }
    p.inventory.items = (s.player.inventory ?? []).map((i: any) => ({ id: String(i.id), amount: i.amount }));
    p.equipped = { ...((s.player as any).equipped ?? {}) };
    p.journal = ((s.player as any)?.journal ?? []).map(String);
    const sm = (s.player as any)?.meta;
    p.meta = {
      kills: { ...(sm?.kills ?? {}) },
      achievements: (sm?.achievements ?? []).map(String),
      counters: { ...(sm?.counters ?? {}) },
    };
    p.clue = (s.player as any)?.clue ?? null;
    p.resolve = (s.player as any)?.resolve ?? RESOLVE_MAX;
    p.activeBuff = (s.player as any)?.activeBuff ?? null;
    p.specialEnergy = (s.player as any)?.specialEnergy ?? SPECIAL_MAX;
    this.state.town.buildings = (s.town?.buildings ?? []).map((b: any) => ({
      id: String(b.id), type: b.type, x: b.x, y: b.y, level: b.level,
    }));
    // P7.3: villager labour survives reloads.
    const lab = (s.town as any)?.labour;
    if (lab) {
      this.state.town.labour.assignments = { ...lab.assignments };
      this.state.town.labour.stock = { ...lab.stock };
      this.state.town.labour.acc = { ...lab.acc };
      this.state.town.labour.worked = { ...(lab.worked ?? {}) };
    }
    // Farming beds. plantedAt is absolute, so crops keep ripening while away with
    // no offline pass — restoring the timestamps IS restoring the growth.
    const farm = (s.town as any)?.farm;
    this.state.town.farm.plots = (farm?.plots ?? []).map((p: any) =>
      p && typeof p.seedId === "string" ? { seedId: p.seedId, plantedAt: Number(p.plantedAt) || Date.now() } : null);
    // P7.8: market supply/demand survive reloads.
    const mkt = (s.town as any)?.market;
    if (mkt) {
      this.state.town.market.supply = { ...mkt.supply };
      this.state.town.market.demand = { ...mkt.demand };
    }
    this.state.collectionLog = new Set((s.collectionLog?.unlocked ?? []).map(String));
    if (s.settings) {
      this.state.settings.autoEatPct = s.settings.autoEatPct;
      this.state.settings.attackStyle = s.settings.attackStyle;
    }
    this.state.clock = { minute: s.clock.minute, day: s.clock.day };
    // P6: world-map discovery + fast-travel unlock persist with the save.
    p.map = {
      discovered: (s.map?.discovered ?? []).map(String),
      fastTravel: !!s.map?.fastTravel,
      explored: (s.map?.explored ?? []).map(Number).filter((n: unknown) => typeof n === "number" && Number.isFinite(n)) as number[],
    };
    return { ok: true, summary: undefined };
  }

  /** Load: primary → backup → fresh. Returns the summary if offline earned. */
  async load(): Promise<{ recoveredFrom: string; summary?: OfflineSummary }> {
    const primary = Storage.readPrimary();
    if (primary) {
      const parsed = safeParse(primary);
      if (parsed) {
        const applied = this.apply(parsed);
        if (applied.ok) {
          const summary = this.computeOffline();
          return { recoveredFrom: "localStorage", summary };
        }
      }
    }
    const backup = await Storage.readLatestBackup();
    if (backup) {
      const parsed = safeParse(backup.payload);
      if (parsed) {
        const applied = this.apply(parsed);
        if (applied.ok) {
          const summary = this.computeOffline();
          return { recoveredFrom: "IndexedDB backup", summary };
        }
      }
    }
    EngineLogger.info("No valid save found — starting a fresh profile");
    return { recoveredFrom: "fresh" };
  }

  /** Export a .json save file (for the user). */
  exportJson(): string {
    return JSON.stringify(this.serialize(), null, 2);
  }

  /** Offline progression: fast-forward deterministic gathering for capped time. */
  private computeOffline(): OfflineSummary {
    const now = Date.now();
    const awayMs = now - (this.state.timestamp || now);
    const awayS = Math.max(0, Math.round(awayMs / 1000));
    const capSeconds = this.offlineCapHours() * 3600;
    const capApplied = awayS > capSeconds;
    const capS = Math.min(awayS, capSeconds);

    const lines: string[] = [];
    let xpEarned = 0;
    // P7.5: tell the player the Town Hall raised the off-the-clock ceiling.
    const capHours = Math.round(capSeconds / 3600);
    if (capHours > 8) lines.push(`🏛️ Town Hall: offline cap raised to ${capHours}h`);
    const p = this.state.player;

    // For each skill, idle on the best available resource at ~1 action/15 ticks.
    for (const skill of SKILL_IDS) {
      const lvl = levelFromXp(p.skills[skill].xp);
      const best = bestResource(skill, lvl);
      if (!best) continue;
      const actions = Math.floor(capS / ((best.ticksPerAction * TICK_MS) / 1000));
      if (actions <= 0) continue;
      const itemId = best.drops[0]?.itemId;
      if (!itemId) continue;
      // The cap is shared across every skill, so ask for the full haul and let
      // addItem tell us what actually fit — earlier this clamped each skill to
      // the whole cap independently, so three gatherers banked 3× the cap.
      const wanted = actions * best.yield;
      const gained = addItem(p.inventory, itemId, wanted);
      if (gained <= 0) continue;
      // Only the actions whose drops fit are credited with XP.
      const done = Math.ceil(actions * (gained / wanted));
      const xp = (ITEMS_XP[itemId]?.xp?.[best.skill] ?? 5) * done;
      p.skills[best.skill].xp += xp;
      xpEarned += xp;
      this.state.collectionLog.add(itemId);
      lines.push(`${gained.toLocaleString()} × ${ITEM_NAME[itemId] ?? itemId}`);
    }

    // P7.4: assigned villagers kept producing into the stock while away.
    for (const ln of accrueLabourOffline(this.state, awayMs, capS * 1000)) lines.push(ln);

    // P7.9: the Town Hall keeps taxing while you're away.
    const hallLevel = this.state.town.buildings.filter((b) => b.type === "TOWN_HALL").reduce((a, b) => a + (b.level ?? 1), 0);
    const tax = offlineTaxFor(hallLevel, capS);
    if (tax > 0) {
      addItem(p.inventory, "coins", tax);
      lines.push(`🏛️ Town Hall tax: ${tax} coins`);
    }

    // Consume the elapsed window so a repeat load can't pay it out a second time.
    this.state.timestamp = now;

    return { capApplied, awaySeconds: awayS, lines, xpEarned };
  }

  tick(_dtMs: number): void {
    this.tickCount++;
    if (this.tickCount % AUTOSAVE_EVERY_TICKS === 0) {
      this.state.timestamp = Date.now();
      if (Storage.writePrimary(this.serialize())) {
        this.lastSaveTs = Date.now();
      }
    }
  }

  forceSave(): boolean {
    this.state.timestamp = Date.now();
    return Storage.writePrimary(this.serialize());
  }
}

import { ITEMS as ITEMS_XP } from "../data/Items";
const ITEM_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(ITEMS_XP).map(([k, v]) => [k, v.name])
);

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

function bestResource(skill: SkillId, level: number): ResourceDef | null {
  let best: ResourceDef | null = null;
  for (const def of Object.values(RESOURCES)) {
    if (def.skill !== skill) continue;
    if (def.levelReq > level) continue;
    if (!best || def.levelReq > best.levelReq) best = def;
  }
  return best;
}