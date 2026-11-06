import { describe, expect, it } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import {
  heyApiTransform,
  nswagTransform,
  openapiGeneratorTransform,
  openapiTypescriptCodegenTransform,
  openapiTypescriptTransform,
  orvalTransform,
  swaggerTypescriptApiTransform,
  Repository,
} from "../src/index.js";
import { Requirement } from "../src/requirement.js";
import { SchemaTypeCoder } from "../src/schema-type-coder.js";
import { Specification } from "../src/specification.js";
import type { SchemaTypeTransform } from "../src/schema-type-transform.js";

async function model(path: string, transform: SchemaTypeTransform) {
  const script = new Repository({ schemaTypeTransform: transform }).get(
    "model.ts",
  );
  script.exportType(
    new SchemaTypeCoder(new Requirement({ type: "string" }, path)),
  );
  return script.contents();
}

const namedAdapters = [
  heyApiTransform,
  nswagTransform,
  orvalTransform,
  openapiGeneratorTransform,
  swaggerTypescriptApiTransform,
  openapiTypescriptCodegenTransform,
];

describe("generated model adapters", () => {
  it.each([openapiTypescriptTransform, ...namedAdapters])(
    "%p reuses external recursive models and compiles a consumer",
    async (adapter) => {
      await usingTemporaryFiles(async ($) => {
        const indexed = adapter === openapiTypescriptTransform;
        const repository = new Repository({
          schemaTypeTransform: adapter({ moduleSpecifier: "@example/models" }),
        });
        const spec = new Specification(
          new Requirement({
            components: {
              schemas: {
                Pet: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    next: { $ref: "#/components/schemas/Pet" },
                  },
                },
              },
            },
          }),
        );
        spec.rootRequirement.url = "https://example.test/spec/openapi.yaml";
        spec.rootRequirement.specification = spec;
        repository.get("root.ts").exportType(
          new SchemaTypeCoder(
            new Requirement(
              {
                type: "object",
                required: ["pet"],
                properties: { pet: { $ref: "#/components/schemas/Pet" } },
              },
              "#/Root",
              spec,
            ),
          ),
        );
        await repository.finished();
        for (const [path, script] of repository.scripts)
          await $.add(path, await script.contents());
        await $.add(
          "models.d.ts",
          `declare module "@example/models" {
          ${indexed ? "export interface components { schemas: { Pet: ExternalPet } }" : "export type Pet = ExternalPet;"}
          interface ExternalPet { external: true; next?: ExternalPet }
        }`,
        );
        await $.add(
          "consumer.ts",
          `import type { Root } from "./root.js";
          export const valid: Root = { pet: { external: true, next: { external: true } } };
          // @ts-expect-error External model, rather than Counterfact's structural default.
          export const invalid: Root = { pet: { name: "Buddy" } };
        `,
        );
        const program = ts.createProgram(
          [$.path("consumer.ts"), $.path("models.d.ts")],
          {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            types: [],
            module: ts.ModuleKind.NodeNext,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            target: ts.ScriptTarget.ES2022,
          },
        );
        expect(
          ts
            .getPreEmitDiagnostics(program)
            .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")),
        ).toEqual([]);
      });
    },
  );

  it("indexes escaped schema keys without guessing exported identifiers", async () => {
    const source = await model(
      "#/components/schemas/a~1b~0c",
      openapiTypescriptTransform({ moduleSpecifier: "@example/models" }),
    );
    expect(source).toContain('["schemas"]["a/b~c"]');
  });

  it.each(namedAdapters)(
    "%p supports renamed models and file-per-model layouts",
    async (adapter) => {
      const source = await model(
        "#/definitions/pet-record",
        adapter({
          moduleSpecifier: (name) => `@example/models/${name}`,
          typeName: (name) => (name === "pet-record" ? "PetRecord" : undefined),
        }),
      );
      expect(source).toContain('from "@example/models/pet-record"');
      expect(source).toContain("PetRecord");
    },
  );

  it.each([openapiTypescriptTransform, ...namedAdapters])(
    "%p leaves inline schemas and nested properties alone",
    async (adapter) => {
      const transform = adapter({ moduleSpecifier: "@example/models" });
      for (const path of [
        "#/paths/~1pet/get/responses/200/content/application~1json/schema",
        "#/components/schemas/Pet/properties/name",
        "#/components/parameters/Pet/schema",
      ]) {
        const source = await model(path, transform);
        expect(source).not.toContain("@example/models");
        expect(source).toContain("string");
      }
    },
  );

  it("can exclude schemas that are not exported by the external generator", async () => {
    const source = await model(
      "#/components/schemas/Pet",
      heyApiTransform({
        moduleSpecifier: "@example/models",
        typeName: () => undefined,
      }),
    );
    expect(source).not.toContain("@example/models");
  });

  it("does not apply the OpenAPI 3 indexed layout to Swagger 2 definitions", async () => {
    expect(
      await model(
        "#/definitions/Pet",
        openapiTypescriptTransform({ moduleSpecifier: "@example/models" }),
      ),
    ).not.toContain("@example/models");
  });

  it("reports invalid exported names with the schema location", async () => {
    await expect(
      model(
        "#/components/schemas/pet-record",
        heyApiTransform({ moduleSpecifier: "@example/models" }),
      ),
    ).rejects.toThrow(
      "Schema type transform failed at #/components/schemas/pet-record",
    );
  });

  it("requires a nonempty import module", () => {
    expect(() => orvalTransform({ moduleSpecifier: " " })).toThrow(
      "moduleSpecifier",
    );
  });
});
