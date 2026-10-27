/** Copyable learner code. None of these implementations are installed by prepareTour. */
export const CATALOG = [
  {
    id: "house-blend",
    name: "House Blend",
    description: "Chocolate, caramel, and a gentle finish.",
    price: 1400,
    stock: 5,
  },
  {
    id: "dark-roast",
    name: "Dark Roast",
    description: "Rich cocoa with a bold, toasted finish.",
    price: 1600,
    stock: 3,
  },
  {
    id: "decaf",
    name: "Decaf",
    description: "All the comfort of coffee. An easier evening.",
    price: 1500,
    stock: 0,
  },
];
const productImport =
  'import type { HTTP_GET } from "../types/paths/products.types.js";';
const orderImport =
  'import type { HTTP_POST } from "../types/paths/orders.types.js";';
export const FIXED_PRODUCTS = `${productImport}

export const GET: HTTP_GET = function ($) {
  return $.response.status(200).json(${JSON.stringify(CATALOG, null, 2)});
};
`;
export const ECHO_ORDERS = `${orderImport}

export const POST: HTTP_POST = function ($) {
  return $.response.status(201).json({ orderId: 1, items: $.body.items });
};
`;
export const FAILURE_ORDERS = `${orderImport}

const ordersAvailable = false;

export const POST: HTTP_POST = function ($) {
  if (!ordersAvailable) {
    return $.response.status(503).json({ error: "Ordering is temporarily unavailable." });
  }
  return $.response.status(201).json({ orderId: 1, items: $.body.items });
};
`;
export const CONTEXT = `export type OrderItem = { productId: string; quantity: number };
export type CatalogProduct = { id: string; name: string; description: string; price: number };

export class Context {
  catalog: CatalogProduct[] = [];
  inventory: Record<string, number> = {};
  private nextOrderId = 1;

  listProducts() {
    return this.catalog.map(product => ({ ...product, stock: this.inventory[product.id] ?? 0 }));
  }

  confirmOrder(items: OrderItem[]) {
    return { orderId: this.nextOrderId++, items };
  }
}
`;
export const RESET_METHOD = `  reset() {
    this.catalog = [];
    this.inventory = {};
    this.nextOrderId = 1;
  }
`;
export const SEEDED_CONTEXT = CONTEXT.replace(/\}\s*$/u, RESET_METHOD + "}\n");
export const STOCK_METHODS = `  canFulfill(items: OrderItem[]) {
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

  private quantitiesFor(items: OrderItem[]) {
    const quantities = new Map<string, number>();
    for (const item of items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    return quantities;
  }
`;
export const RULES_CONTEXT = SEEDED_CONTEXT.replace(
  /\}\s*$/u,
  STOCK_METHODS + "}\n",
);
export const BASELINE_SCENARIO = `import type { Scenario } from "../types/_.context.js";

// Reset the whole shop to this baseline. Three coffees keep selling out easy to observe.
export const reset: Scenario = function ($) {
  $.context.reset();
  $.context.catalog = ${JSON.stringify(
    CATALOG.map(({ stock: _stock, ...product }) => product),
    null,
    2,
  )};
  $.context.inventory = { "house-blend": 5, "dark-roast": 3, "decaf": 0 };
};

export const startup: Scenario = reset;
`;
export const RESTOCK_SCENARIO = `
export const restockDarkRoast: Scenario = function ($) {
  if (!("dark-roast" in $.context.inventory)) {
    throw new Error("Run .scenario reset before restocking Dark Roast.");
  }
  $.context.inventory["dark-roast"] = 5;
};
`;
export const CONNECTED_PRODUCTS = `${productImport}

export const GET: HTTP_GET = function ($) {
  return $.response.status(200).json($.context.listProducts());
};
`;
export const CONNECTED_ORDERS = `${orderImport}

const ordersAvailable = true;

export const POST: HTTP_POST = function ($) {
  if (!ordersAvailable) {
    return $.response.status(503).json({ error: "Ordering is temporarily unavailable." });
  }
  return $.response.status(201).json($.context.confirmOrder($.body.items));
};
`;
export const RULES_ORDERS = CONNECTED_ORDERS.replace(
  "  return $.response.status(201)",
  `  if (!$.context.canFulfill($.body.items)) {
    return $.response.status(409).json({
      error: "There isn't enough stock for this order.",
      shortages: $.context.getShortages($.body.items),
    });
  }
  return $.response.status(201)`,
);
export const INVENTORY_TODO =
  "// TODO: For each item, subtract its quantity from inventory[item.productId].";
export const INVENTORY_LOOP =
  "for (const item of items) {\n  inventory[item.productId] -= item.quantity;\n}";
export const REDUCE_ORDERS = RULES_ORDERS.replace(
  "\nconst ordersAvailable",
  `\nimport type { OrderItem } from "./_.context.js";

function reduceInventory(items: OrderItem[], inventory: Record<string, number>) {
  ${INVENTORY_TODO}
}

const ordersAvailable`,
).replace(
  "  return $.response.status(201)",
  "  reduceInventory($.body.items, $.context.inventory);\n  return $.response.status(201)",
);

