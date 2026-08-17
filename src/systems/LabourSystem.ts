// P7.3: villager labour — assign villagers to woodcutting or mining and they
// steadily fill the village stock, which the player claims into their bag.
// Persistent via GameState.town.labour (assignments, stock, accrual).
import type { GameState } from "../state/GameState";
import { addItem, type InventoryComponent } from "../components/Inventory";
import { ITEMS, itemIconHtml } from "../data/Items";

export type LabourJob = "woodcutting" | "mining";

export interface LabourWorker {
  id: string;
  name: string;
  job: LabourJob | null;
  /** P7.6: veteran tier label + worked hours (shown in the village panel). */
  tier: string;
  hours: string;
  /** P7.7: lore specialization (role + perk) or null for non-spec villagers. */
  spec: { role: string; perkName: string; icon: string } | null;
}

export interface LabourStockRow {
  itemId: string;
  name: string;
  icon: string;
  qty: number;
}

export interface LabourSnapshot {
  workers: LabourWorker[];
  stock: LabourStockRow[];
}

const WOOD_MS = 20_000; // one log per 20s per lumberjack
const MINE_MS = 30_000; // one ore per 30s per miner

export { VETERAN_TIERS, VILLAGER_SPECS, veteranTier, hoursLabel } from "../data/Npcs";
export type { VillagerSpec } from "../data/Npcs";
import { VILLAGER_SPECS, veteranTier, hoursLabel } from "../data/Npcs";

export const LABOUR_INTERVALS: Record<LabourJob, number> = { woodcutting: WOOD_MS, mining: MINE_MS };

/** Deterministic per-villager output — logs, or copper/tin ore. */
export function labourItemFor(id: string, job: LabourJob): string {
  if (job === "woodcutting") return "normal_log";
  let h = 0;
  for (const c of id) h += c.charCodeAt(0);
  return h % 100 < 65 ? "copper_ore" : "tin_ore";
}

/** P7.4: while away, assigned villagers keep producing into the stock (capped). */
export function accrueLabourOffline(state: GameState, awayMs: number, capMs: number): string[] {
  const l = state.town.labour;
  const ms = Math.min(awayMs, capMs);
  const lines: string[] = [];
  for (const [id, job] of Object.entries(l.assignments)) {
    const need = LABOUR_INTERVALS[job];
    const n = Math.floor(ms / need);
    if (n <= 0) continue;
    l.worked[id] = (l.worked[id] ?? 0) + ms; // P7.6: hours count offline too
    const item = labourItemFor(id, job);
    const total = n * veteranTier(l.worked[id]).mult;
    l.stock[item] = (l.stock[item] ?? 0) + total;
    lines.push(`${total} × ${ITEMS[item]?.name ?? item}`);
    const spec = VILLAGER_SPECS[id];
    if (spec?.item) { l.stock[spec.item] = (l.stock[spec.item] ?? 0) + n; lines.push(`${n} × ${ITEMS[spec.item]?.name ?? spec.item}`); }
    else if (spec?.coins) { l.stock["coins"] = (l.stock["coins"] ?? 0) + n; lines.push(`${n} × Coins`); }
  }
  return lines;
}

export class LabourSystem {
  private lastTick = -1;

  constructor(
    private state: GameState,
    private villagers: () => { id: string; name: string }[]
  ) {}

  assign(id: string, job: LabourJob | "idle"): void {
    const l = this.state.town.labour;
    if (job === "idle") delete l.assignments[id];
    else l.assignments[id] = job;
    l.acc[id] = 0;
  }

  jobOf(id: string): LabourJob | null {
    return this.state.town.labour.assignments[id] ?? null;
  }

  /** Accrue production while playing; caps a single tick at 60s. */
  tick(now: number): void {
    const l = this.state.town.labour;
    if (this.lastTick < 0) { this.lastTick = now; return; }
    const dt = Math.min(now - this.lastTick, 60_000);
    this.lastTick = now;
    const entries = Object.entries(l.assignments);
    if (!entries.length) return;
    for (const [id, job] of entries) {
      l.acc[id] = (l.acc[id] ?? 0) + dt;
      l.worked[id] = (l.worked[id] ?? 0) + dt; // P7.6: hours worked accrue
      const need = job === "woodcutting" ? WOOD_MS : MINE_MS;
      const mult = veteranTier(l.worked[id]).mult;
      while (l.acc[id] >= need) {
        l.acc[id] -= need;
        const item = this.produce(id, job);
        l.stock[item] = (l.stock[item] ?? 0) + mult;
        const spec = VILLAGER_SPECS[id];
        if (spec?.item) l.stock[spec.item] = (l.stock[spec.item] ?? 0) + 1;
        if (spec?.coins) l.stock["coins"] = (l.stock["coins"] ?? 0) + spec.coins;
      }
    }
  }

  /** Deterministic per-villager output — logs, or copper/tin ore. */
  private produce(id: string, job: LabourJob): string {
    return labourItemFor(id, job);
  }

  /** Move the whole village stock into the player's bag. */
  claim(inv: InventoryComponent): { itemId: string; qty: number }[] {
    const l = this.state.town.labour;
    const out = Object.entries(l.stock).map(([itemId, qty]) => ({ itemId, qty }));
    for (const [itemId, qty] of Object.entries(l.stock)) addItem(inv, itemId, qty);
    l.stock = {};
    return out;
  }

  snapshot(): LabourSnapshot {
    const l = this.state.town.labour;
    const workers = this.villagers().map((v) => {
      const worked = l.worked[v.id] ?? 0;
      const s = VILLAGER_SPECS[v.id];
      return { id: v.id, name: v.name, job: l.assignments[v.id] ?? null, tier: veteranTier(worked).label, hours: hoursLabel(worked), spec: s ? { role: s.role, perkName: s.perkName, icon: s.icon } : null };
    });
    const stock = Object.entries(l.stock).map(([itemId, qty]) => ({
      itemId, qty, name: ITEMS[itemId]?.name ?? itemId, icon: itemIconHtml(itemId),
    }));
    return { workers, stock };
  }
}