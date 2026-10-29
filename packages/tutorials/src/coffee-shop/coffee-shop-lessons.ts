import { currentPhases } from "./coffee-shop-curriculum.js";
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

  listProducts(): Product[] {
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
  introduction?: string;
  background?: string[];
  question?: {
    prompt: string;
    answers: { label: string; value: boolean }[];
    retryExplanation: { reduced: string; unchanged: string };
    hints: { answer: string; retry: string };
  };
  instruction: string;
  edits: { file: string; instruction: string }[];
  preparation?: string;
  approval?: string;
  hint?: string;
  verificationHint?: string;
  check?: boolean;
  verification?: string;
};
const edit = (file: string, instruction: string) => ({
  file,
  instruction,
});
export const WALKTHROUGH_VERSION = 6;
export const PHASES_V2: LessonPhase[] = [
  {
    id: "explore",
    lesson: 1,
    title: "Explore your generated API",
    explanation:
      "The shop makes HTTP requests to your local API, which is running at ",
    instruction:
      "The generated starting handler in routes/products.ts calls `$.response.status(200).random()`: Counterfact uses the OpenAPI schema to generate a response on each request. The starting order stub also generates data rather than reading your cart or changing inventory. Click Refresh products and compare the products and the actual response in your chat bubble.",
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
      "Great job! You replaced the default random response with a meaningful catalog. The same three coffees should now appear on each request. Click Refresh products and inspect the response in your chat bubble.",
    preparation:
      "Remember how `routes/products.ts` returns random data with `.random()`? Instead of rolling dice, let's return predictable, hard-coded JSON data. To get us started, I'll create a constant called `catalog` with dummy data.",
    approval:
      "Whenever I want to make a change to a file, I'll show you what I'm going to do first. Then you can approve by clicking \"Apply changes.\"",
    lesson: 2,
    title: "Replace random products",
    explanation:
      "A handler is your function for an HTTP operation. Returning explicit JSON gives you control over the response instead of generating it from the schema.",
    instruction:
      "I’ve added the catalog above the handler. In routes/products.ts, replace `.random()` with `.json(catalog)` and save.",
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
      "Nice work! Your saved handler now builds its confirmation from the submitted items. In the shop, click Add to cart on House Blend, then click Place order.",
    lesson: 3,
    title: "Respond to the order you received",
    explanation:
      "`$.body` is the incoming request body. Returning its items connects the confirmation to your cart. A response by itself changes no inventory.",
    instruction:
      "The fixed order ID is temporary, and the existing status stays 201. In routes/orders.ts, replace `.random()` with a JSON response containing an `orderId` of 1 and an `items` property taken from the incoming request body, then save.",
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
      "Your saved handler now produces a 503 response when the switch is off, so an order should fail and stay in the cart. In the shop, click Add to cart on House Blend, then click Place order.",
    preparation:
      "Add `ordersAvailable = true` and the HTTP 503 branch above the existing successful response.",
    lesson: 4,
    title: "Add failure and recovery",
    explanation:
      "Your handler chooses the response status and body. A switch lets it produce a repeatable 503 response from the same endpoint.",
    instruction:
      "In routes/orders.ts, inspect the new 503 branch, change `ordersAvailable` to `false`, and save.",
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
      "Your saved handler can accept orders again. A successful response should be 201 and clear the cart. With the original failed items in your cart, click Try again.",
    lesson: 4,
    title: "Add failure and recovery",
    explanation:
      "The preserved cart lets you repeat the same request after changing the handler. Saving replaces the route implementation in the running server.",
    instruction: "Change `ordersAvailable` to `true` and save.",
    edits: [edit("routes/orders.ts", "Restore ordering.")],
    check: true,
  },
  {
    id: "context",
    verification:
      "Great job! Your context methods combine product descriptions with stock and give each confirmation a successive order ID. The fields start empty in a fresh context; data you’ve added to this running session is kept.",
    preparation:
      "Add empty `catalog` and `inventory` fields, the order counter, and two method stubs to routes/_.context.ts. `Product` and `OrderItem` come from Counterfact’s generated types, matching the OpenAPI schemas. The `Product[]` return type on `listProducts` lets your editor check that each returned coffee includes `stock`.",
    lesson: 5,
    title: "Introduce shared context",
    explanation:
      "Counterfact creates one running `Context` instance for these routes. Fields hold state; methods are ordinary TypeScript that you write. `catalog` contains product descriptions, `inventory` holds quantities by ID, and `nextOrderId` supplies successive confirmations.",
    instruction:
      "The collections in routes/_.context.ts start empty, and the handlers still use their earlier responses until you connect them. Implement `listProducts` to return each catalog product with stock read from inventory by product ID, using zero for a missing entry. Implement `confirmOrder` to return the supplied items and current `nextOrderId`, advancing the counter for the next confirmation, then save the file.",
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
      "Your saved scenarios now provide a starting catalog and inventory, with startup reusing reset. In the REPL, use the `.scenario` command to run `reset`.",
    preparation:
      "Add `Context.reset()` and the `reset` scenario containing the catalog and initial quantities. `reset` clears state and IDs before the scenario installs its baseline. Nothing applies the scenario to the running API yet.",
    lesson: 6,
    title: "Initialize context explicitly",
    explanation:
      "A scenario is a function you write to change the running context. The prepared `reset` scenario installs a complete baseline. `startup` tells Counterfact to apply that baseline when the server starts; saving the file alone does not apply it to this session.",
    instruction:
      "The baseline in scenarios/index.ts contains three coffees so stock changes are easy to see. Export the existing `reset` scenario under the name `startup` as well, so both names run the same function, then save the file.",
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
      "Nice work! Your saved handlers now use the shared context for products and confirmations. Click Refresh products.",
    lesson: 7,
    title: "Connect handlers to context",
    explanation:
      "Both routes now access the same object through `$.context`. The product handler reads its state; the order handler calls a method that changes the order counter. Saving a handler preserves the running inventory.",
    instruction:
      "The `ordersAvailable` switch and failure branch stay in place. In routes/products.ts, pass the result of the shared context’s `listProducts` method to the JSON response. In routes/orders.ts, pass the incoming items to the shared context’s `confirmOrder` method and return its result as JSON, then save both files.",
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
      "Set Decaf inventory to 5 in the terminal’s REPL, then click Refresh products in the browser.",
    edits: [],
  },
  {
    id: "rules",
    verification:
      "Your saved handler now rejects orders it cannot fulfill with HTTP 409 while preserving inventory. Click Add to cart on Dark Roast twice, lower its inventory to 1 in the terminal’s REPL, then click Refresh products and Place order.",
    preparation:
      "Add `quantitiesFor()`, `getShortages()`, and `canFulfill()` to `Context`. `quantitiesFor` combines repeated IDs, `getShortages` compares requested and available quantities, and `canFulfill` rejects invalid quantities. Your handler will not use them until you add its branch.",
    lesson: 9,
    title: "Add stock rules",
    explanation:
      "Counterfact supplies the context object, but stock rules are your methods. `canFulfill` checks quantities; `getShortages` reports requested and available stock, combining repeated product IDs. The route maps that result to HTTP 409.",
    instruction:
      "The new `Context` methods supply stock validation and shortage details. In routes/orders.ts, check the incoming items with the shared context’s `canFulfill` method before confirming the order. For a failed check, return HTTP 409 with an `error` message and a `shortages` property from `getShortages`; otherwise keep the successful confirmation. Save the file.",
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
      "Your current handler accepts orders and checks stock. A purchase and its next product response reveal whether anything updates the inventory.",
    instruction:
      "Note Dark Roast’s stock, click its Add to cart button once, then click Place order.",
    edits: [],
  },
  {
    id: "reduce",
    verification:
      "Great job! Your saved order handler now subtracts purchased quantities from inventory, so buying one bag should lower its stock by one. Note Dark Roast’s stock, click its Add to cart button once, then click Place order.",
    preparation:
      "Import the generated `OrderItem` type, add an empty `reduceInventory(items, inventory)` helper, and call it after stock validation, before confirming the order. Its TODO does nothing until you implement the loop.",
    lesson: 10,
    title: "Make purchases reduce inventory",
    explanation:
      "An order confirmation and an inventory change are separate operations. The new helper receives the ordered items and the same inventory object read by the product handler.",
    instruction:
      "The helper in routes/orders.ts receives the shared inventory object, so mutating it changes what the next request sees. Implement `reduceInventory` to visit every ordered item and subtract its quantity from inventory under its product ID, then save the file.",
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
      "Buying the remaining bags should bring stock to zero and make the shop show Sold out. Click Add to cart on Dark Roast until the cart contains all its remaining bags, then click Place order.",
    edits: [],
  },
  {
    id: "restock",
    lesson: 11,
    title: "Exercise evolving state",
    explanation:
      "Changing context through the REPL affects the same state that your order handler updates.",
    instruction:
      "Set Dark Roast inventory to 5 in the terminal’s REPL, then click Refresh products in the browser.",
    edits: [],
  },
  {
    id: "scenario",
    verification:
      "Your saved restock scenario changes Dark Roast without replacing the rest of the shop’s state. Run `restockDarkRoast` through the REPL’s `.scenario` command.",
    preparation:
      "Append an empty `restockDarkRoast` scenario, keeping `reset` and `startup`. It includes a guard for missing baseline inventory; you supply the assignment that changes Dark Roast.",
    lesson: 12,
    title: "Save a reusable setup",
    explanation:
      "A named scenario makes a REPL state change repeatable. This scenario changes only Dark Roast inventory. The other coffees and the order counter keep their current values.",
    instruction:
      "The existing guard stays in place. In scenarios/index.ts, implement `restockDarkRoast` to set Dark Roast’s shared inventory to 5 without changing the other products, then save the file.",
    edits: [
      edit(
        "scenarios/index.ts",
        "Change only Dark Roast’s quantity in the existing scenario.",
      ),
    ],
    check: true,
  },
];
export const PHASES_V3: LessonPhase[] = [
  PHASES_V2[0]!,
  {
    id: "name-example",
    verification:
      "You’ve given the product name a readable example while keeping the handler random. Counterfact reloads the spec without restarting. Click Refresh products to see the example in generated names and compare the other fields.",
    lesson: 2,
    title: "Give generated names a coffee example",
    explanation:
      "The OpenAPI schema shapes generated responses. A property’s example supplies a readable value while the handler still calls `.random()`. It does not create a fixed catalog or add order behavior.",
    instruction:
      "The handler in routes/products.ts keeps calling `.random()`, and the name property’s existing type and length limits stay in place. In openapi.yaml, give `components.schemas.Product.properties.name` an `example` value of House Blend, then save.",
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
export const PHASES_V4: LessonPhase[] = [
  {
    id: "orientation",
    lesson: 1,
    title: "Try the coffee shop",
    explanation:
      "Let’s get comfortable with the tutorial before editing code. The coffee shop on the right sends requests to the simulated shop API; our conversation on the left shows what happened.",
    instruction:
      "Click Add to cart on any coffee with stock, then click Place order.",
    edits: [],
  },
  ...PHASES_V3.map((phase) => ({
    ...phase,
    lesson: phase.lesson + 1,
    explanation: phase.explanation
      .replaceAll("GET /products", "GET /shop/products")
      .replaceAll("POST /orders", "POST /shop/orders"),
    instruction: phase.instruction
      .replaceAll("GET /products", "GET /shop/products")
      .replaceAll("POST /orders", "POST /shop/orders"),
  })),
];
const PHASE_HINTS: Record<string, { hint: string; verificationHint?: string }> =
  {
    orientation: {
      hint: "Choose a coffee card showing at least one bag available. Click its Add to cart button once. Your cart will show one bag and a total; click Place order.",
    },
    explore: {
      hint: "Click Refresh products at the top right of the shop. In your new chat bubble, expand the GET request’s HTTP details and compare its response body with the coffee cards.",
    },
    "name-example": {
      hint: "In openapi.yaml, find the name property inside components → schemas → Product → properties. Add an `example` property at the same indentation as `type`, using House Blend as its string value. Keep the existing limits and save the file.",
      verificationHint:
        "Click Refresh products at the top right. Expand the GET request’s HTTP details in your chat bubble and compare the name values with your saved example.",
    },
    "description-example": {
      hint: "In openapi.yaml, find description inside components → schemas → Product → properties. Add `examples` at the same indentation as `type` and `maxLength`. Under it, indent a YAML list with at least two different coffee descriptions, each on its own line starting with a dash. Keep each description within 120 characters, preserve the existing type and limit, then save.",
      verificationHint:
        "Click Refresh products at the top right. Expand the GET request’s HTTP details in your chat bubble. Every description should come from the examples you saved.",
    },
    catalog: {
      hint: "In routes/products.ts, find the return statement inside GET. Keep `$.response.status(200)` and the supplied catalog constant. Replace only `.random()` with `.json(catalog)`, then save.",
      verificationHint:
        "Click Refresh products at the top right. Expand the GET request’s HTTP details in your chat bubble to see the three coffees returned by your catalog.",
    },
    order: {
      hint: "In routes/orders.ts, keep the 201 status. Replace the random response with a JSON response containing two properties: `orderId` with the number 1, and `items` with the submitted array from `$.body.items`. Save the file.",
      verificationHint:
        "Click Add to cart on House Blend once, then click Place order in the cart.",
    },
    fail: {
      hint: "In routes/orders.ts, locate the existing `ordersAvailable` constant above POST. Change its value from `true` to `false`, preserving the supplied 503 branch and success response, then save.",
      verificationHint:
        "Click Add to cart on House Blend once, then click Place order. Your handler’s existing switch should select the unavailable response and preserve the cart.",
    },
    retry: {
      hint: "In routes/orders.ts, change the existing `ordersAvailable` constant back to `true` and save. Keep the failed order’s cart intact.",
      verificationHint:
        "Keep the same items as the failed order. If you changed the cart, use Restore original cart in the chat. Click Try again in the shop.",
    },
    context: {
      hint: "In routes/_.context.ts, `listProducts` returns `Product[]`. Use the catalog array’s `map` method to create a new object for each coffee: copy its existing properties and add a property named `stock`, looked up in inventory using the coffee’s ID. Use zero for a missing entry. In `confirmOrder`, return the supplied items and the current order counter, advancing the counter once for the next call. Keep the catalog and inventory field initializers empty in the file, then save.",
    },
    seed: {
      hint: "In scenarios/index.ts, the reset scenario already installs the baseline. Export that same function under the additional name `startup`; use an export alias rather than copying its body. Keep the existing reset export and save.",
      verificationHint:
        "At the terminal’s ⬣> prompt, use the `.scenario` command with the existing scenario name `reset` and press Enter. Milo will observe the running inventory automatically.",
    },
    connect: {
      hint: "In routes/products.ts, replace the catalog argument to the JSON response with the result of `$.context.listProducts`. In routes/orders.ts, pass `$.body.items` to `$.context.confirmOrder` and use its returned object as the JSON response. Call both methods, keep the availability switch and statuses, then save both files.",
      verificationHint:
        "Click Refresh products at the top right so the shop reads your shared context.",
    },
    decaf: {
      hint: "At the terminal’s ⬣> prompt, assign the number 5 to the `decaf` entry in `context.inventory` and press Enter. Return to the browser and click Refresh products.",
    },
    rules: {
      hint: "In routes/orders.ts, add a check before the successful confirmation. Pass the incoming items to `$.context.canFulfill`. When it returns false, return status 409 with an error string and a shortages array returned by `$.context.getShortages` for the same items. Keep successful requests using the existing confirmation, then save.",
      verificationHint:
        "Add two bags of Dark Roast to the cart while stock allows it. In the terminal’s REPL, set the `dark-roast` entry in `context.inventory` to 1. Return to the shop, click Refresh products, then Place order.",
    },
    observe: {
      hint: "Note Dark Roast’s displayed stock. Add one bag of Dark Roast to the cart, then click Place order.",
    },
    reduce: {
      hint: "In routes/orders.ts, find the TODO inside `reduceInventory`. Loop over every item in the supplied items array. Use each item’s product ID to find its entry in the supplied inventory object, and subtract that item’s quantity from that entry. Change the supplied inventory itself; keep the helper’s existing call after validation. Save the file.",
      verificationHint:
        "Note Dark Roast’s displayed stock, add one bag of Dark Roast to your cart, then click Place order.",
    },
    sellout: {
      hint: "Read Dark Roast’s remaining stock. Use its Add to cart button until the cart contains exactly that many bags, then click Place order.",
    },
    restock: {
      hint: "In the terminal’s REPL, assign the number 5 to the `dark-roast` entry in `context.inventory` and press Enter. Return to the shop and click Refresh products.",
    },
    scenario: {
      hint: "In scenarios/index.ts, find the TODO inside `restockDarkRoast`. Assign 5 to the `dark-roast` entry in the scenario’s shared context inventory. Keep the existing guard, other inventory entries, reset, startup, and the order counter unchanged, then save.",
      verificationHint:
        "At the terminal’s ⬣> prompt, use the `.scenario` command with the name `restockDarkRoast` and press Enter. Milo will detect its inventory change automatically.",
    },
  };

export const PHASES_V5: LessonPhase[] = PHASES_V4.map((phase) =>
  phase.id === "name-example"
    ? {
        ...phase,
        id: "description-example",
        title: "Give generated descriptions coffee examples",
        explanation:
          "The name field already has ten coffee examples in the OpenAPI schema. Examples can also give the description field meaningful values while the handler keeps calling `.random()`.",
        instruction:
          "The description field’s string type and length limit stay in place. In openapi.yaml, add a few sensible coffee descriptions to `components.schemas.Product.properties.description.examples`, then save.",
        edits: [
          edit(
            "openapi.yaml",
            "Add examples inside the existing Product description property.",
          ),
        ],
        verification:
          "You’ve given the description field meaningful coffee examples while keeping the handler random. Counterfact reloads the spec without restarting. Click Refresh products and compare the generated descriptions with your examples.",
      }
    : phase,
).map((phase) => ({ ...phase, ...PHASE_HINTS[phase.id] }));
export const PHASES: LessonPhase[] = currentPhases;
export function phasesForVersion(version: number) {
  if (version === 6) return PHASES;
  const phases =
    version === 6
      ? PHASES
      : version === 5
        ? PHASES_V5
        : version === 4
          ? PHASES_V4
          : version === 3
            ? PHASES_V3
            : PHASES_V2;
  return phases.map((phase) => ({ ...phase, ...PHASE_HINTS[phase.id] }));
}
export const LESSON_COUNT = Math.max(...PHASES.map((phase) => phase.lesson));
