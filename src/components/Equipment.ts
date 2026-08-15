// P2 equipment: equip/unequip helpers + aggregate armor/weapon bonuses.
import type { GameState } from "../state/GameState";
import type { EquipSlot } from "../data/Items";
import { ITEMS } from "../data/Items";
import { addItem, removeItem } from "./Inventory";

export const EQUIP_SLOTS: EquipSlot[] = ["weapon", "offhand", "head", "body", "legs"];

export interface StatBonuses {
  attack: number;
  strength: number;
  defense: number;
  maxHp: number;
}

/** Move one item from the inventory into its slot (old slot item returns). */
export function equipItem(state: GameState, itemId: string): boolean {
  const item = ITEMS[itemId];
  const equip = item?.equip;
  if (!equip) return false;
  const inv = state.player.inventory;
  const stack = inv.items.find((i) => i.id === itemId);
  if (!stack || stack.amount < 1) return false;
  removeItem(inv, itemId, 1);
  const prev = state.player.equipped[equip.slot];
  if (prev) addItem(inv, prev, 1);
  state.player.equipped[equip.slot] = itemId;
  return true;
}

/** Move the item in a slot back to the inventory. */
export function unequipItem(state: GameState, slot: EquipSlot): boolean {
  const cur = state.player.equipped[slot];
  if (!cur) return false;
  delete state.player.equipped[slot];
  addItem(state.player.inventory, cur, 1);
  return true;
}

/** Sum of stat bonuses from all equipped items. */
export function armorBonuses(state: GameState): StatBonuses {
  const b: StatBonuses = { attack: 0, strength: 0, defense: 0, maxHp: 0 };
  for (const slot of EQUIP_SLOTS) {
    const id = state.player.equipped[slot];
    if (!id) continue;
    const bn = ITEMS[id]?.equip?.bonus;
    if (!bn) continue;
    b.attack += bn.attack ?? 0;
    b.strength += bn.strength ?? 0;
    b.defense += bn.defense ?? 0;
    b.maxHp += bn.maxHp ?? 0;
  }
  return b;
}
