import Koa from "koa";
import request from "supertest";

import type { ApiRunner } from "../../../src/api-runner.js";
import type { Config } from "../../../src/server/config.js";
import { ContextRegistry } from "../../../src/server/context-registry.js";
import { Dispatcher } from "../../../src/server/dispatcher.js";
import type { Module } from "../../../src/server/registry.js";
import { Registry } from "../../../src/server/registry.js";
import { routesMiddlewareForRunners } from "../../../src/server/web-server/routes-middleware.js";

const CONFIG: Pick<Config, "proxyUrl" | "proxyPaths"> = {
  proxyPaths: new Map(),
  proxyUrl: "",
};

function runner(
  prefix: string,
  routes: Array<[path: string, module: Module]>,
): Pick<ApiRunner, "dispatcher" | "prefix"> {
  const registry = new Registry();

  for (const [path, module] of routes) {
    registry.add(path, module);
  }

  return {
    dispatcher: new Dispatcher(registry, new ContextRegistry()),
    prefix,
  };
}

function appFor(runners: Array<Pick<ApiRunner, "dispatcher" | "prefix">>) {
  const app = new Koa();

  app.use(routesMiddlewareForRunners(runners, CONFIG));

  return app;
}

describe("routes middleware for multiple API runners", () => {
  it("serves unique routes from two runners sharing an empty prefix", async () => {
    const app = appFor([
      runner("", [["/customers", { GET: () => ({ body: "customers" }) }]]),
      runner("", [["/products", { GET: () => ({ body: "products" }) }]]),
    ]);

    await request(app.callback()).get("/customers").expect(200, "customers");
    await request(app.callback()).get("/products").expect(200, "products");
  });

  it("falls through three runners sharing an empty prefix", async () => {
    const app = appFor([
      runner("", [["/first", { GET: () => ({ body: "first" }) }]]),
      runner("", [["/second", { GET: () => ({ body: "second" }) }]]),
      runner("", [["/third", { GET: () => ({ body: "third" }) }]]),
    ]);

    await request(app.callback()).get("/third").expect(200, "third");
  });

  it("falls through runners sharing a non-empty prefix", async () => {
    const app = appFor([
      runner("/api", [["/customers", { GET: () => ({ body: "customers" }) }]]),
      runner("/api", [["/products", { GET: () => ({ body: "products" }) }]]),
    ]);

    await request(app.callback()).get("/api/products").expect(200, "products");
  });

  it("selects a later runner that supports the requested method", async () => {
    const app = appFor([
      runner("", [["/items", { GET: () => ({ body: "get items" }) }]]),
      runner("", [["/items", { POST: () => ({ body: "post item" }) }]]),
    ]);

    await request(app.callback()).post("/items").expect(200, "post item");
  });

  it("uses declaration order when runners support the same path and method", async () => {
    const app = appFor([
      runner("", [["/items", { GET: () => ({ body: "first" }) }]]),
      runner("", [["/items", { GET: () => ({ body: "second" }) }]]),
    ]);

    await request(app.callback()).get("/items").expect(200, "first");
  });

  it("combines allowed methods when no runner supports the requested method", async () => {
    const app = appFor([
      runner("", [["/items", { GET: () => ({ body: "get" }) }]]),
      runner("", [["/items", { POST: () => ({ body: "post" }) }]]),
      runner("", [["/items", { PATCH: () => ({ body: "patch" }) }]]),
    ]);

    const response = await request(app.callback()).delete("/items");

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe("GET, POST, PATCH");
  });

  it("returns 404 only after all eligible runners decline the path", async () => {
    const app = appFor([
      runner("", [["/customers", { GET: () => ({ body: "customers" }) }]]),
      runner("", [["/products", { GET: () => ({ body: "products" }) }]]),
    ]);

    await request(app.callback()).get("/missing").expect(404);
  });
});
