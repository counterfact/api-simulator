import type { Product, ShopState } from "./runtime.js";
export function hasBaseline(
  state: ShopState | undefined,
  baselineProducts: Product[],
) {
  if (
    !state ||
    !Array.isArray(state.catalog) ||
    !state.inventory ||
    baselineProducts.length === 0 ||
    state.catalog.length !== baselineProducts.length ||
    Object.keys(state.inventory).length !== baselineProducts.length
  )
    return false;
  const catalog = state.catalog;
  const inventory = state.inventory;
  return baselineProducts.every((expected) => {
    const actual = catalog.find((coffee) => coffee?.id === expected.id);
    return (
      actual &&
      ["id", "name", "description", "price"].every(
        (key) => actual[key] === expected[key as keyof typeof expected],
      ) &&
      inventory[expected.id] === expected.stock
    );
  });
}
export function baselineRecovery(
  state: ShopState,
  baselineProducts: Product[],
) {
  const catalog = Array.isArray(state.catalog) ? state.catalog : [];
  const changed = baselineProducts
    .filter((expected) => {
      const actual = catalog.find((coffee) => coffee?.id === expected.id);
      return (
        !actual ||
        ["id", "name", "description", "price"].some(
          (key) => actual[key] !== expected[key as keyof typeof expected],
        )
      );
    })
    .map((coffee) => coffee.name);
  const stocks = baselineProducts
    .filter((coffee) => state.inventory?.[coffee.id] !== coffee.stock)
    .map((coffee) => coffee.name + ": " + coffee.stock);
  const extraCatalog =
    catalog.length !== baselineProducts.length
      ? "The catalog must contain exactly the three baseline coffees. "
      : "";
  const extraInventory = Object.keys(state.inventory ?? {}).some(
    (id) => !baselineProducts.some((coffee) => coffee.id === id),
  )
    ? "Inventory still contains extra entries. "
    : "";
  return (
    "The running shop does not yet match reset’s baseline. " +
    (changed.length
      ? "Catalog entries still differ for " + changed.join(", ") + ". "
      : "") +
    (stocks.length ? "Expected stock: " + stocks.join(", ") + ". " : "") +
    extraCatalog +
    extraInventory +
    "At the terminal’s ⬣> prompt, run `reset` through the `.scenario` command."
  );
}
