import { usingTemporaryFiles } from "using-temporary-files";
import request from "supertest";
import {
  createHarRequest,
  HarCollection,
} from "../../src/server/har-collection.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import {
  Registry,
  type CounterfactResponseObject,
} from "../../src/server/registry.js";
import { ContextRegistry } from "../../src/server/context-registry.js";
import { ModuleLoader } from "../../src/server/module-loader.js";
import { createMswHandlers, handleMswRequest } from "../../src/msw.js";
import { createKoaApp } from "../../src/koa.js";

const entry = {
  request: {
    method: "GET",
    url: "https://recorded.test/api/items/42?kind=one",
  },
  response: {
    status: 200,
    headers: [
      { name: "Content-Type", value: "application/json; charset=utf-8" },
    ],
    content: { text: '{"id":42}' },
  },
};
const archive = (entries: unknown[]) => JSON.stringify({ log: { entries } });

it("does not treat a known omitted HAR payload as bodyless", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "har/body.har",
      archive([{ ...entry, request: { ...entry.request, bodySize: 7 } }]),
    );
    const collection = new HarCollection($.path("."));
    await collection.load();
    const lookup = collection.lookup(
      createHarRequest({
        method: "GET",
        url: "/api/items/42?kind=one",
        headers: {},
      }),
    );
    expect(lookup()).toBeUndefined();
    // Explicit custom matching can still opt into a payload-unavailable entry.
    expect(lookup(() => true)).toBeDefined();
  });
});

it("replays concrete parameterized MSW URLs with the public base path", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "openapi.json",
      JSON.stringify({
        swagger: "2.0",
        info: { title: "MSW", version: "1" },
        basePath: "/api",
        paths: {
          "/items/{id}": {
            get: { responses: { "200": { description: "ok" } } },
          },
        },
      }),
    );
    await $.add("har/msw.har", archive([entry]));
    class Loader extends ModuleLoader {
      public override async load() {
        this.registry.add("/items/{id}", {
          GET: ({ har }) =>
            (har?.() as unknown as CounterfactResponseObject) ?? {
              status: 404,
            },
        });
      }
    }
    await createMswHandlers(
      {
        basePath: $.path("."),
        openApiPath: $.path("openapi.json"),
        validateResponses: false,
      },
      Loader,
    );
    const result = (await handleMswRequest({
      method: "GET",
      rawPath: "/api/items/:id",
      path: "/api/items/42",
      query: { kind: "one" },
      headers: {},
      req: {},
      body: undefined,
    })) as CounterfactResponseObject;
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"id":42}');
  });
});

it("negotiates parameterized content types and validates scalar headers without changing repeated wire headers", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "har/headers.har",
      archive([
        {
          ...entry,
          response: {
            ...entry.response,
            headers: [
              ...entry.response.headers,
              { name: "X-Count", value: "42" },
              { name: "Set-Cookie", value: "one=1" },
              { name: "Set-Cookie", value: "two=2" },
            ],
          },
        },
      ]),
    );
    const collection = new HarCollection($.path("."));
    await collection.load();
    const registry = new Registry();
    const contextRegistry = new ContextRegistry();
    registry.add("/items/{id}", {
      GET: ({ har }) => har?.() as unknown as CounterfactResponseObject,
    });
    const responseSpec = {
      headers: { "X-Count": { schema: { type: "integer" }, required: true } },
      content: { "application/json": { schema: { type: "object" } } },
    };
    const document = {
      paths: { "/items/{id}": { get: { responses: { 200: responseSpec } } } },
    };
    const dispatcher = new Dispatcher(
      registry,
      contextRegistry,
      document,
      undefined,
      "",
      [],
      collection,
    );
    const input = {
      method: "GET",
      path: "/items/42",
      originalUrl: "/api/items/42?kind=one",
      query: {},
      headers: { accept: "application/json" },
      req: {},
      body: undefined,
    };
    const result = await dispatcher.request(input);
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("application/json; charset=utf-8");
    expect(result.appendedHeaders).toBeUndefined();
    expect(result.headers?.["x-count"]).toEqual(["42"]);
    expect(result.headers?.["set-cookie"]).toEqual(["one=1", "two=2"]);
    const app = createKoaApp({
      runners: [
        {
          dispatcher,
          registry,
          contextRegistry,
          openApiPath: "unused",
          overlays: [],
          prefix: "/api",
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
    const response = await request(app.callback())
      .get("/api/items/42?kind=one")
      .set("Accept", "application/json");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain(
      "application/json; charset=utf-8",
    );
    expect(response.headers["set-cookie"]).toEqual(["one=1", "two=2"]);
    expect(response.headers["response-type-error"]).toBeUndefined();
  });
});

