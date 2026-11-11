import { usingTemporaryFiles } from "using-temporary-files";
import { HarCollection } from "../../src/server/har-collection.js";
import {
  Dispatcher,
  type OpenApiDocument,
} from "../../src/server/dispatcher.js";
import { ContextRegistry } from "../../src/server/context-registry.js";
import {
  Registry,
  type CounterfactResponseObject,
} from "../../src/server/registry.js";

it("binds HAR lookup before coercion and middleware mutation and retains content negotiation and response validation", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "har/one.har",
      JSON.stringify({
        log: {
          entries: [
            {
              request: {
                method: "GET",
                url: "https://recorded.test/public/items?count=01",
              },
              response: {
                status: 200,
                headers: [{ name: "Content-Type", value: "text/plain" }],
                content: { text: "recorded" },
              },
            },
          ],
        },
      }),
    );
    const collection = new HarCollection($.path("."));
    await collection.load();
    const registry = new Registry();
    registry.add("/items", {
      GET: ({ har }) =>
        (har?.() as unknown as CounterfactResponseObject | undefined) ?? {
          status: 404,
          body: "fallback",
          contentType: "text/plain",
        },
    });
    registry.addMiddleware("/", async (request, next) => {
      request.query.count = 999;
      return next(request);
    });
    const spec: OpenApiDocument = {
      paths: {
        "/items": {
          get: {
            parameters: [
              { in: "query", name: "count", schema: { type: "integer" } },
            ],
            responses: {
              200: {
                headers: {
                  "X-Required": { required: true, schema: { type: "string" } },
                },
                content: { "text/plain": { schema: { type: "string" } } },
              },
            },
          },
        },
      },
    };
    const dispatcher = new Dispatcher(
      registry,
      new ContextRegistry(),
      spec,
      undefined,
      "",
      [],
      collection,
    );
    const input = {
      method: "GET",
      path: "/items",
      originalUrl: "/public/items?count=01",
      query: { count: "01" },
      headers: { accept: "text/plain" },
      body: undefined,
      req: {},
    };
    const result = await dispatcher.request(input);
    expect(result.body).toBe("recorded");
    expect(result.appendedHeaders).toEqual([
      ["response-type-error", "response header 'X-Required' is required"],
    ]);
    expect(
      (
        await dispatcher.request({
          ...input,
          headers: { accept: "application/json" },
        })
      ).status,
    ).toBe(406);
    expect(
      (
        await dispatcher.request({
          ...input,
          originalUrl: "/public/items?count=02",
        })
      ).status,
    ).toBe(404);
  });
});
