import { expect, it } from "@jest/globals";
import { EventEmitter } from "node:events";
import type { REPLServer } from "node:repl";
import { usingTemporaryFiles } from "using-temporary-files";
import { prepareTour } from "../../src/prepare-tour.js";
import { walkthroughInfo } from "../../src/coffee-shop/coffee-shop-checks.js";
import { createTourReplObserver } from "../../src/coffee-shop/coffee-shop-repl.js";

it("observes submissions only in managed demos, keeps repeats, and detaches on exit", async () => {
  await usingTemporaryFiles(async ($) => {
    expect(await createTourReplObserver($.path("."))).toBeUndefined();
    const tour = await prepareTour($.path("."), "demo");
    for (const file of [
      "routes/products.ts",
      "routes/orders.ts",
      "routes/_.context.ts",
      "scenarios/index.ts",
    ])
      await $.add("demo/" + file, "");
    const observe = (await createTourReplObserver(tour.destination))!;
    const server = new EventEmitter() as REPLServer;
    observe(server);
    observe(server);
    server.emit("line", "  ");
    for (const command of [
      "context.inventory.decaf = 5",
      ".scenario reset",
      ".scenario reset",
      "throw Error('oops')",
    ])
      server.emit("line", command);
    const info = await walkthroughInfo(tour.destination, {}, true);
    expect(info.replSubmissions.map((entry) => entry.command)).toEqual([
      "context.inventory.decaf = 5",
      ".scenario reset",
      ".scenario reset",
      "throw Error('oops')",
    ]);
    expect(new Set(info.replSubmissions.map((entry) => entry.id)).size).toBe(4);
    expect(
      (await walkthroughInfo(tour.destination, {})).replSubmissions,
    ).toEqual([]);
    server.emit("exit");
    expect(server.listenerCount("line")).toBe(0);
    server.emit("line", "not submitted");
    expect(
      (await walkthroughInfo(tour.destination, {}, true)).replSubmissions,
    ).toEqual(info.replSubmissions);
    const other = await prepareTour($.path("."), "other");
    for (const file of [
      "routes/products.ts",
      "routes/orders.ts",
      "routes/_.context.ts",
      "scenarios/index.ts",
    ])
      await $.add("other/" + file, "");
    expect(
      (await walkthroughInfo(other.destination, {}, true)).replSubmissions,
    ).toEqual([]);
  });
});
