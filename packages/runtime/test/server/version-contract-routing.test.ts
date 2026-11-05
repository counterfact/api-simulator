import request from "supertest";
import { createKoaApp } from "../../src/koa.js";
import { Registry } from "../../src/server/registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { ContextRegistry } from "../../src/server/context-registry.js";
const operation = { responses: {} };
const incoming = { body: undefined, headers: {}, query: {}, req: {} };
function appFor(runners: { dispatcher: Dispatcher; prefix: string }[]) {
  return createKoaApp({
    runners: runners.map(({ dispatcher, prefix }) => ({
      dispatcher,
      prefix,
      registry: dispatcher.registry,
      contextRegistry: dispatcher.contextRegistry,
      openApiPath: "unused",
      overlays: [],
      subdirectory: "",
    })),
    config: {
      basePath: ".",
      port: 0,
      proxyPaths: new Map(),
      proxyUrl: "",
      startAdminApi: false,
    },
  });
}
it("selects a contract wildcard over a literal belonging to another version", async () => {
  const registry = new Registry();
  registry.add("/pets/special", {
    GET: () => ({ status: 200, body: "wrong literal" }),
  });
  registry.add("/pets/{id}", {
    GET: ($) => ({ status: 200, body: $.path?.id }),
  });
  const dispatcher = new Dispatcher(
    registry,
    new ContextRegistry(),
    { paths: { "/pets/{id}": { get: operation } } },
    undefined,
    "v2",
  );
  const result = await dispatcher.request({
    ...incoming,
    method: "GET",
    path: "/pets/special",
  });
  expect(result.status).toBe(200);
  expect(result.body).toBe("special");
  const missingMethod = await dispatcher.request({
    ...incoming,
    method: "POST",
    path: "/pets/123",
  });
  expect(missingMethod.status).toBe(405);
  expect(missingMethod.headers?.allow).toBe("GET");
});
it("does not execute inherited contract operations", async () => {
  const registry = new Registry();
  let calls = 0;
  registry.add("/items", {
    CONSTRUCTOR: () => {
      calls++;
      return { status: 200 };
    },
  });
  const dispatcher = new Dispatcher(
    registry,
    new ContextRegistry(),
    { paths: { "/items": { get: operation, additionalOperations: {} } } },
    { validateResponses: false },
    "v2",
  );
  expect(
    (
      await dispatcher.request({
        ...incoming,
        method: "CONSTRUCTOR",
        path: "/items",
      })
    ).status,
  ).toBe(405);
  expect(calls).toBe(0);
});
it("uses the first eligible contract at a shared prefix", async () => {
  const registry = new Registry();
  const contexts = new ContextRegistry();
  registry.add("/only-v2", { GET: ($) => ({ status: 200, body: $.version }) });
  const first = new Dispatcher(
    registry,
    contexts,
    { paths: { "/only-v1": { get: operation } } },
    undefined,
    "v1",
  );
  const second = new Dispatcher(
    registry,
    contexts,
    { paths: { "/only-v2": { get: operation } } },
    undefined,
    "v2",
  );
  const response = await request(
    appFor([
      { dispatcher: first, prefix: "" },
      { dispatcher: second, prefix: "" },
    ]).callback(),
  ).get("/only-v2");
  expect(response.status).toBe(200);
  expect(response.text).toBe("v2");
});
it("preserves contract-specific Allow through the multi-runner HTTP fallback", async () => {
  const registry = new Registry();
  const contexts = new ContextRegistry();
  registry.add("/items", {
    GET: () => ({ status: 200 }),
    POST: () => ({ status: 200 }),
  });
  const first = new Dispatcher(
    registry,
    contexts,
    { paths: { "/items": { get: operation, post: operation } } },
    undefined,
    "v1",
  );
  const second = new Dispatcher(
    registry,
    contexts,
    { paths: { "/items": { get: operation } } },
    undefined,
    "v2",
  );
  const response = await request(
    appFor([
      { dispatcher: first, prefix: "/v1" },
      { dispatcher: second, prefix: "/v2" },
    ]).callback(),
  ).delete("/v2/items");
  expect(response.status).toBe(405);
  expect(response.headers.allow).toBe("GET");
});
