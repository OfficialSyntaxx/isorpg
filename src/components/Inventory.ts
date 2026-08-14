// Pure data: item stack inventory + storage cap.

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

export function addItem(inv: InventoryComponent, id: string, amount: number): number {
  const s = inv.items.find((i) => i.id === id);
  if (s) {
    s.amount += amount;
    return s.amount;
  }
  inv.items.push({ id, amount });
  return amount;
}

export function removeItem(inv: InventoryComponent, id: string, amount: number): boolean {
  const s = inv.items.find((i) => i.id === id);
  if (!s || s.amount < amount) return false;
  s.amount -= amount;
  if (s.amount <= 0) inv.items = inv.items.filter((i) => i.id !== id);
  return true;
}

/** Total stored bulk resources vs cap. */
export function storedAmount(inv: InventoryComponent): number {
  return inv.items.reduce((a, i) => a + i.amount, 0);
}