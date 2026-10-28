import { expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";
import {
  checkWalkthroughSave,
  walkthroughInfo,
} from "../../src/coffee-shop/coffee-shop-checks.js";
import {
  BASELINE_SCENARIO,
  CONNECTED_ORDERS,
  CONNECTED_PRODUCTS,
  CONTEXT,
  ECHO_ORDERS,
  FAILURE_ORDERS,
  FIXED_PRODUCTS,
  INVENTORY_LOOP,
  INVENTORY_TODO,
  REDUCE_ORDERS,
  RESTOCK_SCENARIO,
  RULES_CONTEXT,
  RULES_ORDERS,
  SEEDED_CONTEXT,
} from "../../src/coffee-shop/coffee-shop-lessons.js";

it("checks every documented edit from generated stubs without touching live state", async () => {
  await usingTemporaryFiles(async ($) => {
    const root = $.path(".");
    await $.add("routes/_.context.ts", "export class Context {}\n");
    await $.add(
      "routes/products.ts",
      "export const GET = ($) => $.response.status(200).random();",
    );
    await $.add(
      "routes/orders.ts",
      "export const POST = ($) => $.response.status(201).random();",
    );
    const info = await walkthroughInfo(root, {});
    expect(info.state).toEqual({ catalog: null, inventory: null });
    expect((await walkthroughInfo(root, {})).sessionId).toBe(info.sessionId);
    expect((await checkWalkthroughSave(root, "catalog")).ok).toBe(false);
    expect((await checkWalkthroughSave(root, "order")).ok).toBe(false);
    await $.add("routes/products.ts", FIXED_PRODUCTS);
    expect((await checkWalkthroughSave(root, "catalog")).ok).toBe(true);
    await $.add("routes/orders.ts", ECHO_ORDERS);
    expect((await checkWalkthroughSave(root, "order")).ok).toBe(true);
    await $.add("routes/orders.ts", FAILURE_ORDERS);
    expect((await checkWalkthroughSave(root, "fail")).ok).toBe(true);
    await $.add(
      "routes/orders.ts",
      FAILURE_ORDERS.replace(
        "ordersAvailable = false",
        "ordersAvailable = true",
      ),
    );
    expect((await checkWalkthroughSave(root, "retry")).ok).toBe(true);
    await $.add("routes/_.context.ts", CONTEXT);
    await $.add(
      "routes/_.context.ts",
      CONTEXT.replace(
        "return this.catalog.map(product => ({ ...product, stock: this.inventory[product.id] ?? 0 }));",
        "return [];",
      ),
    );
    const unfinished = await checkWalkthroughSave(root, "context");
    expect(unfinished.ok).toBe(false);
    expect(unfinished.message).toContain("Implement listProducts()");
    await $.add(
      "routes/_.context.ts",
      CONTEXT.replace("stock: this.inventory[product.id] ?? 0", "stock: 0"),
    );
    expect((await checkWalkthroughSave(root, "context")).ok).toBe(false);
    await $.add("routes/_.context.ts", CONTEXT);
    expect((await checkWalkthroughSave(root, "context")).ok).toBe(true);
    await $.add("routes/_.context.ts", SEEDED_CONTEXT);
    await $.add("scenarios/index.ts", BASELINE_SCENARIO);
    expect((await checkWalkthroughSave(root, "seed")).ok).toBe(true);
    await $.add("routes/products.ts", CONNECTED_PRODUCTS);
    await $.add("routes/orders.ts", CONNECTED_ORDERS);
    expect((await checkWalkthroughSave(root, "connect")).ok).toBe(true);
    await $.add("routes/_.context.ts", RULES_CONTEXT);
    await $.add("routes/orders.ts", RULES_ORDERS);
    expect((await checkWalkthroughSave(root, "rules")).ok).toBe(true);
    await $.add("routes/orders.ts", REDUCE_ORDERS);
    expect((await checkWalkthroughSave(root, "reduce")).ok).toBe(false);
    await $.add(
      "routes/orders.ts",
      REDUCE_ORDERS.replace(
        INVENTORY_TODO,
        INVENTORY_LOOP.replace("item.quantity", "1"),
      ),
    );
    expect((await checkWalkthroughSave(root, "reduce")).ok).toBe(false);
    await $.add(
      "routes/orders.ts",
      REDUCE_ORDERS.replace(INVENTORY_TODO, INVENTORY_LOOP),
    );
    expect((await checkWalkthroughSave(root, "reduce")).ok).toBe(true);
    expect((await checkWalkthroughSave(root, "reduce")).ok).toBe(true);
    await $.add("scenarios/index.ts", BASELINE_SCENARIO + RESTOCK_SCENARIO);
    expect((await checkWalkthroughSave(root, "scenario")).ok).toBe(true);
    const live = { catalog: [], inventory: { untouched: 19 } };
    expect((await walkthroughInfo(root, live)).state.inventory).toEqual({
      untouched: 19,
    });
    expect(live.inventory.untouched).toBe(19);
    expect((await walkthroughInfo(root, live)).revision).not.toBe(
      info.revision,
    );
  });
});

it("reports missing methods, invalid phases, broken files, and destructive restock scenarios", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("routes/_.context.ts", "export class Context {}\n");
    await $.add("routes/products.ts", FIXED_PRODUCTS);
    await $.add("routes/orders.ts", ECHO_ORDERS);
    const root = $.path(".");
    expect((await checkWalkthroughSave(root, "context")).message).toContain(
      "Add catalog",
    );
    expect((await checkWalkthroughSave(root, "not-a-phase")).ok).toBe(false);
    await $.add("routes/_.context.ts", RULES_CONTEXT);
    await $.add(
      "scenarios/index.ts",
      BASELINE_SCENARIO +
        RESTOCK_SCENARIO.replace(
          '$.context.inventory["dark-roast"] = 5;',
          '$.context.reset(); $.context.inventory["dark-roast"] = 5;',
        ),
    );
    expect((await checkWalkthroughSave(root, "scenario")).ok).toBe(false);
    await $.add("routes/products.ts", "export const GET = (((;");
    expect((await checkWalkthroughSave(root, "catalog")).ok).toBe(false);
  });
});
