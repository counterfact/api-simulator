import vm from "node:vm";

import { describe, expect, it } from "@jest/globals";
import ts from "typescript";

import { coffeeShopPage } from "../../src/coffee-shop/coffee-shop-page.js";

import { SHOP_CONTEXT } from "../../src/coffee-shop/coffee-shop.js";

function context() {
  const exports = {} as {
    Context: new () => {
      inventory: Record<string, number>;
      setDecafStock: (quantity: number) => void;
      canFulfill: (items: { productId: string; quantity: number }[]) => boolean;
      getShortages: (
        items: { productId: string; quantity: number }[],
      ) => { productId: string; requested: number; available: number }[];
      confirmOrder: (items: { productId: string; quantity: number }[]) => {
        orderId: number;
        items: { productId: string; quantity: number }[];
      };
    };
  };
  vm.runInNewContext(
    ts.transpileModule(SHOP_CONTEXT, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports },
  );
  return new exports.Context();
}

describe("the example's shared context", () => {
  it("applies a changed Decaf setting once without undoing subsequent purchases", () => {
    const shop = context();
    shop.inventory = { "dark-roast": 3, decaf: 0 };
    shop.setDecafStock(5);
    expect(shop.inventory).toEqual({ "dark-roast": 3, decaf: 5 });
    shop.inventory.decaf -= 1;
    shop.setDecafStock(5);
    expect(shop.inventory.decaf).toBe(4);
    shop.setDecafStock(2);
    expect(shop.inventory.decaf).toBe(2);
  });

  it("checks the complete order without mutating inventory", () => {
    const shop = context();
    shop.inventory = { "dark-roast": 3 };
    expect(shop.canFulfill([{ productId: "dark-roast", quantity: 2 }])).toBe(
      true,
    );
    expect(
      shop.canFulfill([
        { productId: "dark-roast", quantity: 2 },
        { productId: "dark-roast", quantity: 2 },
      ]),
    ).toBe(false);
    expect(shop.canFulfill([{ productId: "missing", quantity: 1 }])).toBe(
      false,
    );
    expect(shop.canFulfill([{ productId: "dark-roast", quantity: -1 }])).toBe(
      false,
    );
    expect(shop.canFulfill([])).toBe(false);
    expect(shop.inventory["dark-roast"]).toBe(3);
  });

  it("reports combined shortages without changing inventory or the order", () => {
    const shop = context();
    shop.inventory = { "dark-roast": 3, decaf: 0, "house-blend": 5 };
    const items = [
      { productId: "dark-roast", quantity: 2 },
      { productId: "dark-roast", quantity: 2 },
      { productId: "decaf", quantity: 1 },
      { productId: "house-blend", quantity: 2 },
      { productId: "missing", quantity: 1 },
    ];
    expect(shop.getShortages(items)).toEqual([
      { productId: "dark-roast", requested: 4, available: 3 },
      { productId: "decaf", requested: 1, available: 0 },
      { productId: "missing", requested: 1, available: 0 },
    ]);
    expect(shop.inventory).toEqual({
      "dark-roast": 3,
      decaf: 0,
      "house-blend": 5,
    });
    expect(items[0]).toEqual({ productId: "dark-roast", quantity: 2 });
    expect(
      shop.getShortages([{ productId: "dark-roast", quantity: 3 }]),
    ).toEqual([]);
    expect(shop.getShortages([])).toEqual([]);
  });

  it("accepts combined quantities within stock and rejects invalid quantities", () => {
    const shop = context();
    shop.inventory = { "dark-roast": 3 };
    expect(
      shop.canFulfill([
        { productId: "dark-roast", quantity: 1 },
        { productId: "dark-roast", quantity: 2 },
      ]),
    ).toBe(true);
    expect(shop.canFulfill([{ productId: "dark-roast", quantity: 0 }])).toBe(
      false,
    );
    expect(shop.canFulfill([{ productId: "dark-roast", quantity: 0.5 }])).toBe(
      false,
    );
  });

  it("assigns sequential order confirmations without subtracting stock", () => {
    const shop = context();
    shop.inventory = { "dark-roast": 3 };
    const items = [{ productId: "dark-roast", quantity: 2 }];
    expect(shop.confirmOrder(items)).toEqual({ orderId: 1, items });
    expect(shop.confirmOrder(items)).toEqual({ orderId: 2, items });
    expect(shop.inventory).toEqual({ "dark-roast": 3 });
    expect(items).toEqual([{ productId: "dark-roast", quantity: 2 }]);
  });
});

it("ships syntactically valid browser code with escaped project paths", () => {
  const page = coffeeShopPage("/tmp/coffee</script>shop");
  const script = page.split("<script>")[1]!.split("</script>")[0]!;
  expect(() => new vm.Script(script)).not.toThrow();
  expect(page).toContain("Walkthrough instructions");
  expect(page).not.toContain("/tmp/coffee</script>shop");
});

it.each([
  ["/tmp/coffee shop#1?", "vscode://file/tmp/coffee%20shop%231%3F/"],
  [String.raw`C:\coffee shop\demo`, "vscode://file/C:/coffee%20shop/demo/"],
])(
  "uses an escaped VSCode base URL for instructional file links (%s)",
  (path, url) => {
    const page = coffeeShopPage(path);
    expect(page).toContain(`const projectEditorUrl = "${url}";`);
    expect(page).not.toContain("Repeat instructions");
  },
);
