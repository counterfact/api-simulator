import { expect, it } from "@jest/globals";
import { coffeeShopAction } from "../../src/cli/coffee-shop-action.js";

const state = {
  step: 8,
  done: false,
  cart: {},
  stock: { "dark-roast": 3 },
  ordered: false,
  editVerified: false,
  inventoryUpdated: true,
};

it("moves from adding all remaining bags to ordering, then refreshing", () => {
  expect(coffeeShopAction(state)?.text).toBe(
    "Add the remaining Dark Roast bags to your cart",
  );
  expect(coffeeShopAction({ ...state, cart: { "dark-roast": 2 } })?.text).toBe(
    "Add the remaining Dark Roast bags to your cart",
  );
  expect(coffeeShopAction({ ...state, cart: { "dark-roast": 3 } })?.text).toBe(
    "place an order",
  );
  expect(coffeeShopAction({ ...state, ordered: true })?.text).toBe(
    "watch the inventory",
  );
  expect(coffeeShopAction({ ...state, done: true })).toBeUndefined();
});

it("returns to adding bags if the user reduces the cart before ordering", () => {
  expect(coffeeShopAction({ ...state, cart: { "dark-roast": 3 } })?.text).toBe(
    "place an order",
  );
  expect(coffeeShopAction({ ...state, cart: { "dark-roast": 2 } })?.text).toBe(
    "Add the remaining Dark Roast bags to your cart",
  );
});

it("waits for automatic saved-handler validation before the next shop action", () => {
  const edit = { ...state, step: 2 };
  expect(coffeeShopAction(edit)).toEqual({
    text: "Change its starting stock from 0 to 5, save",
  });
  expect(coffeeShopAction({ ...edit, editVerified: true })).toEqual({
    text: "watch the inventory",
  });
});

it("keeps failed orders at the ordering action and skips retained inventory edits", () => {
  expect(
    coffeeShopAction({ ...state, cart: { "dark-roast": 3 }, ordered: false })
      ?.text,
  ).toBe("place an order");
  expect(coffeeShopAction({ ...state, step: 7 })?.text).toBe(
    "Add one Dark Roast to your cart",
  );
  expect(
    coffeeShopAction({ ...state, step: 7, inventoryUpdated: false })?.text,
  ).toBe("Add these lines at the INVENTORY LESSON comment, save");
});

it("points to the REPL restock without confirmation buttons", () => {
  expect(coffeeShopAction({ ...state, step: 9 })).toEqual({
    text: "Restock it with the second command",
  });
});
