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