import request from "supertest";
import type { OpenApiParameters } from "@counterfact/types";
import { createKoaApp } from "../../src/koa.js";
import { Registry } from "../../src/server/registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { ContextRegistry } from "../../src/server/context-registry.js";

function setup(
  schema: Record<string, unknown>,
  options: Partial<OpenApiParameters> = {},
) {
  const registry = new Registry(),
    contextRegistry = new ContextRegistry();
  registry.add("/items", { GET: ($) => ({ status: 200, body: $.query }) });
  const dispatcher = new Dispatcher(registry, contextRegistry, {
    paths: {
      "/items": {
        get: {
          parameters: [{ name: "tags", in: "query", schema, ...options }],
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
  return { dispatcher, app };
}
const array = { type: "array", items: { type: "string" } };
const input = {
  method: "GET" as const,
  path: "/items",
  body: undefined,
  headers: {},
  req: {},
};
it.each([
  array,
  { anyOf: [array, { type: "null" }] },
  { oneOf: [{ type: ["null"] }, array] },
  { ...array, type: ["array", "null"] },
])(
  "normalizes one and repeated values without adding absent values (%j)",
  async (schema) => {
    const { dispatcher } = setup(schema);
    expect(
      (await dispatcher.request({ ...input, query: { tags: "one" } })).body,
    ).toEqual({ tags: ["one"] });
    expect(
      (await dispatcher.request({ ...input, query: { tags: ["one", "two"] } }))
        .body,
    ).toEqual({ tags: ["one", "two"] });
    expect((await dispatcher.request({ ...input, query: {} })).body).toEqual(
      {},
    );
    expect(
      (await dispatcher.request({ ...input, query: { tags: "one,two" } })).body,
    ).toEqual({ tags: ["one,two"] });
  },
);
it.each([
  ["form", false, "1,2", [1, 2], "integer"],
  ["spaceDelimited", false, "1 2", [1, 2], "number"],
  ["pipeDelimited", false, "true|false", [true, false], "boolean"],
] as const)(
  "respects %s serialization and converts primitive items",
  async (style, explode, raw, expected, type) => {
    const { dispatcher } = setup(
      { type: "array", items: { type } },
      { style, explode },
    );
    expect(
      (await dispatcher.request({ ...input, query: { tags: raw } })).body,
    ).toEqual({ tags: expected });
  },
);
it("preserves malformed items, ambiguous schemas, and unsupported styles", async () => {
  const integer = setup({ type: "array", items: { type: "integer" } });
  expect(
    (
      await integer.dispatcher.request({
        ...input,
        query: { tags: ["bad", "", "1.5"] },
      })
    ).body,
  ).toEqual({ tags: ["bad", "", "1.5"] });
  const ambiguous = setup({ anyOf: [array, { type: "string" }] });
  expect(
    (await ambiguous.dispatcher.request({ ...input, query: { tags: "one" } }))
      .body,
  ).toEqual({ tags: "one" });
  const unsupported = setup(array, { style: "deepObject" });
  expect(
    (await unsupported.dispatcher.request({ ...input, query: { tags: "one" } }))
      .body,
  ).toEqual({ tags: "one" });
});
it("delivers singleton and repeated arrays through real HTTP", async () => {
  const { app } = setup({ anyOf: [array, { type: "null" }] });
  expect((await request(app.callback()).get("/items?tags=one")).body).toEqual({
    tags: ["one"],
  });
  expect(
    (await request(app.callback()).get("/items?tags=one&tags=two")).body,
  ).toEqual({ tags: ["one", "two"] });
  expect(
    (await request(app.callback()).get("/items?tags=one%2Ctwo")).body,
  ).toEqual({ tags: ["one,two"] });
  expect((await request(app.callback()).get("/items")).body).toEqual({});
});

it.each(["anyOf", "oneOf"])(
  "preserves sibling item constraints around %s",
  async (keyword) => {
    const schema = {
      items: { type: "integer" },
      [keyword]: [{ type: "array" }, { type: "null" }],
    };
    const { dispatcher } = setup(schema);
    expect(
      (await dispatcher.request({ ...input, query: { tags: "1" } })).body,
    ).toEqual({ tags: [1] });
    const combined = setup({
      type: "array",
      items: { type: "number" },
      allOf: [{ items: { type: "integer" } }],
    });
    expect(
      (
        await combined.dispatcher.request({
          ...input,
          query: { tags: ["1", "1.5"] },
        })
      ).body,
    ).toEqual({ tags: [1, "1.5"] });
  },
);
it.each(["integer", "number"])(
  "keeps radix and malformed text visible for %s items",
  async (type) => {
    const { dispatcher } = setup({ type: "array", items: { type } });
    const malformed = ["0x10", "0b10", "0o10", "NaN", "Infinity", " 1 ", ""];
    expect(
      (await dispatcher.request({ ...input, query: { tags: malformed } })).body,
    ).toEqual({ tags: malformed });
    expect(
      (
        await dispatcher.request({
          ...input,
          query: { tags: ["001", "-2", "1e2"] },
        })
      ).body,
    ).toEqual({ tags: [1, -2, 100] });
  },
);
it.each([
  { style: "spaceDelimited", values: ["New York", "Boston"] },
  { style: "pipeDelimited", values: ["one|two", "three"] },
])(
  "preserves each explicit exploded $style occurrence over HTTP",
  async ({ style, values }) => {
    const { app } = setup(array, { style, explode: true });
    const query = values
      .map((value) => "tags=" + encodeURIComponent(value))
      .join("&");
    expect((await request(app.callback()).get("/items?" + query)).body).toEqual(
      { tags: values },
    );
  },
);
it("uses prefix schemas before the trailing items schema", async () => {
  const { dispatcher, app } = setup({
    type: "array",
    prefixItems: [{ type: "string" }, { type: "boolean" }],
    items: { type: "integer" },
  });
  expect(
    (
      await dispatcher.request({
        ...input,
        query: { tags: ["001", "false", "2"] },
      })
    ).body,
  ).toEqual({ tags: ["001", false, 2] });
  expect(
    (await request(app.callback()).get("/items?tags=001&tags=false&tags=2"))
      .body,
  ).toEqual({ tags: ["001", false, 2] });
});
it("normalizes cardinality across alternatives that all declare arrays", async () => {
  const { dispatcher } = setup({
    anyOf: [
      { type: "array", items: { type: "string" } },
      { type: "array", items: { type: "integer" } },
    ],
  });
  expect(
    (await dispatcher.request({ ...input, query: { tags: "001" } })).body,
  ).toEqual({ tags: ["001"] });
});
