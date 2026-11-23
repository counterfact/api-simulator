import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { expect, it } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";

const string = { type: "string" };
const integer = { type: "integer" };
const json = (schema: object) => ({ "application/json": { schema } });
const parameter = (
  name: string,
  placement: string,
  schema = string,
  required = true,
) => ({ name, in: placement, required, schema });

it("generates and type-checks a reusable route prefix against inherited and operation inputs", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add(
      "api.json",
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Orders", version: "1" },
        security: [{ userToken: ["orders:read"] }],
        paths: {
          "/download": {
            get: {
              operationId: "downloadReport",
              parameters: [parameter("format", "query")],
              responses: {
                200: {
                  description: "Report",
                  content: { "application/pdf": {} },
                },
                404: { description: "Missing", content: json(string) },
              },
            },
          },
          "/health": {
            get: {
              operationId: "health",
              responses: { 204: { description: "Healthy" } },
            },
          },
          "/search": {
            get: {
              operationId: "search",
              parameters: [parameter("q", "query", string, false)],
              responses: { 204: { description: "No matches" } },
            },
          },
          "/{tenantId}/v1/orders/{orderId}": {
            $ref: "#/components/pathItems/Orders",
          },
          "/{tenantId}/v1/customers": {
            parameters: [parameter("tenantId", "path")],
            get: {
              security: [],
              responses: { 204: { description: "No content" } },
            },
          },
        },
        components: {
          securitySchemes: {
            userToken: {
              type: "openIdConnect",
              openIdConnectUrl: "https://example.test/oidc",
            },
            session: { type: "apiKey", in: "cookie", name: "session" },
          },
          pathItems: {
            Orders: {
              parameters: [
                { $ref: "#/components/parameters/Tenant" },
                parameter("orderId", "path", integer),
                parameter("locale", "query", integer, false),
              ],
              get: {
                operationId: "getOrder",
                parameters: [parameter("locale", "query")],
                responses: {
                  200: {
                    description: "Order",
                    content: json({ $ref: "#/components/schemas/Order" }),
                  },
                  404: {
                    description: "Missing",
                    content: json({
                      type: "object",
                      required: ["error"],
                      properties: { error: string },
                    }),
                  },
                },
              },
              post: {
                operationId: "update-order",
                requestBody: {
                  required: true,
                  content: json({ $ref: "#/components/schemas/Order" }),
                },
                responses: { 204: { description: "Updated" } },
              },
            },
          },
          parameters: { Tenant: parameter("tenantId", "path") },
          schemas: {
            Order: {
              type: "object",
              required: ["id"],
              properties: { id: integer },
            },
          },
        },
      }),
    );

    const generator = new CodeGenerator(
      $.path("api.json"),
      $.path("generated"),
      {},
      "v1",
    );
    expect(await generator.generateClient()).toEqual([
      "v1/index.ts",
      "v1/types/components/schemas/Order.ts",
      "v1/response-validators.ts",
    ]);

    const generated = await $.read("generated/v1/index.ts");
    expect(generated).toContain("responseSchemas:");
    expect(generated).toContain("./response-validators.js");
    expect(generated).not.toContain("$defs");
    expect(generated).toContain('security: [{ userToken: ["orders:read"] }]');
    expect(generated).toContain("security: []");

    await $.add(
      "consumer.ts",
      `
      import { createClient } from "./generated/v1/index.js";
      const route = createClient({
        baseUrl: "https://example.test",
        auth: {
          userToken: async ({ scopes, signal }) => scopes.join(":") + String(signal?.aborted),
          session: () => ({ credentials: "include" }),
        },
      });
      createClient({ baseUrl: "https://example.test", auth: {
        // @ts-expect-error auth providers must use declared scheme names
        unknownScheme: () => "key",
      } });
      createClient({ baseUrl: "https://example.test", auth: {
        // @ts-expect-error cookie auth uses the browser-managed credentials option
        session: () => "cookie",
      } });
      const base = route("/{tenantId}/v1");
      // @ts-expect-error prefixes without an operation do not expose methods
      base.method("get");
      // @ts-expect-error misspelled path parameter
      base.path({ tenant: "acme" });
      const tenant = base.path({ tenantId: "acme" });
      const orders = tenant.segment("orders").segment("{orderId}");
      tenant.segment("orders/{orderId}");
      // @ts-expect-error misspelled descendant
      tenant.segment("order/{orderId}");
      // @ts-expect-error undeclared HTTP verb
      orders.method("delete");
      const get = orders.method("get");
      // @ts-expect-error orderId and locale are both required
      get.send();
      const identified = get.path({ orderId: 42 });
      // @ts-expect-error locale is still required
      identified.send();
      // @ts-expect-error the operation's string locale overrides the path item
      identified.query({ locale: 42 });
      const uncertain: { locale?: string } = {};
      // @ts-expect-error an optional property does not prove locale is present
      identified.query(uncertain).send();
      const result = await identified.query({ locale: "en-US" }).send();
      if (result.matchedStatus === "200") {
        const code: 200 = result.status;
        const id: number = result.body.id;
        // @ts-expect-error this is the success body
        result.body.error;
      }
      if (result.matchedStatus === "404") {
        const error: string = result.body.error;
      }
      const download = route("/download").method("get");
      // @ts-expect-error the stream method requires the operation's query
      await download.stream();
      const completed = download.query({ format: "pdf" });
      const streamed = await completed.stream({ signal: new AbortController().signal });
      if (streamed.matchedStatus === "200") {
        const bytes: ReadableStream<Uint8Array> = streamed.body;
      } else {
        const message: string = streamed.body;
      }
      const buffered = await completed.send();
      if (buffered.matchedStatus === "200") {
        const bytes: ArrayBuffer = buffered.body;
      }
      // @ts-expect-error only buffered direct calls are available for named operations
      await route.operations.downloadReport.stream({ query: { format: "pdf" } });
      // @ts-expect-error a JSON-only route cannot be streamed
      await identified.query({ locale: "en-US" }).stream();
      const namedResult = await route.operations.getOrder({
        path: { tenantId: "acme", orderId: 42 },
        query: { locale: "en-US" },
      }, { authenticate: true });
      if (namedResult.matchedStatus === "200") {
        const id: number = namedResult.body.id;
      }
      // @ts-expect-error named calls require the locale query
      await route.operations.getOrder({ path: { tenantId: "acme", orderId: 42 } });
      // @ts-expect-error this operation requires a body
      await route.operations["update-order"]({ path: { tenantId: "acme", orderId: 42 } });
      await route.operations["update-order"]({
        path: { tenantId: "acme", orderId: 42 }, body: { id: 42 },
      });
      await route.operations.health();
      await route.operations.health(undefined, { redirect: "manual" });
      await route.operations.search();
      await route.operations.search({ query: { q: "books" } });
      // @ts-expect-error an undeclared ID does not receive a named function
      await route.operations.customers();
      const update = orders.method("post").path({ orderId: 42 });
      // @ts-expect-error the post body is required
      update.send();
      // @ts-expect-error the payload is typed from the Order schema
      update.body({ id: "42" });
      // @ts-expect-error undefined is not a body
      update.body(undefined);
      await update.body({ id: 42 }).send();
      await tenant.segment("customers").method("get").send({ authenticate: false, redirect: "manual", credentials: "omit" });
    `,
    );

    const program = ts.createProgram([$.path("consumer.ts")], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      paths: {
        "@counterfact/client/fetch": [
          fileURLToPath(new URL("../../client/src/fetch.ts", import.meta.url)),
        ],
        "@counterfact/types/client-route": [
          fileURLToPath(
            new URL("../../types/src/client-route.ts", import.meta.url),
          ),
        ],
      },
    });
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        ),
    ).toEqual([]);
  });
});

