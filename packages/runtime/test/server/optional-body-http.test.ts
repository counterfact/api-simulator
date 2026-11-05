import request from "supertest";
import { createKoaApp } from "../../src/koa.js";
import { Registry } from "../../src/server/registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { ContextRegistry } from "../../src/server/context-registry.js";

function appFor(
  required: boolean | undefined,
  schema: Record<string, unknown>,
) {
  const registry = new Registry();
  const contextRegistry = new ContextRegistry();
  const bodies: unknown[] = [];
  registry.add("/items", {
    PATCH: ({ body }) => {
      bodies.push(body);
      return { status: 200, body: "called" };
    },
  });
  const dispatcher = new Dispatcher(registry, contextRegistry, {
    paths: {
      "/items": {
        patch: {
          requestBody: {
            required,
            content: { "application/json": { schema } },
          },
          responses: {},
        },
      },
    },
  });
  const app = createKoaApp({
    runners: [
      {
        registry,
        contextRegistry,
        dispatcher,
        openApiPath: "unused",
        overlays: [],
        prefix: "",
        subdirectory: "",
      },
    ],
    config: {
      basePath: ".",
      port: 0,
      proxyPaths: new Map(),
      proxyUrl: "",
      startAdminApi: false,
    },
  });
  return { app, bodies };
}
it.each([false, undefined])(
  "preserves absent optional HTTP bodies (required=%s)",
  async (required) => {
    const { app, bodies } = appFor(required, {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } },
    });
    expect((await request(app.callback()).patch("/items")).status).toBe(200);
    expect(bodies).toEqual([undefined]);
    expect(
      (await request(app.callback()).patch("/items").send({})).status,
    ).toBe(400);
    expect(
      (await request(app.callback()).patch("/items").send({ name: "ok" }))
        .status,
    ).toBe(200);
  },
);
it("rejects absent required HTTP bodies without conflating an explicit empty object", async () => {
  const { app, bodies } = appFor(true, { type: "object" });
  expect((await request(app.callback()).patch("/items")).status).toBe(400);
  expect((await request(app.callback()).patch("/items").send({})).status).toBe(
    200,
  );
  expect(bodies).toEqual([{}]);
});
it.each([true, false])(
  "validates explicit JSON null against nullable=%s",
  async (nullable) => {
    const { app, bodies } = appFor(false, { type: "object", nullable });
    const response = await request(app.callback())
      .patch("/items")
      .set("Content-Type", "application/json")
      .send("null");
    expect(response.status).toBe(nullable ? 200 : 400);
    expect(bodies).toEqual(nullable ? [null] : []);
  },
);
