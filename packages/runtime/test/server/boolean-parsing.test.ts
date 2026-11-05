import { ContextRegistry } from "../../src/server/context-registry.js";
import { Dispatcher } from "../../src/server/dispatcher.js";
import { Registry } from "../../src/server/registry.js";

it("rejects malformed boolean text without calling the handler", async () => {
  const registry = new Registry();
  let calls = 0;
  registry.add("/flags", {
    GET: ($) => {
      calls++;
      return { status: 200, body: $.query.enabled };
    },
  });
  const document = {
    paths: {
      "/flags": {
        get: {
          parameters: [
            {
              in: "query" as const,
              name: "enabled",
              required: true,
              schema: { type: "boolean" },
            },
          ],
          responses: {},
        },
      },
    },
  };
  const dispatcher = new Dispatcher(registry, new ContextRegistry(), document);
  const request = {
    method: "GET" as const,
    path: "/flags",
    headers: {},
    body: undefined,
    req: {},
  };
  for (const [value, expected] of [
    ["true", true],
    ["false", false],
  ] as const) {
    const result = await dispatcher.request({
      ...request,
      query: { enabled: value },
    });
    expect(result.status).toBe(200);
    expect(result.body).toBe(expected);
  }
  for (const value of ["garbage", "", "TRUE", "False"]) {
    expect(
      (await dispatcher.request({ ...request, query: { enabled: value } }))
        .status,
    ).toBe(400);
  }
  expect(calls).toBe(2);
  const unchecked = new Dispatcher(registry, new ContextRegistry(), document, {
    validateRequests: false,
  });
  expect(
    (await unchecked.request({ ...request, query: { enabled: "garbage" } }))
      .body,
  ).toBe("garbage");
});

it.each(["query", "header", "cookie"] as const)(
  "does not validate inherited %s values as supplied parameters",
  async (location) => {
    const { validateRequest } =
      await import("../../src/server/request-validator.js");
    const operation = {
      parameters: [
        { in: location, name: "constructor", schema: { type: "boolean" } },
      ],
      responses: {},
    };
    const request = { body: undefined, headers: {}, cookie: {}, query: {} };
    expect(validateRequest(operation, request).valid).toBe(true);
    const key = location === "header" ? "headers" : location;
    expect(
      validateRequest(operation, {
        ...request,
        [key]: { constructor: "false" },
      }).valid,
    ).toBe(true);
    expect(
      validateRequest(operation, { ...request, [key]: { constructor: "bad" } })
        .valid,
    ).toBe(false);
  },
);
