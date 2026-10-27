import { coffeeShopPage } from "./coffee-shop-page.js";

const validationModule = new URL("./coffee-shop-validation.js", import.meta.url)
  .href;

const telemetryModule = new URL("./coffee-shop-telemetry.js", import.meta.url)
  .href;

const item = {
  type: "object",
  required: ["productId", "quantity"],
  properties: {
    productId: { type: "string", enum: ["house-blend", "dark-roast", "decaf"] },
    quantity: { type: "integer", minimum: 1 },
  },
};
const jsonResponse = (schema: object) => ({
  description: "Coffee shop response",
  content: { "application/json": { schema } },
});
const errorResponse = jsonResponse({
  type: "object",
  required: ["error"],
  properties: { error: { type: "string" } },
});
export const SHOP_DOCUMENT = {
  openapi: "3.0.3",
  info: { title: "Counterfact Coffee", version: "1.0.0" },
  paths: {
    "/tutorial-info": {
      get: {
        responses: {
          "200": jsonResponse({
            type: "object",
            required: ["projectPath", "sessionId"],
            properties: {
              projectPath: { type: "string" },
              sessionId: { type: "string" },
              revision: { type: "string" },
            },
          }),
        },
      },
    },
    "/tutorial-event": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["event", "step"],
                additionalProperties: false,
                properties: {
                  event: {
                    type: "string",
                    enum: [
                      "opened",
                      "started",
                      "phase_completed",
                      "lesson_skipped",
                      "finished",
                    ],
                  },
                  step: { type: "integer", minimum: 0, maximum: 11 },
                },
              },
            },
          },
        },
        responses: {
          "200": jsonResponse({
            type: "object",
            required: ["ok"],
            properties: { ok: { type: "boolean" } },
          }),
        },
      },
    },
    "/tutorial-check": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["step"],
                properties: { step: { type: "integer", enum: [2, 4, 5, 7] } },
              },
            },
          },
        },
        responses: {
          "200": jsonResponse({
            type: "object",
            required: ["revision", "ok", "message"],
            properties: {
              revision: { type: "string" },
              ok: { type: "boolean" },
              message: { type: "string" },
            },
          }),
        },
      },
    },
    "/products": {
      get: {
        responses: {
          "200": jsonResponse({
            type: "array",
            items: {
              type: "object",
              required: ["id", "name", "description", "price", "stock"],
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                description: { type: "string" },
                price: { type: "integer" },
                stock: { type: "integer", minimum: 0 },
              },
            },
          }),
        },
      },
    },
    "/orders": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["items"],
                properties: {
                  items: { type: "array", minItems: 1, items: item },
                },
              },
            },
          },
        },
        responses: {
          "201": jsonResponse({
            type: "object",
            required: ["orderId", "items"],
            properties: {
              orderId: { type: "integer" },
              items: { type: "array", items: item },
            },
          }),
          "409": jsonResponse({
            type: "object",
            required: ["error", "shortages"],
            properties: {
              error: { type: "string" },
              shortages: {
                type: "array",
                items: {
                  type: "object",
                  required: ["productId", "requested", "available"],
                  properties: {
                    productId: { type: "string" },
                    requested: { type: "integer" },
                    available: { type: "integer", minimum: 0 },
                  },
                },
              },
            },
          }),
          "503": errorResponse,
        },
      },
    },
    "/walkthrough": {
      get: {
        responses: {
          "200": {
            description: "Guided coffee shop",
            content: { "text/html": { schema: { type: "string" } } },
          },
        },
      },
    },
  },
};

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

export function coffeeShopFiles(projectPath: string): Record<string, string> {
  return {
    "routes/tutorial-info.ts": `import type { HTTP_GET } from "../types/paths/tutorial-info.types.js";
// Keep native ESM import when Counterfact compiles this route to CommonJS.
const helpers = new Function("url", "return import(url)")(${JSON.stringify(validationModule)});
export const GET: HTTP_GET = async ($) => $.response[200].json({ projectPath: ${JSON.stringify(projectPath)}, sessionId: $.context.sessionId, revision: await (await helpers).shopRevision(${JSON.stringify(projectPath)}) });
`,
    "routes/tutorial-event.ts": `import type { HTTP_POST } from "../types/paths/tutorial-event.types.js";
// Keep native ESM import when Counterfact compiles this route to CommonJS.
const helpers = new Function("url", "return import(url)")(${JSON.stringify(telemetryModule)});
export const POST: HTTP_POST = async ($) => {
  try { (await helpers).reportCoffeeShopEvent($.context.sessionId, $.body.event, $.body.step); } catch { /* Reporting never blocks learning. */ }
  return $.response[200].json({ ok: true });
};
`,
    "routes/tutorial-check.ts": `import type { HTTP_POST } from "../types/paths/tutorial-check.types.js";
// Keep native ESM import when Counterfact compiles this route to CommonJS.
const helpers = new Function("url", "return import(url)")(${JSON.stringify(validationModule)});
export const POST: HTTP_POST = async ($) => $.response[200].json(await (await helpers).checkShopSave(${JSON.stringify(projectPath)}, $.body.step));
`,
    "routes/_.context.ts": SHOP_CONTEXT,
    "routes/products.ts": SHOP_PRODUCTS,
    "routes/orders.ts": SHOP_ORDERS,
    "scenarios/index.ts": `import type { Scenario } from "../types/_.context.js";

// A deliberately small catalog makes availability and selling out easy to see.
export const startup: Scenario = ($) => {
  $.context.inventory = { "house-blend": 5, "dark-roast": 3, "decaf": 0 };
};
`,
    "routes/walkthrough.ts": `import type { HTTP_GET } from "../types/paths/walkthrough.types.js";

export const GET: HTTP_GET = ($) => $.response[200].html(${JSON.stringify(coffeeShopPage(projectPath))});
`,
  };
}
