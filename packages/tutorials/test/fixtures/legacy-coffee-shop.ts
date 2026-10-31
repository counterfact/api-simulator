// Saved v1 demo implementations used to verify legacy check compatibility.
export const SHOP_CONTEXT = `export type OrderItem = { productId: string; quantity: number };

export class Context {
  inventory: Record<string, number> = {};
  private nextOrderId = 1;
  // Identifies this in-memory session, not a credential.
  sessionId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  private decafSetting = 0;

  setDecafStock(quantity: number) {
    // Apply an edited starting quantity once; later purchases keep their changes.
    if (quantity !== this.decafSetting) {
      this.inventory["decaf"] = quantity;
      this.decafSetting = quantity;
    }
  }

  canFulfill(items: OrderItem[]) {
    return items.length > 0
      && items.every(item => Number.isInteger(item.quantity) && item.quantity > 0)
      && this.getShortages(items).length === 0;
  }

  getShortages(items: OrderItem[]) {
    const shortages: { productId: string; requested: number; available: number }[] = [];
    for (const [productId, requested] of this.quantitiesFor(items)) {
      const available = this.inventory[productId] ?? 0;
      if (requested > available) shortages.push({ productId, requested, available });
    }
    return shortages;
  }

  confirmOrder(items: OrderItem[]) {
    return { orderId: this.nextOrderId++, items };
  }

  private quantitiesFor(items: OrderItem[]) {
    const quantities = new Map<string, number>();
    for (const item of items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    return quantities;
  }
}
`;

export const SHOP_PRODUCTS = `import type { HTTP_GET } from "../types/paths/products.types.js";

// Lesson: change Decaf's starting stock from 0 to 5, then save and watch the shop update.
// The changed setting is applied once; later requests read the running inventory.
const decafStock = 0;

export const GET: HTTP_GET = ($) => {
  $.context.setDecafStock(decafStock);
  return $.response[200].json([
    { id: "house-blend", name: "House Blend", description: "Chocolate, caramel, and a gentle finish.", price: 1400, stock: $.context.inventory["house-blend"] },
    { id: "dark-roast", name: "Dark Roast", description: "Rich cocoa with a bold, toasted finish.", price: 1600, stock: $.context.inventory["dark-roast"] },
    { id: "decaf", name: "Decaf", description: "All the comfort of coffee. An easier evening.", price: 1500, stock: $.context.inventory["decaf"] },
  ]);
};
`;

export const SHOP_ORDERS = `import type { HTTP_POST } from "../types/paths/orders.types.js";
import type { OrderItem } from "./_.context.js";

// Lesson: set this to false to try the shop's error and retry behavior.
const ordersAvailable = true;

function reduceInventory(
  items: OrderItem[],
  inventory: Record<string, number>,
) {
  // TODO: For each item, subtract its quantity from inventory[item.productId].
}

export const POST: HTTP_POST = function ($) {
  if (!ordersAvailable) {
    return $.response[503].json({ error: "Ordering is temporarily unavailable." });
  }
  const items = $.body.items;
  if (!$.context.canFulfill(items)) {
    return $.response[409].json({
      error: "There isn't enough stock for this order.",
      shortages: $.context.getShortages(items),
    });
  }

  reduceInventory(items, $.context.inventory);

  return $.response[201].json($.context.confirmOrder(items));
};
`;
