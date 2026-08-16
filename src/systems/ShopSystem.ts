// P7.1: the town market — a merchant stall near the settlement centre where
// the player sells junk for coins and buys supplies, giving the coin economy a
// real loop. Open by tapping the merchant (world tile) — the panel is a plain
// UI render fed from this system.
import * as THREE from "three";
import type { Grid } from "../world/Grid";
import { ITEMS, itemIcon } from "../data/Items";
import { countItem, addItem, removeItem, type InventoryComponent } from "../components/Inventory";

export interface ShopStockRow {
  itemId: string;
  name: string;
  icon: string;
  price: number;
}

export interface ShopSellRow {
  itemId: string;
  name: string;
  icon: string;
  qty: number;
  price: number;
}

export interface ShopSnapshot {
  coins: number;
  stock: ShopStockRow[];
  sellable: ShopSellRow[];
}

/** What the merchant stocks, with fixed prices (value ×3 for stock goods). */
const STOCK: { itemId: string; price: number }[] = [
  { itemId: "cooked_shrimp", price: 40 },
  { itemId: "cooked_trout", price: 60 },
  { itemId: "bronze_sword", price: 30 },
  { itemId: "bronze_2h", price: 55 },
  { itemId: "shortbow", price: 90 },
  { itemId: "bronze_helm", price: 60 },
  { itemId: "bronze_plate", price: 90 },
  { itemId: "bronze_legs", price: 60 },
  { itemId: "iron_sword", price: 220 },
];

const ITEM = (id: string) => ITEMS[id];
const isCoin = (id: string) => id === "coins";

export class ShopSystem {
  /** Walkable tile the merchant stall sits on (beside the centre). */
  stall = { x: 0, y: 0 };
  private grid: Grid;

  constructor(scene: THREE.Scene, grid: Grid) {
    this.grid = grid;
    this.pickStallTile();
    scene.add(this.buildStall());
  }

  private pickStallTile(): void {
    const cx = Math.floor(this.grid.width / 2), cy = Math.floor(this.grid.height / 2);
    for (let r = 9; r <= 14; r++) {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          const t = this.grid.at(x, y);
          if (!t || t.occupant !== "NONE" || !t.walkable) continue;
          if (t.zoneId !== "TOWN_CENTER" && t.zoneId !== "SETTLEMENT") continue;
          this.stall = { x, y };
          return;
        }
      }
    }
    this.stall = { x: cx, y: cy };
  }

  isStallTile(x: number, y: number): boolean {
    return this.stall.x === x && this.stall.y === y;
  }

  private buildStall(): THREE.Group {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: "#7a4a2e", flatShading: true, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: "#5a3020", flatShading: true });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 1.4), new THREE.MeshStandardMaterial({ color: "#b33a2a", flatShading: true }));
    awning.position.set(0, 1.9, 0);
    g.add(awning);
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.8, 0.09), wood);
    postL.position.set(-1.0, 0.9, -0.4);
    g.add(postL);
    const postR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.8, 0.09), wood);
    postR.position.set(1.0, 0.9, -0.4);
    g.add(postR);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.6), dark);
    counter.position.set(0, 0.55, 0.5);
    g.add(counter);
    for (let i = 0; i < 3; i++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), wood);
      crate.position.set(-0.8 + i * 0.8, 0.45, -0.55);
      g.add(crate);
    }
    // Merchant: robe + head + cap.
    const robe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.3), new THREE.MeshStandardMaterial({ color: "#5a6a7a", flatShading: true }));
    robe.position.set(-1.15, 0.55, 0.35);
    g.add(robe);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), new THREE.MeshStandardMaterial({ color: "#e0b48a", flatShading: true }));
    head.position.set(-1.15, 1.02, 0.35);
    g.add(head);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.2, 8), new THREE.MeshStandardMaterial({ color: "#b33a2a", flatShading: true }));
    cap.position.set(-1.15, 1.22, 0.35);
    g.add(cap);
    g.position.set(this.stall.x, 0, this.stall.y);
    return g;
  }

  /** Sell the whole stack of a junk item at its data value. */
  sellItem(inv: InventoryComponent, itemId: string): number {
    const it = ITEM(itemId);
    if (!it || isCoin(itemId) || it.type === "TOOL") return 0; // keep gear/tools
    const qty = countItem(inv, itemId);
    if (qty <= 0) return 0;
    const price = it.value * qty;
    removeItem(inv, itemId, qty);
    addItem(inv, "coins", price);
    return price;
  }

  /** Buy a stocked supply if affordable. Returns true on success. */
  buyItem(inv: InventoryComponent, itemId: string): boolean {
    const row = STOCK.find((s) => s.itemId === itemId);
    if (!row) return false;
    if (countItem(inv, "coins") < row.price) return false;
    removeItem(inv, "coins", row.price);
    addItem(inv, itemId, 1);
    return true;
  }

  snapshot(inv: InventoryComponent): ShopSnapshot {
    const sellable: ShopSellRow[] = [];
    for (const s of inv.items) {
      const it = ITEM(s.id);
      if (!it || isCoin(s.id) || it.type === "TOOL" || it.value <= 0) continue;
      sellable.push({ itemId: s.id, name: it.name, icon: itemIcon(s.id), qty: s.amount, price: it.value });
    }
    sellable.sort((a, b) => a.name.localeCompare(b.name));
    return {
      coins: countItem(inv, "coins"),
      stock: STOCK.map((s) => ({ itemId: s.itemId, name: ITEM(s.itemId)?.name ?? s.itemId, icon: itemIcon(s.itemId), price: s.price })),
      sellable,
    };
  }
}