import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { usingTemporaryFiles } from "using-temporary-files";
import { validationSchema } from "../../src/server/validation-schema.js";

function document(depth: number) {
  const schemas: Record<string, unknown> = { S0: { type: "string" } };
  for (let index = 1; index <= depth; index++) {
    const child = { $ref: "#/components/schemas/S" + (index - 1) };
    schemas["S" + index] = {
      type: "object",
      properties: { left: { ...child }, right: { ...child } },
    };
  }
  return {
    openapi: "3.0.3",
    info: { title: "Shared schema graph", version: "1" },
    paths: {
      "/probe": {
        post: {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/S" + depth },
              },
            },
          },
          responses: { 200: { description: "OK" } },
        },
      },
    },
    components: { schemas },
  };
}

it("keeps normalized shared subgraphs bounded without changing the source", () => {
  let schema: Record<string, unknown> = { type: "string" };
  for (let index = 0; index < 12; index++)
    schema = { type: "object", properties: { left: schema, right: schema } };
  const normalized = validationSchema(
    schema,
    (base, reference) => new URL(reference, base).href,
  );
  expect(JSON.stringify(normalized).length).toBeLessThan(10000);
  const properties = schema.properties as Record<string, unknown>;
  expect(properties.left).toBe(properties.right);
});

it.each([5, 22])(
  "validates a loaded depth-%i shared graph through public Dispatcher within 256 MB",
  async (depth) => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(document(depth)));
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          "--max-old-space-size=256",
          fileURLToPath(
            new URL("../fixtures/shared-schema.mjs", import.meta.url),
          ),
          $.path("openapi.json"),
          String(depth),
        ],
        { timeout: 15000 },
      );
      expect(stdout).toContain("SHARED_GRAPH_VALIDATED");
    });
  },
  20000,
);
