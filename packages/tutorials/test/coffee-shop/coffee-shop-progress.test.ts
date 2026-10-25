import { expect, it } from "@jest/globals";

import { CoffeeShopProgress } from "../../src/coffee-shop/coffee-shop-progress.js";

it("uses successful shopping responses, not instruction views, to advance", () => {
  const lesson = new CoffeeShopProgress();
  lesson.next();
  lesson.next();
  expect(lesson.step).toBe(1);
  lesson.order(false, [{ productId: "house-blend", quantity: 1 }], 3, 503);
  expect(lesson.done).toBe(false);
  lesson.order(true, [{ productId: "house-blend", quantity: 1 }], 3, 201);
  expect(lesson.done).toBe(true);
  lesson.next();
  lesson.products({ decaf: 0 });
  expect(lesson.done).toBe(false);
  lesson.products({ decaf: 5 });
  expect(lesson.done).toBe(true);
  lesson.next();
  lesson.order(true, [{ productId: "decaf", quantity: 1 }], 3, 201);
  lesson.next();
  const cart = [{ productId: "house-blend", quantity: 1 }];
  lesson.order(false, cart, 3, 409);
  expect(lesson.done).toBe(false);
  lesson.order(false, cart, 3, 503);
  expect(lesson.done).toBe(true);
  lesson.next();
  lesson.order(true, [{ productId: "decaf", quantity: 1 }], 3, 201);
  expect(lesson.done).toBe(false);
  lesson.order(true, cart, 3, 201);
  expect(lesson.done).toBe(true);
});

it("requires an order followed by the expected stock change and subsequent REPL restock", () => {
  const lesson = new CoffeeShopProgress();
  lesson.step = 6;
  const bag = [{ productId: "dark-roast", quantity: 1 }];
  lesson.products({ "dark-roast": 3 });
  expect(lesson.done).toBe(false);
  lesson.order(true, bag, 3, 201);
  lesson.products({ "dark-roast": 3 });
  expect(lesson.done).toBe(true);
  lesson.next();
  lesson.order(true, bag, 3, 201);
  lesson.products({ "dark-roast": 3 });
  expect(lesson.done).toBe(false);
  lesson.products({ "dark-roast": 2 });
  expect(lesson.done).toBe(true);
  lesson.next();
  lesson.order(true, [{ productId: "dark-roast", quantity: 2 }], 2, 201);
  lesson.products({ "dark-roast": 0 });
  expect(lesson.done).toBe(true);
  lesson.next();
  lesson.products({ "dark-roast": 0 });
  expect(lesson.done).toBe(false);
  lesson.products({ "dark-roast": 5 });
  expect(lesson.done).toBe(true);
  lesson.next();
  lesson.order(true, bag, 5, 201);
  lesson.products({ "dark-roast": 4 });
  expect(lesson.done).toBe(true);
  lesson.next();
  expect(lesson.step).toBe(11);
});

it("accounts for multiple purchases before refresh and an already sold-out result", () => {
  const lesson = new CoffeeShopProgress();
  lesson.step = 7;
  const item = [{ productId: "dark-roast", quantity: 1 }];
  lesson.order(true, item, 3, 201);
  lesson.order(true, item, 3, 201);
  lesson.order(true, item, 3, 201);
  lesson.products({ "dark-roast": 0 });
  expect(lesson.done).toBe(true);
  lesson.next();
  lesson.products({ "dark-roast": 0 });
  expect(lesson.done).toBe(true);
});

it("recognizes an inventory handler retained from a previous tutorial session", () => {
  const lesson = new CoffeeShopProgress();
  lesson.step = 6;
  lesson.order(true, [{ productId: "dark-roast", quantity: 1 }], 3, 201);
  lesson.products({ "dark-roast": 2 });
  expect(lesson.done).toBe(true);
  expect(lesson.inventoryUpdated).toBe(true);
});

it("treats related phases as one lesson for numbering, Back, and Skip", () => {
  const lesson = new CoffeeShopProgress();
  lesson.step = 3;
  expect(lesson.lessonIndex).toBe(2);
  lesson.back();
  expect(lesson.step).toBe(1);
  lesson.step = 2;
  lesson.skip();
  expect(lesson.step).toBe(4);
  lesson.step = 7;
  expect(lesson.lessonIndex).toBe(4);
  lesson.back();
  expect(lesson.step).toBe(4);
  lesson.step = 9;
  lesson.skip();
  expect(lesson.step).toBe(11);
  expect(lesson.lessonIndex).toBe(7);
});

it("accepts a positive restock and the corresponding purchase reduction beyond the example quantities", () => {
  const lesson = new CoffeeShopProgress();
  lesson.step = 2;
  lesson.products({ decaf: 7 });
  expect(lesson.done).toBe(true);
  lesson.step = 9;
  lesson.done = false;
  lesson.products({ "dark-roast": 0 });
  expect(lesson.done).toBe(false);
  lesson.products({ "dark-roast": 7 });
  expect(lesson.done).toBe(true);
  lesson.next();
  lesson.order(true, [{ productId: "dark-roast", quantity: 2 }], 7, 201);
  lesson.products({ "dark-roast": 6 });
  expect(lesson.done).toBe(false);
  lesson.products({ "dark-roast": 5 });
  expect(lesson.done).toBe(true);
});
