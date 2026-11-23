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
        paths: {
          "/{tenantId}/v1/orders/{orderId}": {
            $ref: "#/components/pathItems/Orders",
          },
          "/{tenantId}/v1/customers": {
            parameters: [parameter("tenantId", "path")],
            get: { responses: { 204: { description: "No content" } } },
          },
        },
        components: {
          pathItems: {
            Orders: {
              parameters: [
                { $ref: "#/components/parameters/Tenant" },
                parameter("orderId", "path", integer),
                parameter("locale", "query", integer, false),
              ],
              get: {
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
    ]);

    await $.add(
      "consumer.ts",
      `
      import { createClient } from "./generated/v1/index.js";
      const route = createClient({ baseUrl: "https://example.test" });
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
      const update = orders.method("post").path({ orderId: 42 });
      // @ts-expect-error the post body is required
      update.send();
      // @ts-expect-error the payload is typed from the Order schema
      update.body({ id: "42" });
      // @ts-expect-error undefined is not a body
      update.body(undefined);
      await update.body({ id: 42 }).send();
      await tenant.segment("customers").method("get").send();
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