export type LessonPhase = {
  id: string;
  lesson: number;
  title: string;
  explanation: string;
  instruction: string;
  edits: { file: string; instruction: string; code: string }[];
  commands?: string[];
  check?: boolean;
};
const edit = (file: string, instruction: string, code: string) => ({
  file,
  instruction,
  code,
});
export const WALKTHROUGH_VERSION = 2;
export const PHASES: LessonPhase[] = [
  {
    id: "explore",
    lesson: 1,
    title: "Explore your generated API",
    explanation:
      "The shop makes HTTP requests to your local API, which is running at ",
    instruction:
      "Open routes/products.ts. The generated starting handler calls $.response.status(200).random(): Counterfact uses the OpenAPI schema to generate a response on each request. Click Refresh products and compare the products and the actual response below the shop. The starting order stub also generates data rather than reading your cart or changing inventory. If you are revisiting an edited project, your current implementations and state stay in place.",
    edits: [
      edit(
        "routes/products.ts",
        "Inspect the generated stub. Do not change it yet.",
        "return $.response.status(200).random();",
      ),
    ],
  },
  {
    id: "catalog",
    lesson: 2,
    title: "Replace random products",
    explanation:
      "A handler is your function for an HTTP operation. Returning explicit JSON gives you control over the response instead of generating it from the schema.",
    instruction:
      "Replace routes/products.ts with the code below and save. Click Refresh products twice: the same three coffees should appear without restarting Counterfact.",
    edits: [
      edit(
        "routes/products.ts",
        "Replace this file with an explicit catalog.",
        FIXED_PRODUCTS,
      ),
    ],
    check: true,
  },
  {
    id: "order",
    lesson: 3,
    title: "Respond to the order you received",
    explanation:
      "$.body is the incoming request body. Returning its items connects the confirmation to your cart. A response by itself changes no inventory.",
    instruction:
      "Replace routes/orders.ts with the code below. Save, add a House Blend, and place an order. Inspect POST /orders below the shop: the returned items should match the request. The fixed order ID is temporary.",
    edits: [
      edit(
        "routes/orders.ts",
        "Replace the random order response.",
        ECHO_ORDERS,
      ),
    ],
    check: true,
  },
  {
    id: "fail",
    lesson: 4,
    title: "Add failure and recovery",
    explanation:
      "Your handler chooses the response status and body. Add a switch so you can produce a repeatable 503 response from the same endpoint.",
    instruction:
      "Replace routes/orders.ts with this version, save, add a coffee, and place an order. The API should return 503 and the shop should keep your cart.",
    edits: [
      edit(
        "routes/orders.ts",
        "Add an explicit unavailable response.",
        FAILURE_ORDERS,
      ),
    ],
    check: true,
  },
  {
    id: "retry",
    lesson: 4,
    title: "Add failure and recovery",
    explanation:
      "The preserved cart lets you repeat the same request after changing the handler. Saving replaces the route implementation in the running server.",
    instruction:
      "Change ordersAvailable to true, save, then click Try again. Retry the original cart so you can see the effect of changing only the API response.",
    edits: [
      edit(
        "routes/orders.ts",
        "Restore ordering.",
        "const ordersAvailable = true;",
      ),
    ],
    check: true,
  },
  {
    id: "context",
    lesson: 5,
    title: "Introduce shared context",
    explanation:
      "Counterfact creates one running Context instance for these routes. Fields hold state; methods are ordinary TypeScript that you write. catalog contains product descriptions, inventory holds quantities by ID, and nextOrderId supplies successive confirmations.",
    instruction:
      "Replace routes/_.context.ts with this class. Its collections start empty. listProducts combines descriptions and quantities; confirmOrder creates a confirmation and advances the counter. In the terminal’s ⬣> REPL, inspect context.catalog and context.inventory. Then click Check progress. The handlers still use their earlier responses until you connect them.",
    edits: [
      edit(
        "routes/_.context.ts",
        "Add the empty state and these two methods.",
        CONTEXT,
      ),
    ],
    commands: ["context.catalog", "context.inventory"],
    check: true,
  },
  {
    id: "seed",
    lesson: 6,
    title: "Initialize context explicitly",
    explanation:
      "A scenario is a function you write to change the running context. reset below installs a complete baseline. startup tells Counterfact to apply that baseline when the server starts; saving the file alone does not apply it to this session.",
    instruction:
      "Add reset() to your Context class, then replace scenarios/index.ts. Run .scenario reset in the REPL and inspect context.inventory. Click Check progress to observe the initialized state. Three coffees make stock changes easy to see.",
    edits: [
      edit(
        "routes/_.context.ts",
        "Add this method inside Context.",
        RESET_METHOD,
      ),
      edit(
        "scenarios/index.ts",
        "Replace the generated scenario file with this baseline and startup export.",
        BASELINE_SCENARIO,
      ),
    ],
    commands: [".scenario reset", "context.inventory"],
    check: true,
  },
  {
    id: "connect",
    lesson: 7,
    title: "Connect handlers to context",
    explanation:
      "Both routes now access the same object through $.context. The product handler reads its state; the order handler calls a method that changes the order counter. Saving a handler preserves the running inventory.",
    instruction:
      "Replace both handlers with these versions. Save, refresh products, then place two House Blend orders. Each confirmation should have the next order ID. The inventory still stays the same.",
    edits: [
      edit(
        "routes/products.ts",
        "Read the catalog from shared context.",
        CONNECTED_PRODUCTS,
      ),
      edit(
        "routes/orders.ts",
        "Create confirmations through shared context.",
        CONNECTED_ORDERS,
      ),
    ],
    check: true,
  },
  {
    id: "decaf",
    lesson: 8,
    title: "Change the running state",
    explanation:
      "The REPL’s context is the same instance the HTTP handlers use as $.context. Assigning a quantity changes the next product response without editing or restarting a handler.",
    instruction:
      "Set Decaf inventory to 5 in the REPL. Click Refresh products, then add Decaf and place an order. Inspect the product response to see where the displayed quantity came from.",
    edits: [],
    commands: ['context.inventory["decaf"] = 5'],
  },
  {
    id: "rules",
    lesson: 9,
    title: "Add stock rules",
    explanation:
      "Counterfact supplies the context object, but stock rules are your methods. canFulfill checks quantities; getShortages reports requested and available stock, combining repeated product IDs. The route maps that result to HTTP 409.",
    instruction:
      "Add these methods inside Context, then replace the order handler. Save, add two Dark Roast to your cart, and set its running inventory to 1 in the REPL. Click Refresh products, then place the order. The API should reject it without changing inventory. Afterward, empty your cart, restore Dark Roast to 3, and refresh products.",
    edits: [
      edit(
        "routes/_.context.ts",
        "Add stock rules inside Context.",
        STOCK_METHODS,
      ),
      edit(
        "routes/orders.ts",
        "Connect those rules to the HTTP response.",
        RULES_ORDERS,
      ),
    ],
    commands: [
      'context.inventory["dark-roast"] = 1',
      'context.inventory["dark-roast"] = 3',
    ],
    check: true,
  },
  {
    id: "observe",
    lesson: 10,
    title: "Make purchases reduce inventory",
    explanation:
      "Your current handler accepts orders and checks stock. Compare a purchase with the next product response to see whether anything updates the inventory.",
    instruction:
      "Add one Dark Roast, place an order, and compare inventory before and after. Does accepting an order also subtract stock? Answer the question below after the response arrives.",
    edits: [],
  },
  {
    id: "reduce",
    lesson: 10,
    title: "Make purchases reduce inventory",
    explanation:
      "An order confirmation and an inventory change are separate operations. The new helper receives the ordered items and the same inventory object read by the product handler.",
    instruction:
      "Replace routes/orders.ts with this version, then complete reduceInventory. Save, buy another Dark Roast, and observe the lower inventory in GET /products.",
    edits: [
      edit(
        "routes/orders.ts",
        "Add the helper and call it after stock validation.",
        REDUCE_ORDERS,
      ),
      edit(
        "routes/orders.ts",
        "Replace only the TODO inside reduceInventory with this loop.",
        INVENTORY_LOOP,
      ),
    ],
    check: true,
  },
  {
    id: "sellout",
    lesson: 11,
    title: "Exercise evolving state",
    explanation:
      "The same handlers produce in-stock and sold-out responses. Requests change shared inventory; subsequent requests read the updated value.",
    instruction:
      "Buy the remaining Dark Roast bags. The product response should report zero and the shop should show Sold out. You do not need another response implementation.",
    edits: [],
  },
  {
    id: "restock",
    lesson: 11,
    title: "Exercise evolving state",
    explanation:
      "Changing context through the REPL affects the same state that your order handler updates.",
    instruction:
      "Restock Dark Roast to 5 in the REPL, refresh products, and buy one bag. The next product response should report 4.",
    edits: [],
    commands: ['context.inventory["dark-roast"] = 5'],
  },
  {
    id: "scenario",
    lesson: 12,
    title: "Save a reusable setup",
    explanation:
      "Save a REPL state change as a named scenario so you can repeat it. This scenario changes only Dark Roast inventory. The other coffees and the order counter keep their current values.",
    instruction:
      "Append restockDarkRoast to scenarios/index.ts, save, then run .scenario restockDarkRoast. Refresh products to see 5 bags. This completes the walkthrough. Try another product or another failure condition on your own.",
    edits: [
      edit(
        "scenarios/index.ts",
        "Append this export; keep reset and startup.",
        RESTOCK_SCENARIO,
      ),
    ],
    commands: [".scenario restockDarkRoast"],
    check: true,
  },
];
export const LESSON_COUNT = Math.max(...PHASES.map((phase) => phase.lesson));
