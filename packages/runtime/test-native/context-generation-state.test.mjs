import assert from "node:assert/strict";
import { once } from "node:events";
import { it } from "node:test";
import { usingTemporaryFiles } from "using-temporary-files";
import { ContextRegistry } from "../dist/server/context-registry.js";
import { ModuleLoader } from "../dist/server/module-loader.js";
import { Registry } from "../dist/server/registry.js";

const contextSource = (seed = []) => `
const initial = ${JSON.stringify(seed)};
class Cart {
  items = [...initial];
  self = this;
  total = () => this.items.length;
}
export class Context {
  count = 0;
  cart = new Cart();
  graph = { array: [this.cart], map: new Map([[this.cart, this.cart]]), set: new Set([this.cart]) };
  action = () => initial.length;
}
`;

it("retains nested class-backed state after unrelated watched route edits", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("_.context.mjs", contextSource());
    await $.add("probe.mjs", "export const GET = () => 1;");
    const contexts = new ContextRegistry();
    const loader = new ModuleLoader($.path("."), new Registry(), contexts);
    await loader.load();
    const context = contexts.find("/");
    const { cart, graph, action } = context;
    cart.items.push("saved item");
    context.count = 8;
    await loader.watch();
    try {
      for (const version of [2, 3]) {
        const refreshed = once(loader, "add");
        await $.add("probe.mjs", `export const GET = () => ${version};`);
        await refreshed;
        assert.equal(contexts.find("/"), context);
        assert.equal(context.cart, cart);
        assert.deepEqual(cart.items, ["saved item"]);
        assert.equal(cart.total(), 1);
        assert.equal(cart.self, cart);
        assert.equal(context.graph, graph);
        assert.equal(graph.array[0], cart);
        assert.equal(graph.map.get(cart), cart);
        assert.equal(graph.set.has(cart), true);
        assert.equal(context.count, 8);
        // The unchanged context module keeps its original closures.
        assert.equal(context.action, action);
      }
    } finally {
      await loader.stopWatching();
    }
  });
});

it("applies changed enumerable class initializers while preserving unrelated live fields", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("_.context.mjs", contextSource());
    const contexts = new ContextRegistry();
    const loader = new ModuleLoader($.path("."), new Registry(), contexts);
    await loader.load();
    const context = contexts.find("/");
    const cart = context.cart;
    cart.items.push("live item");
    context.count = 7;
    await loader.watch();
    try {
      const refreshed = once(loader, "add");
      await $.add("_.context.mjs", contextSource(["new initializer"]));
      await refreshed;
      assert.notEqual(context.cart, cart);
      assert.deepEqual(context.cart.items, ["new initializer"]);
      assert.equal(context.count, 7);
      assert.equal(context.action(), 1);
    } finally {
      await loader.stopWatching();
    }
  });
});
