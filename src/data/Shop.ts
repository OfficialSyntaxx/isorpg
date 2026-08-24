// The merchant's stock table.
//
// Extracted from `src/systems/ShopSystem.ts` so the Unity content exporter can
// read it. That file imports three.js for the stall mesh, so it can never be
// require()d by a build script — which left shop prices as the one piece of
// content that would have had to be transcribed by hand into C#. Two of this
// migration's worst bugs were transcription errors from exactly that, so the
// data moved instead.
//
// `ShopSystem` re-exports STOCK, so nothing that imports it from there changes.
export interface ShopStockEntry {
  itemId: string;
  price: number;
}

/** What the merchant stocks, with fixed base prices. */
export const STOCK: ShopStockEntry[] = [
  // Seeds are the entry point to Farming — without a source it is unreachable.
  { itemId: "potato_seed", price: 10 },
  { itemId: "cabbage_seed", price: 36 },
  { itemId: "redberry_seed", price: 120 },
  { itemId: "cooked_shrimp", price: 40 },
  { itemId: "cooked_trout", price: 60 },
  { itemId: "combat_potion", price: 120 },
  { itemId: "bronze_sword", price: 30 },
  { itemId: "bronze_2h", price: 55 },
  { itemId: "shortbow", price: 90 },
  { itemId: "bronze_helm", price: 60 },
  { itemId: "bronze_plate", price: 90 },
  { itemId: "bronze_legs", price: 60 },
  { itemId: "iron_sword", price: 220 },
];

/** Sell-price curve — flooding an item with supply drags its price down. */
export function sellMultFor(supply: number, demand: number): number {
  const v = (1 + 0.12 * demand) / (1 + 0.1 * supply);
  return Math.min(1.5, Math.max(0.4, v));
}

/** Buy-price curve — shop demand and coin hoarding push prices up. */
export function buyMultFor(supply: number, demand: number, coinCount: number): number {
  const inflation = 1 + Math.min(0.25, coinCount / 4000);
  const v = ((1 + 0.08 * demand) / (1 + 0.05 * supply)) * inflation;
  return Math.min(1.4, Math.max(0.6, v));
}
