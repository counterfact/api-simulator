import { describe, expect, it } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { Repository } from "../src/repository.js";
import { Requirement } from "../src/requirement.js";
import { SchemaTypeCoder } from "../src/schema-type-coder.js";
import { CodeGenerator } from "../src/code-generator.js";
import { ScenarioFileGenerator } from "../src/scenario-file-generator.js";
import { typeDiagnostics } from "./type-diagnostics.js";

async function generate(schema: Record<string, unknown>): Promise<string> {
  const script = new Repository().get("types/example.ts");
  script.exportType(new SchemaTypeCoder(new Requirement(schema, "#/Example")));
  return script.contents();
}

describe("schema type accuracy", () => {
  it.each([{ type: "string", nullable: true }, { type: ["string", "null"] }])(
    "accepts null without making a required property optional: %j",
    async (property) => {
      const source = await generate({
        type: "object",
        required: ["name"],
        properties: { name: property },
      });
      expect(
        typeDiagnostics(`${source}
      const valid: Example = {name: null};
      const text: Example = {name: "name"};
      // @ts-expect-error Nullable does not mean optional.
      const absent: Example = {};
      // @ts-expect-error Nullable string is not a number.
      const wrong: Example = {name: 1};
    `),
      ).toEqual([]);
    },
  );

  it.each(["cat", -2, true, null])(
    "preserves the const literal %j",
    async (value) => {
      const source = await generate({ const: value });
      expect(
        typeDiagnostics(`${source}
      const valid: Example = ${JSON.stringify(value)};
      // @ts-expect-error Only the declared constant is allowed.
      const wrong: Example = "other";
    `),
      ).toEqual([]);
    },
  );

  it("infers object properties and preserves outer required fields across composition", async () => {
    const source = await generate({
      required: ["id", "name"],
      properties: { id: { type: "string" } },
      allOf: [
        {
          properties: {
            name: { type: "string" },
            optional: { type: "boolean" },
          },
        },
      ],
    });
    expect(
      typeDiagnostics(`${source}
      const valid: Example = {id: "id", name: "name"};
      // @ts-expect-error The outer id property must survive composition.
      const missingId: Example = {name: "name"};
      // @ts-expect-error The outer required list applies inside allOf.
      const missingName: Example = {id: "id"};
      // @ts-expect-error Required name retains its type.
      const wrongName: Example = {id: "id", name: 1};
    `),
    ).toEqual([]);
  });

  it("preserves explicit enum constraints when nullable is present", async () => {
    const source = await generate({
      type: "string",
      nullable: true,
      enum: ["cat"],
    });
    expect(
      typeDiagnostics(`${source}
      const valid: Example = "cat";
      // @ts-expect-error Null must also satisfy enum.
      const wrong: Example = null;
    `),
    ).toEqual([]);
  });

  it("keeps non-object branches when applying containing required constraints", async () => {
    const source = await generate({
      required: ["name"],
      anyOf: [{ type: "string" }, { properties: { name: { type: "string" } } }],
    });
    expect(
      typeDiagnostics(`${source}
      const scalar: Example = "text";
      const object: Example = {name: "name"};
      // @ts-expect-error The object branch must contain name.
      const absent: Example = {};
    `),
    ).toEqual([]);
  });

  it("retains safe defaults and JSON byte strings", async () => {
    const source = await generate({
      type: "object",
      additionalProperties: true,
      properties: { bytes: { type: "string", format: "byte" } },
    });
    expect(source).toContain("bytes?: string");
    expect(source).toContain("[key: string]: unknown");
    expect(
      typeDiagnostics(`${source}
      declare const value: Example;
      // @ts-expect-error Undeclared dictionary values require narrowing.
      const unchecked: string = value.other;
    `),
    ).toEqual([]);
  });

  it("generates referenced models that accept valid values and reject invalid ones", async () => {
    await usingTemporaryFiles(async ($) => {
      const schemas = {
        Cat: {
          type: "object",
          required: ["kind", "meows"],
          properties: { kind: { type: "string" }, meows: { type: "boolean" } },
        },
        Dog: {
          type: "object",
          required: ["kind", "barks"],
          properties: { kind: { type: "string" }, barks: { type: "boolean" } },
        },
        Animal: {
          oneOf: [
            { $ref: "#/components/schemas/Cat" },
            { $ref: "#/components/schemas/Dog" },
          ],
          discriminator: {
            propertyName: "kind",
            mapping: {
              cat: "#/components/schemas/Cat",
              kitten: "#/components/schemas/Cat",
              dog: "#/components/schemas/Dog",
            },
          },
        },
        Cats: {
          type: "object",
          additionalProperties: { $ref: "#/components/schemas/Cat" },
        },
        Named: {
          properties: {
            name: { type: "string" },
            optional: { type: "number" },
          },
        },
        RequiredName: {
          required: ["name"],
          allOf: [{ $ref: "#/components/schemas/Named" }],
        },
        NamedUnion: {
          anyOf: [
            { $ref: "#/components/schemas/Named" },
            { type: "object", properties: { name: { type: "number" } } },
            { type: "string" },
          ],
        },
        RequiredUnion: {
          required: ["name"],
          allOf: [{ $ref: "#/components/schemas/NamedUnion" }],
        },
        Fixed: {
          type: "object",
          required: ["kind"],
          properties: { kind: { type: "string", const: "cat" } },
        },
        Tuple: {
          type: "array",
          prefixItems: [{ type: "number" }, { type: "string" }],
          items: false,
          minItems: 2,
          maxItems: 2,
        },
        OptionalTuple: {
          type: "array",
          prefixItems: [{ type: "number" }, { type: "string" }],
          items: false,
        },
        OpenTuple: {
          type: "array",
          prefixItems: [{ type: "number" }],
          minItems: 1,
          items: { type: "boolean" },
        },
      };
      await $.add(
        "openapi.json",
        JSON.stringify({
          openapi: "3.1.0",
          info: { title: "Schema accuracy", version: "1.0" },
          components: { schemas },
          paths: Object.fromEntries(
            Object.keys(schemas).map((name) => [
              `/${name}`,
              {
                get: {
                  responses: {
                    200: {
                      description: "OK",
                      content: {
                        "application/json": {
                          schema: { $ref: `#/components/schemas/${name}` },
                        },
                      },
                    },
                  },
                },
              },
            ]),
          ),
        }),
      );
      const repository = new Repository();
      await new CodeGenerator($.path("openapi.json"), $.path(""), {
        routes: true,
        types: true,
      }).generate(repository);
      await new ScenarioFileGenerator($.path("")).generate();
      const models = Object.fromEntries(
        await Promise.all(
          [...repository.scripts]
            .filter(([path]) => path.startsWith("types/components/schemas/"))
            .map(async ([path, script]) => [path, await script.contents()]),
        ),
      );
      expect(models).toMatchSnapshot();
      await $.add(
        "consumer.ts",
        `
        ${Object.keys(schemas)
          .map(
            (name) =>
              `import type { ${name} } from "./types/components/schemas/${name}.js";`,
          )
          .join("\n")}
        const cat: Cat = {kind: "cat", meows: true};
        const cats: Cats = {one: cat};
        const meows: boolean = cats.one.meows;
        // @ts-expect-error Dictionary values must satisfy Cat.
        const badCats: Cats = {one: "cat"};
        const fixed: Fixed = {kind: "cat"};
        // @ts-expect-error Const is a literal constraint.
        const badFixed: Fixed = {kind: "dog"};
        const named: RequiredName = {name: "name"};
        const optional: Named = {};
        // @ts-expect-error RequiredName does not change Named's shared definition.
        const missing: RequiredName = {};
        // @ts-expect-error RequiredName retains the referenced property type.
        const wrong: RequiredName = {name: 1};
        const text: RequiredUnion = {name: "name"};
        const numeric: RequiredUnion = {name: 1};
        const scalar: RequiredUnion = "text";
        // @ts-expect-error Required properties distribute over referenced unions.
        const missingUnion: RequiredUnion = {};
        const tuple: Tuple = [1, "text"];
        // @ts-expect-error Tuple elements retain their positions.
        const wrongTuple: Tuple = ["text", 1];
        // @ts-expect-error A closed tuple does not allow extra elements.
        const longTuple: Tuple = [1, "text", true];
        // @ts-expect-error minItems requires both elements.
        const shortTuple: Tuple = [1];
        const empty: OptionalTuple = [];
        const partial: OptionalTuple = [1];
        const open: OpenTuple = [1, true, false];
        // @ts-expect-error Rest elements retain their declared type.
        const wrongRest: OpenTuple = [1, "text"];
        function inspect(animal: Animal) {
          if (animal.kind === "cat" || animal.kind === "kitten") {
            const meows: boolean = animal.meows;
            // @ts-expect-error The discriminator rules out Dog.
            animal.barks;
          } else {
            const barks: boolean = animal.barks;
          }
        }
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
});
