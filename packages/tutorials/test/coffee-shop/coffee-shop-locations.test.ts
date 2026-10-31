import { stringify } from "yaml";
import { expect, it } from "@jest/globals";
import { lessonLocations } from "../../src/coffee-shop/coffee-shop-locations.js";
import { PHASES } from "../../src/coffee-shop/coffee-shop-lessons.js";

it("finds lesson-specific edit locations and follows lines inserted by the learner", () => {
  const snapshots = {
    "routes/orders.ts": [
      "const ordersAvailable = true;",
      "export const POST = ($) => {",
      "  if (!ordersAvailable) {",
      "    return $.response.status(503).json({});",
      "  }",
      "  return $.response.status(201).json({});",
      "};",
      "function reduceInventory(items, inventory) {",
      "  for (const item of items) inventory[item.productId] -= item.quantity;",
      "}",
    ].join("\n"),
    "routes/_.context.ts":
      "export class Context {\n  listProducts() {\n    return [];\n  }\n}",
    "scenarios/index.ts": "export const reset = ($) => {};\n",
  };
  const locations = lessonLocations(snapshots, PHASES);
  expect(locations.fail?.["routes/orders.ts"]).toBe(1);
  expect(locations.order?.["routes/orders.ts"]).toBe(6);
  expect(locations.rules?.["routes/orders.ts"]).toBe(6);
  expect(locations.reduce?.["routes/orders.ts"]).toBe(9);
  expect(locations.context?.["routes/_.context.ts"]).toBe(3);
  expect(locations.seed?.["scenarios/index.ts"]).toBe(2);
  const shifted = lessonLocations(
    {
      ...snapshots,
      "routes/orders.ts": "// My notes\n\n" + snapshots["routes/orders.ts"],
    },
    PHASES,
  );
  expect(shifted.order?.["routes/orders.ts"]).toBe(8);
  expect(shifted.fail?.["routes/orders.ts"]).toBe(3);
});

it("links the schema lesson to Product.description rather than another description property", () => {
  const text = stringify({
    info: { description: "Not the edit" },
    components: {
      schemas: {
        Product: {
          properties: {
            name: { type: "string" },
            description: { type: "string" },
          },
        },
      },
    },
  });
  const locations = lessonLocations({ "openapi.yaml": text }, PHASES);
  const line = locations["description-example"]!["openapi.yaml"]!;
  expect(text.split("\n")[line - 1]?.trim()).toBe("description:");
  expect(locations.explore?.["openapi.yaml"]).toBe(1);
});

it("opens unfinished helper and scenario exercises at their TODO rather than their guard", () => {
  const locations = lessonLocations(
    {
      "routes/orders.ts":
        "function reduceInventory(items, inventory) {\n  // TODO: subtract stock.\n}\n",
      "scenarios/index.ts": [
        "export const restockDarkRoast = ($) => {",
        "  if (!$.context.inventory) throw new Error('Missing inventory');",
        "  // TODO: set Dark Roast inventory.",
        "};",
      ].join("\n"),
    },
    PHASES,
  );
  expect(locations.reduce?.["routes/orders.ts"]).toBe(2);
  expect(locations.scenario?.["scenarios/index.ts"]).toBe(3);
});
