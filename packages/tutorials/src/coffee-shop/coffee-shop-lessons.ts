/** Lesson recipes and focused learner edits. Preparation is explicit and never runs in previews. */
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
export const CONTEXT = `import type { OrderItem } from "../types/components/schemas/OrderItem.js";
import type { Product } from "../types/components/schemas/Product.js";

export class Context {
  catalog: Omit<Product, "stock">[] = [];
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
  `\nimport type { OrderItem } from "../types/components/schemas/OrderItem.js";

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
  edits: { file: string; instruction: string }[];
  preparation?: string;
  check?: boolean;
  verification?: string;
};
const edit = (file: string, instruction: string) => ({
  file,
  instruction,
});
export const WALKTHROUGH_VERSION = 3;
export const PHASES_V2: LessonPhase[] = [
  {
    id: "explore",
    lesson: 1,
    title: "Explore your generated API",
    explanation:
      "The shop makes HTTP requests to your local API, which is running at ",
    instruction:
      "Open routes/products.ts. The generated starting handler calls `$.response.status(200).random()`: Counterfact uses the OpenAPI schema to generate a response on each request. Click Refresh products and compare the products and the actual response in your chat bubble. The starting order stub also generates data rather than reading your cart or changing inventory. If you are revisiting an edited project, your current implementations and state stay in place.",
    edits: [
      edit(
        "routes/products.ts",
        "Inspect the generated stub. Do not change it yet.",
      ),
    ],
  },
  {
    id: "catalog",
    verification:
      "Great job! You replaced the default random response with a meaningful catalog. Click Refresh products twice and compare the two responses in the chat. The same three coffees should appear each time.",
    preparation:
      "Add a catalog constant containing the three coffees in routes/products.ts. The handler keeps returning random data until you change its return statement.",
    lesson: 2,
    title: "Replace random products",
    explanation:
      "A handler is your function for an HTTP operation. Returning explicit JSON gives you control over the response instead of generating it from the schema.",
    instruction:
      "I’ve added the catalog above the handler. In routes/products.ts, replace `.random()` with `.json(catalog)` and save. Click Refresh products twice: the same three coffees should appear without restarting Counterfact.",
    edits: [
      edit(
        "routes/products.ts",
        "Keep the existing status, imports, and supplied catalog.",
      ),
    ],
    check: true,
  },
  {
    id: "order",
    verification:
      "Nice work! Your saved handler now builds its confirmation from the submitted items. In the shop, click Add to cart on House Blend, then click Place order. Expand the HTTP details in your order message and compare the submitted items with the confirmation.",
    lesson: 3,
    title: "Respond to the order you received",
    explanation:
      "`$.body` is the incoming request body. Returning its items connects the confirmation to your cart. A response by itself changes no inventory.",
    instruction:
      "In routes/orders.ts, replace `.random()` with a JSON response containing an `orderId` of 1 and an `items` property taken from the incoming request body. Keep the existing 201 status. Save, click Add to cart on House Blend, then click Place order. Inspect POST /orders in your chat bubble: the returned items should match the request. The fixed order ID is temporary.",
    edits: [
      edit(
        "routes/orders.ts",
        "Return the submitted items rather than generating new ones.",
      ),
    ],
    check: true,
  },
  {
    id: "fail",
    verification:
      "Your saved handler now produces an unavailable response when the switch is off. In the shop, click Add to cart on House Blend, then click Place order. Expand the HTTP details in your order message: the response should be 503, and House Blend should remain in your cart.",
    preparation:
      "Add `ordersAvailable = true` and the HTTP 503 branch above the existing successful response. Inspect this addition in your IDE before changing the switch.",
    lesson: 4,
    title: "Add failure and recovery",
    explanation:
      "Your handler chooses the response status and body. Add a switch so you can produce a repeatable 503 response from the same endpoint.",
    instruction:
      "Inspect the new 503 branch in routes/orders.ts, change `ordersAvailable` to `false`, and save. In the shop, click Add to cart on House Blend, then click Place order. Expand the HTTP details in your order message to check for a 503 response. The order should fail and House Blend should stay in your cart.",
    edits: [
      edit(
        "routes/orders.ts",
        "Use the existing switch to exercise the unavailable response.",
      ),
    ],
    check: true,
  },
  {
    id: "retry",
    verification:
      "Your saved handler can accept orders again. Keep the original failed items in your cart and click Try again. The response should be 201 and the successful order should clear the cart. If you changed the cart, click Restore original cart first.",
    lesson: 4,
    title: "Add failure and recovery",
    explanation:
      "The preserved cart lets you repeat the same request after changing the handler. Saving replaces the route implementation in the running server.",
    instruction:
      "Change `ordersAvailable` to `true` and save. Keep the failed items in your cart, then click Try again. If you changed the cart, click Restore original cart first. Check the order’s HTTP details for a 201 response and confirm that the cart clears.",
    edits: [edit("routes/orders.ts", "Restore ordering.")],
    check: true,
  },
  {
    id: "context",
    verification:
      "Great job! Your context methods combine product descriptions with stock and give each confirmation a successive order ID. Inspect the empty running collections in the REPL, then click Check my work. We’ll add their starting data next.",
    preparation:
      "Add empty `catalog` and `inventory` fields, the order counter, and two method stubs to routes/_.context.ts. `Product` and `OrderItem` come from Counterfact’s generated types, matching the OpenAPI schemas; this file defines no duplicate model types.",
    lesson: 5,
    title: "Introduce shared context",
    explanation:
      "Counterfact creates one running `Context` instance for these routes. Fields hold state; methods are ordinary TypeScript that you write. `catalog` contains product descriptions, `inventory` holds quantities by ID, and `nextOrderId` supplies successive confirmations.",
    instruction:
      "Inspect routes/_.context.ts. Its collections start empty. Implement `listProducts` so it returns each catalog product with a `stock` property read from inventory by product ID. Use zero when an ID has no inventory entry. Implement `confirmOrder` so it returns the supplied items and the current `nextOrderId`, then advances that counter for the next confirmation. Save the file. In the terminal’s ⬣> REPL, inspect `context.catalog` and `context.inventory`; both should still be empty. Return to the browser and click Check my work. The handlers still use their earlier responses until you connect them.",
    edits: [
      edit(
        "routes/_.context.ts",
        "Implement both method bodies while keeping the collections initially empty.",
      ),
    ],
    check: true,
  },
  {
    id: "seed",
    verification:
      "Your saved scenarios now provide a starting catalog and inventory, with startup reusing reset. Run the reset scenario in the REPL, inspect the running inventory, and click Check my work to compare the state.",
    preparation:
      "Add `Context.reset()` and the `reset` scenario containing the catalog and initial quantities. Inspect both changes in your IDE: `reset` clears state and IDs before the scenario installs its baseline. Nothing applies the scenario to the running API yet.",
    lesson: 6,
    title: "Initialize context explicitly",
    explanation:
      "A scenario is a function you write to change the running context. The prepared `reset` scenario installs a complete baseline. `startup` tells Counterfact to apply that baseline when the server starts; saving the file alone does not apply it to this session.",
    instruction:
      "Inspect `reset()` and the baseline in scenarios/index.ts. Export the existing `reset` scenario under the name `startup` as well, so both names run the same function. Save the file. In the REPL, use the `.scenario` command to run `reset`, then inspect `context.inventory`. Click Check my work to observe the initialized state. Three coffees make stock changes easy to see.",
    edits: [
      edit(
        "scenarios/index.ts",
        "Append startup so subsequent server starts apply reset.",
      ),
    ],
    check: true,
  },
  {
    id: "connect",
    verification:
      "Nice work! Your saved handlers now use the shared context for products and confirmations. Click Refresh products. Click Add to cart on House Blend, then Place order. Add House Blend again and place a second order. Expand each order’s HTTP details and compare the IDs; the second should be one greater.",
    lesson: 7,
    title: "Connect handlers to context",
    explanation:
      "Both routes now access the same object through `$.context`. The product handler reads its state; the order handler calls a method that changes the order counter. Saving a handler preserves the running inventory.",
    instruction:
      "In routes/products.ts, pass the result of the shared context’s `listProducts` method to the JSON response. In routes/orders.ts, pass the incoming items to the shared context’s `confirmOrder` method and return its result as JSON. Keep the `ordersAvailable` switch and failure branch. Save both files and click Refresh products. Click Add to cart on House Blend, then Place order. Add House Blend again and place a second order. Expand both order messages’ HTTP details to compare IDs: the second should be one greater. Inventory should stay the same.",
    edits: [
      edit("routes/products.ts", "Read the catalog from shared context."),
      edit("routes/orders.ts", "Create confirmations through shared context."),
    ],
    check: true,
  },
  {
    id: "decaf",
    lesson: 8,
    title: "Change the running state",
    explanation:
      "The REPL’s context is the same instance the HTTP handlers use as `$.context`. Assigning a quantity changes the next product response without editing or restarting a handler.",
    instruction:
      "Set Decaf inventory to 5 in the terminal’s REPL. In the browser, click Refresh products and check that Decaf shows 5. Click Add to cart on Decaf, then Place order. Expand the HTTP details in the chat to compare the product response with the displayed stock.",
    edits: [],
  },
  {
    id: "rules",
    verification:
      "Your saved handler now rejects orders it cannot fulfill while preserving inventory. Click Add to cart on Dark Roast twice. In the terminal’s REPL, lower Dark Roast inventory to 1, then click Refresh products and Place order. Expand the order’s HTTP details: expect 409 with requested and available quantities, and no stock change. Then click Empty cart, restore Dark Roast inventory to 3 in the REPL, and click Refresh products.",
    preparation:
      "Add `quantitiesFor()`, `getShortages()`, and `canFulfill()` to `Context`. Inspect their diff: `quantitiesFor` combines repeated IDs, `getShortages` compares requested and available quantities, and `canFulfill` rejects invalid quantities. Your handler will not use them until you add its branch.",
    lesson: 9,
    title: "Add stock rules",
    explanation:
      "Counterfact supplies the context object, but stock rules are your methods. `canFulfill` checks quantities; `getShortages` reports requested and available stock, combining repeated product IDs. The route maps that result to HTTP 409.",
    instruction:
      "Inspect the new `Context` methods. In routes/orders.ts, check the incoming items with the shared context’s `canFulfill` method before confirming the order. If they cannot be fulfilled, return HTTP 409 with an `error` message and a `shortages` property from `getShortages`. Keep the successful confirmation for requests that pass the check. Save the file. Click Add to cart on Dark Roast twice, then set its running inventory to 1 in the terminal’s REPL. Click Refresh products, then Place order. Expand the order’s HTTP details: expect 409 with requested and available quantities, and no stock change. Afterward, click Empty cart, restore Dark Roast inventory to 3 in the REPL, and click Refresh products.",
    edits: [
      edit(
        "routes/orders.ts",
        "Reject invalid or oversized orders before creating a confirmation.",
      ),
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
      "Note Dark Roast’s stock, click its Add to cart button once, then click Place order. Compare the stock before and after. Does accepting an order also subtract stock? Answer the question in the conversation after the response arrives.",
    edits: [],
  },
  {
    id: "reduce",
    verification:
      "Great job! Your saved order handler now subtracts purchased quantities from inventory. In the shop, note Dark Roast’s stock, click its Add to cart button once, then click Place order. Compare its stock afterward; it should be one lower. Expand the order’s HTTP details to check the product response too.",
    preparation:
      "Import the generated `OrderItem` type, add an empty `reduceInventory(items, inventory)` helper, and call it after stock validation, before confirming the order. Its TODO does nothing until you implement the loop.",
    lesson: 10,
    title: "Make purchases reduce inventory",
    explanation:
      "An order confirmation and an inventory change are separate operations. The new helper receives the ordered items and the same inventory object read by the product handler.",
    instruction:
      "Inspect the new helper and its call in routes/orders.ts. Implement `reduceInventory` so it visits every ordered item and subtracts that item’s quantity from inventory under its product ID. Mutate the supplied inventory so the next request sees the change. Save the file. Note Dark Roast’s stock, click its Add to cart button once, then click Place order. Check that its displayed stock falls by one and compare it with the product response in your order’s HTTP details.",
    edits: [
      edit(
        "routes/orders.ts",
        "Implement the helper’s body; keep its existing call after stock validation.",
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
      "Click Add to cart on Dark Roast until the cart contains all its remaining bags, then click Place order. Check the product response in your order’s HTTP details: stock should be zero, and the shop should show Sold out. You do not need another response implementation.",
    edits: [],
  },
  {
    id: "restock",
    lesson: 11,
    title: "Exercise evolving state",
    explanation:
      "Changing context through the REPL affects the same state that your order handler updates.",
    instruction:
      "Set Dark Roast inventory to 5 in the terminal’s REPL, then click Refresh products in the browser. Click Add to cart on Dark Roast once, then click Place order. Check that the next product response and the shop both show 4.",
    edits: [],
  },
  {
    id: "scenario",
    verification:
      "Your saved restock scenario changes Dark Roast without replacing the rest of the shop’s state. Run it in the REPL, refresh products, and click Check my work to verify the running result.",
    preparation:
      "Append an empty `restockDarkRoast` scenario, keeping `reset` and `startup`. It includes a guard for missing baseline inventory; you supply the assignment that changes Dark Roast.",
    lesson: 12,
    title: "Save a reusable setup",
    explanation:
      "Save a REPL state change as a named scenario so you can repeat it. This scenario changes only Dark Roast inventory. The other coffees and the order counter keep their current values.",
    instruction:
      "In scenarios/index.ts, implement `restockDarkRoast` so it sets Dark Roast’s shared inventory to 5 without changing the other products. Keep its existing guard. Save, then use the REPL’s `.scenario` command to run `restockDarkRoast`. Refresh products to see 5 bags. This completes the walkthrough. Try another product or another failure condition on your own.",
    edits: [
      edit(
        "scenarios/index.ts",
        "Change only Dark Roast’s quantity in the existing scenario.",
      ),
    ],
    check: true,
  },
];
export const PHASES: LessonPhase[] = [
  PHASES_V2[0]!,
  {
    id: "name-example",
    verification:
      "You’ve given the product name a readable example while keeping the handler random. Refresh products to see that example in the generated names and compare the other fields.",
    lesson: 2,
    title: "Give generated names a coffee example",
    explanation:
      "The OpenAPI schema shapes generated responses. A property’s example supplies a readable value while the handler still calls `.random()`. It does not create a fixed catalog or add order behavior.",
    instruction:
      "Open openapi.yaml and find `components.schemas.Product.properties.name`. Give that property an `example` value of House Blend. Preserve its existing type and length limits, then save. Keep routes/products.ts calling `.random()`. Counterfact reloads the spec without restarting; click Refresh products and inspect GET /products. Each generated name now uses your example, while IDs, prices, and stock are still generated.",
    edits: [
      edit(
        "openapi.yaml",
        "Add example inside the existing Product name property. Keep the surrounding schema.",
      ),
    ],
    check: true,
  },
  ...PHASES_V2.slice(1).map((phase) => ({
    ...phase,
    lesson: phase.lesson + 1,
  })),
];
export function phasesForVersion(version: number) {
  return version === 3 ? PHASES : PHASES_V2;
}
export const LESSON_COUNT = Math.max(...PHASES.map((phase) => phase.lesson));
