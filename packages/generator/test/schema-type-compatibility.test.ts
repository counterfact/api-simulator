import { describe, expect, it } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import {
  CodeGenerator,
  Repository,
  schemaTypeCompatibility,
  type SchemaTypeCompatibilityTarget,
  type SchemaTypeCompatibilityOptions,
} from "../src/index.js";
import { Requirement } from "../src/requirement.js";
import { SchemaTypeCoder } from "../src/schema-type-coder.js";

const targets: SchemaTypeCompatibilityTarget[] = [
  "openapi-typescript",
  "hey-api",
  "orval",
  "openapi-generator-fetch",
  "openapi-generator-axios",
  "swagger-typescript-api",
  "openapi-typescript-codegen",
  "nswag",
];

async function model(
  schema: Record<string, unknown> | boolean,
  target: SchemaTypeCompatibilityTarget,
  options: SchemaTypeCompatibilityOptions = {},
  path = "#/Model",
) {
  const script = new Repository({
    schemaTypeTransform: schemaTypeCompatibility(target, options),
  }).get("model.ts");
  script.exportType(new SchemaTypeCoder(new Requirement(schema, path)));
  return script.contents();
}

async function compile(source: string) {
  let diagnostics: string[] = [];
  await usingTemporaryFiles(async ($) => {
    await $.add("consumer.ts", source);
    const program = ts.createProgram([$.path("consumer.ts")], {
      noEmit: true,
      strict: true,
      exactOptionalPropertyTypes: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      types: [],
    });
    diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  });
  return diagnostics;
}