it("validates singleton HAR header arrays against scalar schemas independently of negotiation", async () => {
  const { validateResponse } =
    await import("../../src/server/response-validator.js");
  const result = validateResponse(
    {
      responses: {
        200: { headers: { "X-Count": { schema: { type: "integer" } } } },
      },
    },
    { status: 200, headers: { "x-count": ["42"] } },
  );
  expect(result.valid).toBe(true);
});

it("preserves array header schemas and does not collapse repeated scalar values", async () => {
  const { validateResponse } =
    await import("../../src/server/response-validator.js");
  expect(
    validateResponse(
      {
        responses: {
          200: {
            headers: {
              "X-Value": {
                schema: { type: ["array", "null"], items: { type: "string" } },
              },
            },
          },
        },
      },
      { status: 200, headers: { "x-value": ["one"] } },
    ).valid,
  ).toBe(true);
  expect(
    validateResponse(
      {
        responses: {
          200: { headers: { "X-Value": { schema: { type: "integer" } } } },
        },
      },
      { status: 200, headers: { "x-value": ["42", "43"] } },
    ).valid,
  ).toBe(false);
});

it("does not treat binary adapter input as an absent HAR body", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "har/empty.har",
      archive([
        {
          ...entry,
          request: {
            method: "POST",
            url: "https://recorded.test/upload",
            bodySize: 0,
          },
        },
      ]),
    );
    const collection = new HarCollection($.path("."));
    await collection.load();
    const incoming = createHarRequest({
      method: "POST",
      url: "/upload",
      headers: { "content-type": "application/octet-stream" },
      rawBody: new Uint8Array([0, 255, 1]),
    });
    expect(incoming.rawBody).toBeUndefined();
    expect(incoming.bodyAvailable).toBe(false);
    expect(collection.lookup(incoming)()).toBeUndefined();
  });
});

it("keeps multipart bytes available to handlers while HAR replay declines multipart matching", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "har/upload.har",
      archive([
        {
          ...entry,
          request: { method: "POST", url: "https://recorded.test/api/upload" },
        },
      ]),
    );
    const collection = new HarCollection($.path("."));
    await collection.load();
    const registry = new Registry();
    const contextRegistry = new ContextRegistry();
    registry.add("/upload", {
      POST: ({ har, body }) => {
        const file = (body as { file: { data: Uint8Array; size: number } })
          .file;
        return (
          (har?.() as unknown as CounterfactResponseObject) ?? {
            status: 200,
            contentType: "application/json",
            body: { size: file.size, bytes: Array.from(file.data) },
          }
        );
      },
    });
    const dispatcher = new Dispatcher(
      registry,
      contextRegistry,
      {
        paths: {
          "/upload": {
            post: {
              requestBody: {
                required: true,
                content: {
                  "multipart/form-data": {
                    schema: {
                      type: "object",
                      required: ["file"],
                      properties: {
                        file: { type: "string", format: "binary" },
                      },
                    },
                  },
                },
              },
              responses: { 200: { description: "ok" } },
            },
          },
        },
      },
      undefined,
      "",
      [],
      collection,
    );
    const app = createKoaApp({
      runners: [
        {
          dispatcher,
          registry,
          contextRegistry,
          openApiPath: "unused",
          overlays: [],
          prefix: "/api",
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
    const response = await request(app.callback())
      .post("/api/upload")
      .attach("file", Buffer.from([0, 255, 1]), {
        filename: "one.bin",
        contentType: "application/octet-stream",
      });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ size: 3, bytes: [0, 255, 1] });
  });
});