it.each([
  {
    openapi: "3.0.3",
    exclusiveMinimum: { minimum: 0, exclusiveMinimum: true },
  },
  { openapi: "3.1.0", exclusiveMinimum: { exclusiveMinimum: 0 } },
])(
  "runs generated OpenAPI $openapi validators with string-to-code compilation disabled",
  async ({ openapi, exclusiveMinimum }) => {
    await usingTemporaryFiles(async ($) => {
      await $.add("package.json", '{"type":"module"}');
      await $.add(
        "node_modules/@counterfact/client/package.json",
        JSON.stringify({
          type: "module",
          exports: {
            "./fetch": "./fetch.js",
            "./validation-helpers": "./validation-helpers.js",
          },
        }),
      );
      for (const module of ["fetch", "validation-helpers"]) {
        const built = new URL(
          `../../client/dist/${module}.js`,
          import.meta.url,
        );
        await $.add(
          `node_modules/@counterfact/client/${module}.js`,
          `export * from ${JSON.stringify(built.href)};`,
        );
      }
      await $.add(
        "api.json",
        JSON.stringify({
          openapi,
          info: { title: "Orders", version: "1" },
          security: [{ userToken: ["orders:read"] }],
          paths: {
            "/orders/{orderId}": {
              parameters: [parameter("orderId", "path", integer)],
              get: {
                operationId: "__proto__",
                responses: {
                  "200": {
                    description: "Order",
                    content: json({ $ref: "#/components/schemas/Order" }),
                  },
                  "4XX": {
                    description: "Request failed",
                    content: {
                      "text/plain": {
                        schema: { type: "string", minLength: 2 },
                      },
                    },
                  },
                },
              },
            },
          },
          components: {
            securitySchemes: {
              userToken: {
                type: "oauth2",
                flows: {
                  clientCredentials: {
                    tokenUrl: "https://example.test/token",
                    scopes: { "orders:read": "Read orders" },
                  },
                },
              },
            },
            schemas: {
              Order: {
                type: "object",
                required: ["id", "items"],
                properties: {
                  id: { type: "integer", ...exclusiveMinimum },
                  child: { $ref: "#/components/schemas/Order" },
                  items: {
                    type: "array",
                    uniqueItems: true,
                    items: { type: "object" },
                  },
                },
              },
            },
          },
        }),
      );
      const generator = new CodeGenerator(
        $.path("api.json"),
        $.path("generated"),
        {},
      );
      await generator.generateClient();
      const validators = await $.read("generated/response-validators.ts");
      expect(validators).toContain("@counterfact/client/validation-helpers");
      expect(validators).not.toContain("require(");
      for (const module of ["index", "response-validators"]) {
        const source = await $.read(`generated/${module}.ts`);
        const { outputText } = ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        });
        await $.add(`generated/${module}.js`, outputText);
      }
      await $.add(
        "consumer.mjs",
        `
        import assert from "node:assert/strict";
        import { InvalidResponseError } from "@counterfact/client/fetch";
        import { createClient } from "./generated/index.js";
        const send = response => createClient({
          baseUrl: "https://example.test",
          auth: {
            userToken: ({ scopes }) => {
              assert.deepEqual(scopes, ["orders:read"]);
              return "generated-client-token";
            },
          },
          fetch: async (url, init) => {
            assert.equal(url.pathname, "/orders/42");
            assert.equal(init.headers.get("Authorization"), "Bearer generated-client-token");
            assert.equal(init.redirect, "manual");
            return response;
          },
        }).operations["__proto__"]({ path: { orderId: 42 } }, { authenticate: true, redirect: "manual" });
        const nested = { id: 1, items: [], child: { id: 2, items: [] } };
        assert.deepEqual((await send(Response.json(nested))).body, nested);
        const invalid = error => error instanceof InvalidResponseError && error.reason === "schema-mismatch";
        await assert.rejects(send(Response.json({ ...nested, child: { id: 0, items: [] } })), invalid);
        await assert.rejects(send(Response.json({ ...nested, items: [{ name: "same" }, { name: "same" }] })), invalid);
        const throttled = await send(new Response("slow down", { status: 429 }));
        assert.equal(throttled.status, 429);
        assert.equal(throttled.matchedStatus, "4XX");
        await assert.rejects(send(new Response("😀", { status: 429 })), invalid);
        assert.equal((await send(new Response("😀😀", { status: 429 }))).body, "😀😀");
      `,
      );
      // The subprocess reads only the generated fixture and the built client runtime.
      execFileSync(
        process.execPath,
        ["--disallow-code-generation-from-strings", "consumer.mjs"],
        { cwd: $.path(""), stdio: "pipe" },
      );
    });
  },
);

it("rejects duplicate operation IDs before writing the client", async () => {
  await usingTemporaryFiles(async ($) => {
    const get = {
      operationId: "getOrder",
      responses: { 204: { description: "OK" } },
    };
    await $.add(
      "api.json",
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Orders", version: "1" },
        paths: { "/orders": { get }, "/archived": { get } },
      }),
    );
    const generator = new CodeGenerator(
      $.path("api.json"),
      $.path("generated"),
      {},
    );
    await expect(generator.generateClient()).rejects.toThrow(
      'Duplicate operationId "getOrder" on GET /orders and GET /archived',
    );
  });
});
