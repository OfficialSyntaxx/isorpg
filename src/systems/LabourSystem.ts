// P7.3: villager labour — assign villagers to woodcutting or mining and they
// steadily fill the village stock, which the player claims into their bag.
// Persistent via GameState.town.labour (assignments, stock, accrual).
import type { GameState } from "../state/GameState";
import { addItem, type InventoryComponent } from "../components/Inventory";
import { ITEMS, itemIcon } from "../data/Items";

export type LabourJob = "woodcutting" | "mining";

export interface LabourWorker {
  id: string;
  name: string;
  job: LabourJob | null;
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
      const need = job === "woodcutting" ? WOOD_MS : MINE_MS;
      while (l.acc[id] >= need) {
        l.acc[id] -= need;
        const item = this.produce(id, job);
        l.stock[item] = (l.stock[item] ?? 0) + 1;
      }
    }
  }

  /** Deterministic per-villager output — logs, or copper/tin ore. */
  private produce(id: string, job: LabourJob): string {
    if (job === "woodcutting") return "normal_log";
    let h = 0;
    for (const c of id) h += c.charCodeAt(0);
    return h % 100 < 65 ? "copper_ore" : "tin_ore";
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
    const workers = this.villagers().map((v) => ({ id: v.id, name: v.name, job: l.assignments[v.id] ?? null }));
    const stock = Object.entries(l.stock).map(([itemId, qty]) => ({
      itemId, qty, name: ITEMS[itemId]?.name ?? itemId, icon: itemIcon(itemId),
    }));
    return { workers, stock };
  }
}