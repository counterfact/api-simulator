import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { CodeGenerator } from "@counterfact/generator";
import ts from "typescript";

const directory = await mkdtemp(
  path.join(tmpdir(), "counterfact-schema-types-"),
);
try {
  const input = path.join(directory, "openapi.json");
  const output = path.join(directory, "api");
  await writeFile(
    input,
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Custom schema types", version: "1" },
      paths: {
        "/id": {
          get: {
            responses: {
              200: {
                description: "Identifier",
                content: {
                  "application/json": {
                    schema: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
        },
      },
    }),
  );
  /** @type {import("@counterfact/generator").SchemaTypeTransform} */
  const schemaTypeTransform = (schema, defaultType, script) => {
    if (typeof schema === "object" && schema.format === "uuid") {
      const brand = script.importType("@example/domain", "UUIDBrand");
      return ts.factory.createIntersectionTypeNode([defaultType, brand]);
    }
    return defaultType;
  };
  await new CodeGenerator(input, output, {
    routes: true,
    types: true,
    schemaTypeTransform,
  }).generate();
  const generated = await readFile(
    path.join(output, "types/paths/id.types.ts"),
    "utf8",
  );
  assert.match(generated, /UUIDBrand/u);
  assert.match(generated, /@example\/domain/u);
} finally {
  await rm(directory, { recursive: true, force: true });
}
