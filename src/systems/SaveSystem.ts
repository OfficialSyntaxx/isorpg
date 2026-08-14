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
      },
      town: { buildings: this.state.town.buildings.map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, level: b.level })) },
      collectionLog: { unlocked: [...this.state.collectionLog] },
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
    this.state.town.buildings = (s.town?.buildings ?? []).map((b: any) => ({
      id: String(b.id), type: b.type, x: b.x, y: b.y, level: b.level,
    }));
    this.state.collectionLog = new Set((s.collectionLog?.unlocked ?? []).map(String));
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
      const gained = Math.min(actions * best.yield, p.inventory.storageCap);
      addItem(p.inventory, itemId, gained);
      const xp = (ITEMS_XP[itemId]?.xp?.[best.skill] ?? 5) * actions;
      p.skills[best.skill].xp += xp;
      xpEarned += xp;
      this.state.collectionLog.add(itemId);
      lines.push(`${gained.toLocaleString()} × ${ITEM_NAME[itemId] ?? itemId}`);
    }

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