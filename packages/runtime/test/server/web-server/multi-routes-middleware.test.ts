import Koa from "koa";
import request from "supertest";

import type { ProxyConfig as Config } from "../../../src/runtime-config.js";
import { ContextRegistry } from "../../../src/server/context-registry.js";
import { Dispatcher } from "../../../src/server/dispatcher.js";
import type { Module } from "../../../src/server/registry.js";
import { Registry } from "../../../src/server/registry.js";
import {
  type RouteRunner,
  routesMiddlewareForRunners,
} from "../../../src/server/web-server/routes-middleware.js";

const CONFIG: Pick<Config, "proxyUrl" | "proxyPaths"> = {
  proxyPaths: new Map(),
  proxyUrl: "",
};

function runner(
  prefix: string,
  routes: Array<[path: string, module: Module]>,
): RouteRunner {
  const registry = new Registry();

  for (const [path, module] of routes) {
    registry.add(path, module);
  }

  return {
    dispatcher: new Dispatcher(registry, new ContextRegistry()),
    prefix,
  };
}

function appFor(runners: RouteRunner[]) {
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

    const customers = await request(app.callback()).get("/customers");
    const products = await request(app.callback()).get("/products");

    expect(customers.status).toBe(200);
    expect(customers.text).toBe("customers");
    expect(products.status).toBe(200);
    expect(products.text).toBe("products");
  });

  it("falls through three runners sharing an empty prefix", async () => {
    const app = appFor([
      runner("", [["/first", { GET: () => ({ body: "first" }) }]]),
      runner("", [["/second", { GET: () => ({ body: "second" }) }]]),
      runner("", [["/third", { GET: () => ({ body: "third" }) }]]),
    ]);

    const response = await request(app.callback()).get("/third");

    expect(response.status).toBe(200);
    expect(response.text).toBe("third");
  });

  it("falls through runners sharing a non-empty prefix", async () => {
    const app = appFor([
      runner("/api", [["/customers", { GET: () => ({ body: "customers" }) }]]),
      runner("/api", [["/products", { GET: () => ({ body: "products" }) }]]),
    ]);

    const response = await request(app.callback()).get("/api/products");

    expect(response.status).toBe(200);
    expect(response.text).toBe("products");
  });

  it("does not select a runner when only the prefix text matches", async () => {
    const app = appFor([
      runner("/api", [["/pets", { GET: () => ({ body: "pets" }) }]]),
    ]);

    const response = await request(app.callback()).get("/apiary/pets");

    expect(response.status).toBe(404);
    expect(response.text).not.toBe("pets");
  });

  it("maps an exact trailing-slash prefix to the root route", async () => {
    const app = appFor([
      runner("/api/", [["/", { GET: () => ({ body: "root" }) }]]),
    ]);

    const response = await request(app.callback()).get("/api");

    expect(response.status).toBe(200);
    expect(response.text).toBe("root");
  });

  it("selects a later runner that supports the requested method", async () => {
    const app = appFor([
      runner("", [["/items", { GET: () => ({ body: "get items" }) }]]),
      runner("", [["/items", { POST: () => ({ body: "post item" }) }]]),
    ]);

    const response = await request(app.callback()).post("/items");

    expect(response.status).toBe(200);
    expect(response.text).toBe("post item");
  });

  it("uses declaration order when runners support the same path and method", async () => {
    const app = appFor([
      runner("", [["/items", { GET: () => ({ body: "first" }) }]]),
      runner("", [["/items", { GET: () => ({ body: "second" }) }]]),
    ]);

    const response = await request(app.callback()).get("/items");

    expect(response.status).toBe(200);
    expect(response.text).toBe("first");
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

    const response = await request(app.callback()).get("/missing");

    expect(response.status).toBe(404);
  });
});