// Cross-tool compatibility is exercised by test/compatibility/run.mjs using real generators.
describe("schema type compatibility", () => {
  it.each(targets)(
    "%s preserves boolean schemas and literal format constraints",
    async (target) => {
      expect(await model(true, target)).toContain("unknown");
      expect(await model(false, target)).toContain("never");
      expect(
        await model(
          { type: "string", format: "date", enum: ["2026-01-01", null] },
          target,
        ),
      ).toContain('"2026-01-01" | null');
      expect(
        await model(
          { type: "string", format: "binary", const: "literal" },
          target,
        ),
      ).toContain('"literal"');
    },
  );

  it("preserves non-string union arms while mapping nullable binary and dates", async () => {
    const binary = await model(
      { type: ["string", "number", "null"], format: "binary" },
      "orval",
    );
    expect(binary).toContain("globalThis.Blob | number | null");
    const dates = await model(
      { type: ["string", "boolean", "null"], format: "date" },
      "nswag",
    );
    expect(dates).toContain("globalThis.Date | boolean | null");
  });

  it("supports configured date, file, byte, and readonly conventions", async () => {
    const source = await model(
      {
        type: "object",
        properties: {
          date: { type: "string", format: "date" },
          file: { type: "string", format: "binary" },
          byte: { type: "string", format: "byte" },
        },
      },
      "orval",
      {
        dateType: "Date",
        binaryType: "File",
        byteType: "Blob",
        readonlyProperties: "all",
      },
    );
    expect(source).toContain("readonly date?: globalThis.Date");
    expect(source).toContain("readonly file?: globalThis.File");
    expect(source).toContain("readonly byte?: globalThis.Blob");
  });

  it("enforces read-only flags without making sibling properties read-only", async () => {
    const source = await model(
      {
        type: "object",
        required: ["id", "label"],
        properties: {
          id: { type: "number", readOnly: true },
          label: { type: "string" },
        },
      },
      "hey-api",
    );
    expect(
      await compile(`${source}
      declare const model: Model;
      // @ts-expect-error The schema marks id readOnly.
      model.id = 1;
      model.label = "editable";
    `),
    ).toEqual([]);
    expect(
      await model(
        {
          type: "object",
          properties: { id: { type: "number", readOnly: true } },
        },
        "hey-api",
        { readonlyProperties: "none" },
      ),
    ).not.toContain("readonly");
  });

  it("matches openapi-typescript empty-object and default-property settings", async () => {
    expect(await model({ type: "object" }, "openapi-typescript")).toContain(
      "[key: string]: never",
    );
    expect(
      await model({ type: ["object", "null"] }, "openapi-typescript", {
        emptyObjectType: "unknown-record",
      }),
    ).toContain("[key: string]: unknown");
    const schema = {
      type: "object",
      properties: { value: { type: "string", default: "ready" } },
    };
    expect(await model(schema, "openapi-typescript")).toContain(
      "value: string",
    );
    expect(
      await model(schema, "openapi-typescript", {
        defaultPropertiesRequired: false,
      }),
    ).toContain("value?: string");
    for (const path of [
      "#/paths/~1pet/post/requestBody/content/application~1json/schema",
      "#/components/requestBodies/Pet/content/application~1json/schema",
      "#/paths/~1pet/parameters/0/schema",
    ]) {
      expect(await model(schema, "openapi-typescript", {}, path)).toContain(
        "value?: string",
      );
    }
    expect(
      await model(
        schema,
        "openapi-typescript",
        {},
        "#/components/schemas/requestBody",
      ),
    ).toContain("value: string");
  });

  it("keeps recursive references and parsed multipart values while generating compatible JSON models", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "spec.json",
        JSON.stringify({
          openapi: "3.1.0",
          info: { title: "Compatibility", version: "1" },
          paths: {
            "/upload": {
              post: {
                requestBody: {
                  required: true,
                  content: {
                    "multipart/form-data": {
                      schema: { $ref: "#/components/schemas/Upload" },
                    },
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Upload" },
                    },
                  },
                },
                responses: { "204": { description: "Done" } },
              },
            },
          },
          components: {
            schemas: {
              Upload: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary", nullable: true },
                  next: { $ref: "#/components/schemas/Upload" },
                },
              },
            },
          },
        }),
      );
      await new CodeGenerator($.path("spec.json"), $.path("api"), {
        routes: false,
        types: true,
        schemaTypeTransform: schemaTypeCompatibility("hey-api"),
      }).generate();
      const json = await $.read("api/types/components/schemas/Upload.ts");
      const multipart = await $.read(
        "api/types/multipart/components/schemas/Upload.ts",
      );
      expect(json).toContain("globalThis.Blob | globalThis.File");
      expect(json).toContain("next?: Upload");
      expect(multipart).toContain("MultipartFile");
      expect(multipart).not.toContain("globalThis.Blob");
      expect(multipart).toContain("null");
    });
  });

  it("qualifies built-in names against generated Date and Blob models", async () => {
    const source = await model(
      {
        type: "object",
        properties: {
          date: { type: "string", format: "date" },
          blob: { type: "string", format: "binary" },
        },
      },
      "openapi-generator-fetch",
    );
    expect(
      await compile(
        `${source}\ntype Date = "local-date"; type Blob = "local-blob";\ndeclare const value: Model; export const date: globalThis.Date | undefined = value.date; export const blob: globalThis.Blob | undefined = value.blob;`,
      ),
    ).toEqual([]);
  });

  it("preserves composition and recursively transforms its schemas", async () => {
    const source = await model(
      {
        allOf: [
          {
            type: "object",
            required: ["date"],
            properties: { date: { type: "string", format: "date" } },
          },
          {
            type: "object",
            required: ["file"],
            properties: { file: { type: "string", format: "binary" } },
          },
        ],
      },
      "openapi-generator-fetch",
    );
    expect(
      await compile(`${source}
      type Other = { date: globalThis.Date } & { file: globalThis.Blob };
      declare const ours: Model; declare const other: Other;
      export const toOther: Other = ours; export const toOurs: Model = other;
    `),
    ).toEqual([]);
  });

  it("does not duplicate binary arms in nullable schemas", async () => {
    const source = await model(
      { type: "string", format: "binary", nullable: true },
      "orval",
    );
    expect(source).toContain("globalThis.Blob | null");
    expect(source.match(/globalThis.Blob/gu)).toHaveLength(1);
  });

  it("rejects invalid targets from JavaScript configuration modules", () => {
    // @ts-expect-error Exercise runtime validation for JavaScript users.
    expect(() => schemaTypeCompatibility("unknown-generator")).toThrow(
      "Unknown schema type compatibility target",
    );
  });
});
