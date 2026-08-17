// Pure data: item stack inventory + storage cap.

import { ITEMS } from "../data/Items";

export interface ItemStack {
  id: string;
  amount: number;
}

export interface InventoryComponent {
  items: ItemStack[];
  storageCap: number; // bulk resource storage cap
}

export function createInventory(): InventoryComponent {
  return { items: [], storageCap: 500 };
}

export function countItem(inv: InventoryComponent, id: string): number {
  const s = inv.items.find((i) => i.id === id);
  return s ? s.amount : 0;
}

/**
 * Does this item count against the bulk storage cap?
 *
 * The GDD scopes the cap (and the Storehouse upgrade) to *bulk resources* —
 * logs, ore, bars, fish, planks and the like. Currency, keys, quest tokens and
 * pets (all `MISC`) plus gear and tools are carried regardless, so a full bag
 * never blocks coin income, a quest reward or a rare drop.
 *
 * Unknown ids are treated as bulk, so a new resource is capped by default.
 */
export function isBulk(id: string): boolean {
  const def = ITEMS[id];
  if (!def) return true;
  return def.type !== "MISC" && !def.equip && !def.tool;
}

/**
 * Add up to `amount` of an item, respecting the storage cap.
 *
 * Returns the amount ACTUALLY stored, which may be less than requested (0 when
 * full). The cap used to be advisory: several call sites checked it by hand and
 * several didn't, so combat drops and the offline calculation could blow past
 * it — offline capped each skill independently, letting three gathering skills
 * each fill the whole cap. Enforcing it here makes it an invariant instead of a
 * convention, and callers can react to a short add.
 */
export function addItem(inv: InventoryComponent, id: string, amount: number): number {
  if (amount <= 0) return 0;
  let put = amount;
  if (isBulk(id)) {
    const room = Math.max(0, inv.storageCap - storedAmount(inv));
    put = Math.min(amount, room);
    if (put <= 0) return 0;
  }
  const s = inv.items.find((i) => i.id === id);
  if (s) s.amount += put;
  else inv.items.push({ id, amount: put });
  return put;
}

/** True when the bag cannot take another unit of a bulk resource. */
export function isFull(inv: InventoryComponent): boolean {
  return storedAmount(inv) >= inv.storageCap;
}

export function removeItem(inv: InventoryComponent, id: string, amount: number): boolean {
  const s = inv.items.find((i) => i.id === id);
  if (!s || s.amount < amount) return false;
  s.amount -= amount;
  if (s.amount <= 0) inv.items = inv.items.filter((i) => i.id !== id);
  return true;
}

/** Total stored bulk resources — the figure the storage cap applies to. */
export function storedAmount(inv: InventoryComponent): number {
  return inv.items.reduce((a, i) => a + (isBulk(i.id) ? i.amount : 0), 0);
}

/** F.5: the fraction of each carried bulk stack lost on death. */
export const DEATH_LOSS_PCT = 0.15;

/**
 * Death has stakes: lose a slice of what's unbanked. "Unbanked" reuses the
 * bulk/non-bulk split the storage cap already draws — coins, equipment,
 * tools and quest items (all `MISC`/`equip`/`tool`) are exactly what a
 * Storehouse run doesn't need to protect, so they're never at risk. Only
 * the raw materials still sitting in the bag are.
 *
 * Floored per stack, so it stays forgiving: a stack under ~7 loses nothing
 * (floor(6 × 0.15) = 0), and losses only bite once a haul is worth banking.
 */
export function applyDeathPenalty(inv: InventoryComponent): ItemStack[] {
  const lost: ItemStack[] = [];
  for (const item of inv.items) {
    if (!isBulk(item.id)) continue;
    const amount = Math.floor(item.amount * DEATH_LOSS_PCT);
    if (amount <= 0) continue;
    item.amount -= amount;
    lost.push({ id: item.id, amount });
  }
  inv.items = inv.items.filter((i) => i.amount > 0);
  return lost;
}