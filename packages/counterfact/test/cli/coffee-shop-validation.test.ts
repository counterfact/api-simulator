import { expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";
import {
  SHOP_CONTEXT,
  SHOP_ORDERS,
  SHOP_PRODUCTS,
} from "../../src/cli/coffee-shop.js";
import {
  checkShopSave,
  shopRevision,
} from "../../src/cli/coffee-shop-validation.js";

it("checks saved functions using separate inventory and fresh modules after each edit", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("routes/_.context.ts", SHOP_CONTEXT);
    await $.add("routes/products.ts", SHOP_PRODUCTS);
    await $.add("routes/orders.ts", SHOP_ORDERS);
    const root = $.path(".");
    const original = await shopRevision(root);
    expect((await checkShopSave(root, 2)).message).toContain("returned 0");
    await $.add(
      "routes/products.ts",
      SHOP_PRODUCTS.replace("const decafStock = 0", "const decafStock = 5"),
    );
    expect(await shopRevision(root)).not.toBe(original);
    expect((await checkShopSave(root, 2)).ok).toBe(true);
    await $.add(
      "routes/products.ts",
      SHOP_PRODUCTS.replace("const decafStock = 0", "const decafStock = 7"),
    );
    expect((await checkShopSave(root, 2)).ok).toBe(true);
    expect((await checkShopSave(root, 4)).ok).toBe(false);
    await $.add(
      "routes/orders.ts",
      SHOP_ORDERS.replace("ordersAvailable = true", "ordersAvailable = false"),
    );
    expect((await checkShopSave(root, 4)).ok).toBe(true);
    expect((await checkShopSave(root, 5)).ok).toBe(false);
    await $.add("routes/orders.ts", SHOP_ORDERS);
    expect((await checkShopSave(root, 5)).ok).toBe(true);
    expect((await checkShopSave(root, 7)).message).toContain("returned 3");
    await $.add(
      "routes/orders.ts",
      SHOP_ORDERS.replace(
        "// INVENTORY LESSON:",
        "for (const item of items) $.context.inventory[item.productId] -= item.quantity;\n  // INVENTORY LESSON:",
      ),
    );
    expect((await checkShopSave(root, 7)).ok).toBe(true);
    // Repeating the test must start at 3 again, not consume another two bags.
    expect((await checkShopSave(root, 7)).ok).toBe(true);
  });
});

it("reports broken handlers, wrong arithmetic, missing files, and thrown errors", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("routes/_.context.ts", SHOP_CONTEXT);
    await $.add("routes/products.ts", SHOP_PRODUCTS);
    await $.add(
      "routes/orders.ts",
      SHOP_ORDERS.replace(
        "// INVENTORY LESSON:",
        "for (const item of items) $.context.inventory[item.productId] -= 1;\n  // INVENTORY LESSON:",
      ),
    );
    expect((await checkShopSave($.path("."), 7)).message).toContain(
      "returned 2",
    );
    await $.add(
      "routes/orders.ts",
      "export const POST = () => { throw Error('bad change'); };",
    );
    expect((await checkShopSave($.path("."), 5)).message).toContain(
      "bad change",
    );
    await $.add("routes/products.ts", "export const GET = (((;");
    expect((await checkShopSave($.path("."), 2)).ok).toBe(false);
    await $.remove("routes/products.ts");
    expect(await shopRevision($.path("."))).toBe("unavailable");
    expect((await checkShopSave($.path("."), 2)).ok).toBe(false);
  });
});
