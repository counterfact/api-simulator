import vm from "node:vm";
import { describe, expect, it } from "@jest/globals";
import ts from "typescript";
import { coffeeShopPage } from "../../src/coffee-shop/coffee-shop-page.js";
import {
  CATALOG,
  CONTEXT,
  RULES_CONTEXT,
} from "../../src/coffee-shop/coffee-shop-lessons.js";

type Item = { productId: string; quantity: number };
type TestContext = {
  catalog: Omit<(typeof CATALOG)[number], "stock">[];
  inventory: Record<string, number>;
  listProducts: () => typeof CATALOG;
  confirmOrder: (items: Item[]) => { orderId: number; items: Item[] };
  reset: () => void;
  canFulfill: (items: Item[]) => boolean;
  getShortages: (
    items: Item[],
  ) => { productId: string; requested: number; available: number }[];
};
function context(source = RULES_CONTEXT) {
  const exports = {} as { Context: new () => TestContext };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports },
  );
  return new exports.Context();
}
describe("context methods introduced in the walkthrough", () => {
  it("starts empty and lists quantities from running inventory", () => {
    const shop = context(CONTEXT);
    expect(shop.listProducts()).toEqual([]);
    expect(shop.inventory).toEqual({});
    shop.catalog = CATALOG.map(({ stock: _stock, ...product }) => product);
    expect(shop.listProducts().every((product) => product.stock === 0)).toBe(
      true,
    );
    shop.inventory.decaf = 7;
    expect(
      shop.listProducts().find((product) => product.id === "decaf")!.stock,
    ).toBe(7);
  });
  it("creates sequential confirmations without mutating inventory", () => {
    const shop = context();
    shop.inventory = { "dark-roast": 3 };
    const items = [{ productId: "dark-roast", quantity: 2 }];
    expect(shop.confirmOrder(items)).toEqual({ orderId: 1, items });
    expect(shop.confirmOrder(items)).toEqual({ orderId: 2, items });
    expect(shop.inventory["dark-roast"]).toBe(3);
  });
  it("resets only when explicitly called", () => {
    const shop = context();
    shop.inventory.decaf = 5;
    shop.catalog = CATALOG;
    shop.confirmOrder([]);
    shop.reset();
    expect(shop.catalog).toEqual([]);
    expect(shop.inventory).toEqual({});
    expect(shop.confirmOrder([]).orderId).toBe(1);
  });
  it("combines duplicate quantities and reports shortages without changing state", () => {
    const shop = context();
    shop.inventory = { "dark-roast": 3, decaf: 0 };
    const items = [
      { productId: "dark-roast", quantity: 2 },
      { productId: "dark-roast", quantity: 2 },
      { productId: "decaf", quantity: 1 },
      { productId: "missing", quantity: 1 },
    ];
    expect(shop.canFulfill(items)).toBe(false);
    expect(shop.getShortages(items)).toEqual([
      { productId: "dark-roast", requested: 4, available: 3 },
      { productId: "decaf", requested: 1, available: 0 },
      { productId: "missing", requested: 1, available: 0 },
    ]);
    expect(shop.inventory).toEqual({ "dark-roast": 3, decaf: 0 });
    expect(
      shop.canFulfill([
        { productId: "dark-roast", quantity: 1 },
        { productId: "dark-roast", quantity: 2 },
      ]),
    ).toBe(true);
  });
  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid quantity %s",
    (quantity) => {
      const shop = context();
      shop.inventory = { "dark-roast": 3 };
      expect(shop.canFulfill([{ productId: "dark-roast", quantity }])).toBe(
        false,
      );
      expect(shop.canFulfill([])).toBe(false);
    },
  );
});
it("ships valid browser code with escaped paths", () => {
  const page = coffeeShopPage("/tmp/coffee</script>shop");
  expect(
    () => new vm.Script(page.split("<script>")[1]!.split("</script>")[0]!),
  ).not.toThrow();
  expect(page).not.toContain("/tmp/coffee</script>shop");
});
