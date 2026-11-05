import { normalizeMultipartBody } from "../../src/server/multipart-body.js";
import { validateRequest } from "../../src/server/request-validator.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { Registry } from "../../src/server/registry.js";
import { ContextRegistry } from "../../src/server/context-registry.js";
const file = {
  data: new Uint8Array([1]),
  filename: "a.bin",
  contentType: "application/octet-stream",
  size: 1,
};
const request = (body: unknown) => ({
  body,
  headers: { "content-type": "multipart/form-data" },
  cookie: {},
  query: {},
});
const operation = (schema: Record<string, unknown>) => ({
  requestBody: { content: { "multipart/form-data": { schema } } },
  responses: {},
});
it.each(["oneOf", "anyOf"])(
  "normalizes valid candidates in %s without ignoring exclusivity",
  (key) => {
    const schema = {
      [key]: [
        {
          type: "object",
          required: ["files"],
          properties: {
            files: {
              type: "array",
              items: { type: "string", format: "binary" },
            },
          },
        },
        {
          type: "object",
          required: ["count"],
          properties: { count: { type: "integer" } },
        },
      ],
    };
    const normalized = normalizeMultipartBody({ files: file }, schema) as {
      files: unknown;
    };
    expect(Array.isArray(normalized.files)).toBe(true);
    expect(validateRequest(operation(schema), request(normalized)).valid).toBe(
      true,
    );
    const counted = normalizeMultipartBody({ count: "3" }, schema);
    expect(counted).toEqual({ count: 3 });
    expect(validateRequest(operation(schema), request(counted)).valid).toBe(
      true,
    );
    const ambiguous = {
      oneOf: [
        { type: "object", properties: { count: { type: "integer" } } },
        { type: "object", properties: { count: { type: "integer" } } },
      ],
    };
    expect(
      validateRequest(
        operation(ambiguous),
        request(normalizeMultipartBody({ count: "3" }, ambiguous)),
      ).valid,
    ).toBe(false);
  },
);
it("adapts nullable binary type arrays and infers implicit object fields", () => {
  const schema = {
    type: "object",
    properties: {
      file: { type: ["string", "null"], format: "binary" },
      metadata: { properties: { accent: { type: "string" } } },
    },
  };
  const normalized = normalizeMultipartBody(
    { file, metadata: '{"accent":"British"}' },
    schema,
  );
  expect(normalized).toEqual({ file, metadata: { accent: "British" } });
  expect(validateRequest(operation(schema), request(normalized)).valid).toBe(
    true,
  );
  expect(
    validateRequest(operation(schema), request({ file: null })).valid,
  ).toBe(true);
});
it.each(["application/*", "*/*"])(
  "validates declared wildcard media %s",
  (media) => {
    const schema = {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } },
    };
    const op = {
      requestBody: { content: { [media]: { schema } } },
      responses: {},
    };
    const input = {
      body: {},
      headers: { "content-type": "application/json" },
      cookie: {},
      query: {},
    };
    expect(validateRequest(op, input).valid).toBe(false);
    expect(
      validateRequest(op, { ...input, body: { name: "valid" } }).valid,
    ).toBe(true);
  },
);
it("rejects undeclared media before invoking the handler", async () => {
  const registry = new Registry();
  let calls = 0;
  registry.add("/items", {
    POST: () => {
      calls++;
      return { status: 200 };
    },
  });
  const schema = { type: "object", required: ["name"] };
  const dispatcher = new Dispatcher(registry, new ContextRegistry(), {
    paths: {
      "/items": {
        post: {
          requestBody: { content: { "application/json": { schema } } },
          responses: {},
        },
      },
    },
  });
  const response = await dispatcher.request({
    method: "POST",
    path: "/items",
    body: {},
    headers: { "content-type": "application/x-www-form-urlencoded" },
    query: {},
    req: {},
  });
  expect(response.status).toBe(400);
  expect(calls).toBe(0);
});
