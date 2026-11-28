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
        openapi: "3.2.0",
        info: { title: "Orders", version: "1" },
        security: [{ userToken: ["orders:read"] }],
        paths: {
          "/search": {
            parameters: [
              {
                in: "querystring",
                name: "filters",
                required: true,
                content: {
                  "application/x-www-form-urlencoded": {
                    schema: {
                      type: "object",
                      required: ["term"],
                      properties: {
                        term: string,
                        tags: { type: "array", items: string },
                      },
                    },
                    encoding: { tags: { explode: false } },
                  },
                },
              },
            ],
            get: {
              responses: {
                200: {
                  description: "Report",
                  content: { "application/pdf": {} },
                },
              },
            },
          },
          "/lookup": {
            get: {
              parameters: [
                {
                  in: "querystring",
                  name: "search",
                  content: json({ type: ["string", "null"] }),
                },
              ],
              responses: { 204: { description: "Found" } },
            },
          },
          "/download": {
            get: {
              operationId: "downloadReport",
              tags: ["reports"],
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
                parameters: [
                  parameter("locale", "query"),
                  parameter("orderId", "query", integer, false),
                ],
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
                parameters: [parameter("body", "query")],
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
    expect(generated).toContain("explode: false");
    expect(generated).toContain("./response-validators.js");
    expect(generated).not.toContain("$defs");
    expect(generated).toContain("downloadReport:");
    expect(generated).toContain('security: [{ userToken: ["orders:read"] }]');
    expect(generated).toContain("security: []");

    await $.add(
      "consumer.ts",
      `
      import { createClient, createSdk } from "./generated/v1/index.js";
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
      const api = createSdk({ baseUrl: "https://example.test" });
      // @ts-expect-error the path parameter must be a number
      await api.tenantId.v1OrdersDetail("acme", "42", { query: { locale: "en" } });
      // @ts-expect-error the required query is missing
      await api.tenantId.v1OrdersDetail("acme", 42);
      const named = await api.tenantId.v1OrdersDetail("acme", 42, { query: { locale: "en" } });
      if (named.matchedStatus === "404") {
        const error: string = named.body.error;
        // @ts-expect-error the error body has no order id
        named.body.id;
      } else {
        const id: number = named.body.id;
      }
      await api.lookup.lookupList();
      await api.lookup.lookupList({ query: null });
      // @ts-expect-error whole-query value is required
      await api.search.searchList();
      await api.search.searchList({ query: { term: "boots" } });
      const namedStream = await api.download.downloadReport.stream({ query: { format: "pdf" } });
      if (namedStream.matchedStatus === "200") {
        const bytes: ReadableStream<Uint8Array> = namedStream.body;
      }
      // @ts-expect-error a JSON-only response cannot be streamed
      api.tenantId.v1OrdersDetail.stream;
      // @ts-expect-error query and payload are separate required inputs
      await api.tenantId.v1OrdersCreate("acme", 42, { query: { body: "summary" } });
      await api.tenantId.v1OrdersCreate("acme", 42, { query: { body: "summary" }, body: { id: 42 } });
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
      const search = route("/search").method("get");
      // @ts-expect-error required whole-query value is missing
      search.send();
      // @ts-expect-error streaming also needs the whole-query value
      search.stream();
      // @ts-expect-error .query() needs the complete value
      search.query({ tags: ["sale"] });
      // @ts-expect-error the Parameter Object's name is not a wrapper
      search.query({ filters: { term: "boots" } });
      await search.query({ term: "boots", tags: ["sale"] }).query({ term: "shoes" }).send();
      await search.query({ term: "boots" }).stream();
      const lookup = route("/lookup").method("get");
      await lookup.send();
      await lookup.query("shoes").send();
      await lookup.query(null).send();
      // @ts-expect-error undefined is not a supplied query value
      lookup.query(undefined);
      // @ts-expect-error the JSON query schema is a string or null
      lookup.query({ search: "shoes" });
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
      // @ts-expect-error routes are selected by path and method
      route.operations();
      // @ts-expect-error a JSON-only route cannot be streamed
      await identified.query({ locale: "en-US" }).stream();
      const update = orders.method("post").path({ orderId: 42 });
      // @ts-expect-error the post body is required
      update.send();
      // @ts-expect-error the payload is typed from the Order schema
      update.body({ id: "42" });
      // @ts-expect-error undefined is not a body
      update.body(undefined);
      await update.query({ body: "summary" }).body({ id: 42 }).send();
      await tenant.segment("customers").method("get").send({ authenticate: false, redirect: "manual", credentials: "omit" });
    `,
    );

    const grouped = new CodeGenerator($.path("api.json"), $.path("grouped"), {
      moduleNameFirstTag: true,
      moduleNameIndex: 2,
    });
    await grouped.generateClient();
    const groupedSource = await $.read("grouped/index.ts");
    expect(groupedSource).toContain("reports: {");
    expect(groupedSource).toContain("orders: {");
    expect(groupedSource).not.toContain("tenantId: {\n");

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
              parameters: [
                parameter("orderId", "path", integer),
                parameter("orderId", "query", integer),
                parameter("orderId", "header", integer),
                parameter("orderId", "cookie", integer),
              ],
              get: {
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
        import { createClient, createSdk } from "./generated/index.js";
        const config = response => ({
          baseUrl: "https://example.test",
          auth: {
            userToken: ({ scopes }) => {
              assert.deepEqual(scopes, ["orders:read"]);
              return "generated-client-token";
            },
          },
          fetch: async (url, init) => {
            assert.equal(url.pathname, "/orders/42");
            assert.equal(url.searchParams.get("orderId"), "42");
            assert.equal(init.headers.get("orderId"), "42");
            assert.equal(init.headers.get("Cookie"), "orderId=42");
            assert.equal(init.headers.get("Authorization"), "Bearer generated-client-token");
            assert.equal(init.redirect, "manual");
            return response;
          },
        });
        const send = response => createClient(config(response))("/orders/{orderId}")
          .method("get")
          .path({ orderId: 42 })
          .query({ orderId: 42 })
          .headers({ orderId: 42 })
          .cookies({ orderId: 42 })
          .send({ authenticate: true, redirect: "manual" });
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
        const sendNamed = response => createSdk(config(response)).orders.ordersDetail(42, {
          query: { orderId: 42 },
          headers: { orderId: 42 },
          cookies: { orderId: 42 },
          authenticate: true,
          redirect: "manual",
        });
        assert.deepEqual((await sendNamed(Response.json(nested))).body, nested);
        assert.equal((await sendNamed(new Response("slow down", { status: 429 }))).matchedStatus, "4XX");
        await assert.rejects(sendNamed(Response.json({ ...nested, id: 0 })), invalid);
        await assert.rejects(createSdk(config(Response.json(nested))).orders.ordersDetail(42), {
          message: "Missing required inputs for OpenAPI operation: get /orders/{orderId}",
        });
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
