import { usingTemporaryFiles } from "using-temporary-files";
import { loadOpenApiDocument } from "@counterfact/openapi";
import type { OpenApiOperation } from "@counterfact/types";
import { validateRequest } from "../../src/server/request-validator.js";

it("validates finite bodies against a loaded recursive contract", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "openapi.json",
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Recursive", version: "1" },
        paths: {
          "/nodes": {
            post: {
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Node" },
                  },
                },
              },
              responses: { "200": { description: "OK" } },
            },
          },
        },
        components: {
          schemas: {
            Node: {
              type: "object",
              properties: {
                name: { type: "string" },
                children: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Node" },
                },
              },
            },
          },
        },
      }),
    );
    const document = (await loadOpenApiDocument($.path("openapi.json"))) as {
      paths: { "/nodes": { post: OpenApiOperation } };
    };
    const operation = document.paths["/nodes"].post;
    const request = { headers: {}, cookie: {}, query: {} };
    expect(
      validateRequest(operation, { ...request, body: { name: "leaf" } }).valid,
    ).toBe(true);
    expect(
      validateRequest(operation, {
        ...request,
        body: { children: [{ name: "child", children: [{}] }] },
      }).valid,
    ).toBe(true);
    const invalid = validateRequest(operation, {
      ...request,
      body: { children: [{ name: 123 }] },
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join()).toContain("/children/0/name");
  });
});
it("supports mutually recursive and shared schemas without mutating them", () => {
  const a: Record<string, unknown> = { type: "object" };
  const b: Record<string, unknown> = { type: "object" };
  const shared = { type: "string" };
  a.properties = { b, first: shared, second: shared };
  b.properties = { a };
  const operation = {
    requestBody: { content: { "application/json": { schema: a } } },
    responses: {},
  };
  const request = { headers: {}, cookie: {}, query: {} };
  expect(
    validateRequest(operation, {
      ...request,
      body: { b: { a: { first: "ok" } } },
    }).valid,
  ).toBe(true);
  expect(
    validateRequest(operation, {
      ...request,
      body: { b: { a: { second: 1 } } },
    }).valid,
  ).toBe(false);
  expect((b.properties as Record<string, unknown>).a).toBe(a);
});

it.each([true, false])(
  "accepts boolean request schema %s without object caching",
  (schema) => {
    const operation = {
      requestBody: {
        content: {
          "application/json": {
            schema: schema as unknown as Record<string, unknown>,
          },
        },
      },
      responses: {},
    };
    expect(
      validateRequest(operation, {
        body: {},
        headers: {},
        cookie: {},
        query: {},
      }).valid,
    ).toBe(schema);
  },
);
it.each(["a%2Fb", "a%", "a/b~c"])(
  "encodes recursive pointer tokens %s",
  (name) => {
    const node: Record<string, unknown> = { type: "object", properties: {} };
    node.properties = { next: node, value: { type: "integer" } };
    const schema = { type: "object", properties: { [name]: node } };
    const operation = {
      requestBody: { content: { "application/json": { schema } } },
      responses: {},
    };
    const request = { headers: {}, cookie: {}, query: {} };
    expect(
      validateRequest(operation, {
        ...request,
        body: { [name]: { next: { value: 1 } } },
      }).valid,
    ).toBe(true);
    expect(
      validateRequest(operation, {
        ...request,
        body: { [name]: { next: { value: "bad" } } },
      }).valid,
    ).toBe(false);
  },
);
it("resolves recursive targets within and across nested id resources", () => {
  const root: Record<string, unknown> = { type: "object" };
  const child: Record<string, unknown> = {
    $id: "https://example.test/child",
    type: "object",
  };
  root.properties = { node: child };
  child.properties = { next: child, parent: root, value: { type: "integer" } };
  const operation = {
    requestBody: { content: { "application/json": { schema: root } } },
    responses: {},
  };
  const request = { headers: {}, cookie: {}, query: {} };
  expect(
    validateRequest(operation, {
      ...request,
      body: { node: { next: { value: 1 }, parent: { node: { value: 2 } } } },
    }).valid,
  ).toBe(true);
  expect(
    validateRequest(operation, {
      ...request,
      body: { node: { next: { value: "bad" } } },
    }).valid,
  ).toBe(false);
});
