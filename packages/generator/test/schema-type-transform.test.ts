import { describe, expect, it } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import {
  CodeGenerator,
  Repository,
  type SchemaTypeTransform,
} from "../src/index.js";
import { Requirement } from "../src/requirement.js";
import { SchemaTypeCoder } from "../src/schema-type-coder.js";
import { Specification } from "../src/specification.js";
import { typeDiagnostics } from "./type-diagnostics.js";

function model(
  schema: Record<string, unknown> | boolean,
  schemaTypeTransform?: SchemaTypeTransform,
) {
  const script = new Repository({ schemaTypeTransform }).get(
    "types/example.ts",
  );
  script.exportType(new SchemaTypeCoder(new Requirement(schema, "#/Example")));
  return script.contents();
}

function specification(schema: unknown) {
  return {
    openapi: "3.1.0",
    info: { title: "Transforms", version: "1" },
    paths: {
      "/items": {
        get: {
          responses: {
            "200": {
              description: "Items",
              content: { "application/json": { schema } },
            },
          },
        },
      },
    },
  };
}

function diagnostics(path: string, extra: string[] = []) {
  const program = ts.createProgram([path, ...extra], {
    strict: true,
    noEmit: true,
    noUnusedLocals: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
}

describe("schema type transforms", () => {
  it("preserves default output when omitted or returning the default", async () => {
    const schema = {
      type: "object",
      required: ["value"],
      properties: {
        value: { type: "string", nullable: true },
        tuple: { type: "array", prefixItems: [{ const: "a" }], items: false },
      },
    };
    expect(await model(schema, (_schema, type) => type)).toBe(
      await model(schema),
    );
  });

  it("transforms children before containers and retains required-field constraints", async () => {
    const visited: unknown[] = [];
    const source = await model(
      {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", nullable: true, "x-brand": "id" },
        },
      },
      (schema, type) => {
        visited.push(schema);
        if (typeof schema === "object" && schema["x-brand"]) {
          return ts.factory.createIntersectionTypeNode([
            type,
            ts.factory.createTypeLiteralNode([
              ts.factory.createPropertySignature(
                undefined,
                "brand",
                undefined,
                ts.factory.createLiteralTypeNode(
                  ts.factory.createStringLiteral("id"),
                ),
              ),
            ]),
          ]);
        }
        return type;
      },
    );
    expect(visited).toHaveLength(2);
    expect(visited[0]).toHaveProperty("x-brand", "id");
    expect(visited[1]).toHaveProperty("type", "object");
    expect(
      typeDiagnostics(`${source}
      declare const id: string & { brand: "id" };
      const valid: Example = { id };
      // @ts-expect-error Branding is enforced.
      const unbranded: Example = { id: "id" };
      // @ts-expect-error Required remains required.
      const missing: Example = {};
    `),
    ).toEqual([]);
  });

  it.each([true, false])(
    "passes boolean schema %j with its default type",
    async (schema) => {
      let received: unknown;
      const source = await model(schema, (input, type) => {
        received = input;
        return type;
      });
      expect(received).toBe(schema);
      expect(source).toContain(schema ? "unknown" : "never");
    },
  );

  it("transforms referenced recursive definitions without expanding reference sites", async () => {
    await usingTemporaryFiles(async ($) => {
      const repository = new Repository({
        schemaTypeTransform: (schema, type) => {
          expect(schema).not.toHaveProperty("$ref");
          if (typeof schema === "object" && schema.format === "uuid")
            return ts.factory.createKeywordTypeNode(
              ts.SyntaxKind.NumberKeyword,
            );
          return type;
        },
      });
      const spec = new Specification(
        new Requirement({
          components: {
            schemas: {
              Node: {
                type: "object",
                required: ["id"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  next: { $ref: "#/components/schemas/Node" },
                },
              },
            },
          },
        }),
      );
      spec.rootRequirement.specification = spec;
      repository
        .get("types/root.ts")
        .exportType(
          new SchemaTypeCoder(
            new Requirement(
              { $ref: "#/components/schemas/Node" },
              "#/Root",
              spec,
            ),
          ),
        );
      await repository.finished();
      for (const [path, script] of repository.scripts)
        await $.add(path, await script.contents());
      await $.add(
        "consumer.ts",
        `import type { Node } from "./types/components/schemas/Node.js";
        export const valid: Node = { id: 1, next: { id: 2 } };
        // @ts-expect-error The shared definition was transformed.
        export const invalid: Node = { id: "id" };
      `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("deduplicates imports, aliases collisions, and compiles generated consumers", async () => {
    await usingTemporaryFiles(async ($) => {
      const source = await model(
        {
          type: "object",
          required: ["a", "b", "c"],
          properties: {
            a: { type: "string", "x-module": "one" },
            b: { type: "string", "x-module": "two" },
            c: { type: "string", "x-module": "one" },
            array: { type: "array", items: { type: "number" } },
          },
        },
        (schema, type, script) =>
          typeof schema === "object" && schema["x-module"]
            ? script.importType(`@domain/${schema["x-module"]}`, "Array")
            : type,
      );
      expect(source.match(/from "@domain\/one"/gu)).toHaveLength(1);
      await $.add("example.ts", source);
      await $.add(
        "domain.d.ts",
        `declare module "@domain/one" { export type Array = "one"; }
        declare module "@domain/two" { export type Array = "two"; }`,
      );
      await $.add(
        "consumer.ts",
        `import type { Example } from "./example.js";
        export const valid: Example = { a: "one", b: "two", c: "one", array: [1] };
        // @ts-expect-error Imports with equal export names stay distinct.
        export const invalid: Example = { a: "two", b: "two", c: "one" };
      `,
      );
      expect(
        diagnostics($.path("consumer.ts"), [$.path("domain.d.ts")]),
      ).toEqual([]);
    });
  });

  it("removes imports discarded by a containing replacement", async () => {
    const source = await model(
      {
        type: "object",
        properties: {
          child: { type: "string" },
        },
      },
      (schema, _type, script) =>
        typeof schema === "object" && schema.type === "object"
          ? ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
          : script.importType("@domain/unused", "Unused"),
    );
    expect(source).not.toContain("@domain/unused");
    expect(typeDiagnostics(`${source} const valid: Example = true;`)).toEqual(
      [],
    );
  });

  it("removes generated imports discarded by a definition replacement", async () => {
    const repository = new Repository({
      schemaTypeTransform: (schema, type) =>
        typeof schema === "object" && schema["x-replace"]
          ? ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
          : type,
    });
    const spec = new Specification(
      new Requirement({
        components: {
          schemas: {
            Child: { type: "string" },
          },
        },
      }),
    );
    spec.rootRequirement.specification = spec;
    const script = repository.get("types/example.ts");
    script.exportType(
      new SchemaTypeCoder(
        new Requirement(
          {
            type: "object",
            "x-replace": true,
            properties: { child: { $ref: "#/components/schemas/Child" } },
          },
          "#/Example",
          spec,
        ),
      ),
    );
    await repository.finished();
    expect(await script.contents()).toBe("export type Example = boolean;\n");
  });

  it("uses the public generator option across regeneration and preserves route edits", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.json",
        JSON.stringify(specification({ type: "string", format: "uuid" })),
      );
      const generator = new CodeGenerator(
        $.path("openapi.json"),
        $.path("api"),
        {
          types: true,
          routes: true,
          schemaTypeTransform: (schema, type, script) =>
            typeof schema === "object" && schema.format === "uuid"
              ? script.importType("@domain/ids", "UUID")
              : type,
        },
      );
      await generator.generate();
      const first = await $.read("api/types/paths/items.types.ts");
      expect(first).toContain("@domain/ids");
      const route = await $.read("api/routes/items.ts");
      await $.add("api/routes/items.ts", `${route}\n// Keep my edits.\n`);
      await generator.generate();
      expect(await $.read("api/types/paths/items.types.ts")).toBe(first);
      expect(await $.read("api/routes/items.ts")).toContain(
        "// Keep my edits.",
      );
      await new CodeGenerator($.path("openapi.json"), $.path("plain"), {
        types: true,
      }).generate();
      expect(await $.read("plain/types/paths/items.types.ts")).not.toContain(
        "@domain/ids",
      );
    });
  });

  it("shares one transform across API versions through a Repository", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.json",
        JSON.stringify(specification({ type: "string", format: "uuid" })),
      );
      const transform: SchemaTypeTransform = (schema, type, script) =>
        typeof schema === "object" && schema.format === "uuid"
          ? script.importType("@domain/ids", "UUID")
          : type;
      const repository = new Repository({ schemaTypeTransform: transform });
      for (const version of ["v1", "v2"]) {
        await $.add(
          `openapi-${version}.json`,
          JSON.stringify(specification({ type: "string", format: "uuid" })),
        );
        await new CodeGenerator(
          $.path(`openapi-${version}.json`),
          $.path("api"),
          { types: true },
          version,
        ).generate(repository);
        expect(
          await $.read(`api/types/${version}/paths/items.types.ts`),
        ).toContain("@domain/ids");
      }
      const combined = await $.read("api/types/paths/items.types.ts");
      expect(combined).toContain("HTTP_GET_$_v1");
      expect(combined).toContain("HTTP_GET_$_v2");
      await expect(
        new CodeGenerator($.path("openapi.json"), $.path("api"), {
          types: true,
          schemaTypeTransform: transform,
        }).generate(new Repository()),
      ).rejects.toThrow("Configure the same schemaTypeTransform");
    });
  });

  it("rejects transform failures before replacing existing generated files", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.json",
        JSON.stringify(specification({ type: "string" })),
      );
      await $.add("api/types/paths/items.types.ts", "existing types");
      const generator = new CodeGenerator(
        $.path("openapi.json"),
        $.path("api"),
        {
          types: true,
          schemaTypeTransform: () => {
            throw new Error("broken customization");
          },
        },
      );
      await expect(generator.generate()).rejects.toThrow(
        /Schema type transform failed at .*broken customization/u,
      );
      expect(await $.read("api/types/paths/items.types.ts")).toBe(
        "existing types",
      );
    });
  });

  it("rejects asynchronous results with an actionable diagnostic", async () => {
    // JavaScript consumers can return a Promise despite the TypeScript signature.
    const transform = (() =>
      Promise.resolve(
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      )) as unknown as SchemaTypeTransform;
    await expect(model({ type: "string" }, transform)).rejects.toThrow(
      "Expected a synchronous TypeNode result",
    );
  });
});
