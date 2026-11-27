import { usingTemporaryFiles } from "using-temporary-files";
import ts from "typescript";

import { CodeGenerator } from "../src/code-generator.js";

const SPEC = [
  "openapi: 3.0.3",
  "info: { title: Schemas, version: 1.0.0 }",
  "paths:",
  "  /pets:",
  "    get:",
  "      operationId: listPets",
  "      parameters:",
  "        - $ref: '#/components/parameters/Limit'",
  "      responses:",
  "        '200': { $ref: '#/components/responses/Pets' }",
  "components:",
  "  parameters:",
  "    Limit: { name: limit, in: query, schema: { type: integer } }",
  "  responses:",
  "    Pets:",
  "      description: ok",
  "      content:",
  "        application/json:",
  "          schema:",
  "            type: array",
  "            items: { $ref: '#/components/schemas/Pet' }",
  "  schemas:",
  "    Pet:",
  "      type: object",
  "      required: [id]",
  "      properties:",
  "        id: { type: string }",
  "        owner: { $ref: '#/components/schemas/Owner' }",
  "    Owner:",
  "      type: object",
  "      properties:",
  "        name: { type: string }",
].join("\n");

function versionedSpec(petProperty: string): string {
  return [
    "openapi: 3.0.3",
    "info: { title: Versioned, version: 1.0.0 }",
    "paths: {}",
    "components:",
    "  schemas:",
    "    Pet:",
    "      type: object",
    "      required: [id]",
    "      properties:",
    "        id: { type: string }",
    `        ${petProperty}: { $ref: '#/components/schemas/Owner' }`,
    "    Owner:",
    "      type: object",
    "      properties:",
    "        name: { type: string }",
  ].join("\n");
}

function diagnostics(files: string[]): string[] {
  const program = ts.createProgram(files, {
    strict: true,
    noEmit: true,
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

describe("CodeGenerator.generateSchemas", () => {
  it("writes only the schemas, directly into the destination", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.yaml", SPEC);

      const written = await new CodeGenerator(
        $.path("openapi.yaml"),
        $.path("out"),
        {},
      ).generateSchemas();

      expect([...written].sort()).toEqual(["Owner.ts", "Pet.ts"]);
      expect(await $.read("out/Pet.ts")).toContain('from "./Owner.js"');

      for (const unexpected of [
        "out/.gitignore",
        "out/.cache/README.md",
        "out/types/index.ts",
        "out/types/components/parameters/Limit.ts",
        "out/types/components/schemas/Pet.ts",
        "out/counterfact-types/index.ts",
        "out/routes/_.context.ts",
        "out/index.ts",
      ]) {
        await expect($.read(unexpected)).rejects.toThrow();
      }
    });
  });

  it("writes the same contents as generating types", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.yaml", SPEC);

      await new CodeGenerator($.path("openapi.yaml"), $.path("full"), {
        types: true,
      }).generate();
      await new CodeGenerator(
        $.path("openapi.yaml"),
        $.path("out"),
        {},
      ).generateSchemas();

      for (const name of ["Pet", "Owner"]) {
        expect(await $.read(`out/${name}.ts`)).toBe(
          await $.read(`full/types/components/schemas/${name}.ts`),
        );
      }
    });
  });

  it("writes schemas that compile on their own", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.yaml", SPEC);

      await new CodeGenerator(
        $.path("openapi.yaml"),
        $.path("out"),
        {},
      ).generateSchemas();

      expect(
        diagnostics([$.path("out/Pet.ts"), $.path("out/Owner.ts")]),
      ).toEqual([]);
    });
  });

  it("writes nothing when the spec has no schemas", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        [
          "openapi: 3.0.3",
          "info: { title: Empty, version: 1.0.0 }",
          "paths: {}",
        ].join("\n"),
      );

      const written = await new CodeGenerator(
        $.path("openapi.yaml"),
        $.path("out"),
        {},
      ).generateSchemas();

      expect(written).toEqual([]);
      await expect($.read("out/types/index.ts")).rejects.toThrow();
    });
  });

  it("writes each version's schemas into its own directory", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("v1.yaml", versionedSpec("owner"));
      await $.add("v2.yaml", versionedSpec("keeper"));

      const first = await new CodeGenerator(
        $.path("v1.yaml"),
        $.path("out"),
        {},
        "v1",
      ).generateSchemas();
      const second = await new CodeGenerator(
        $.path("v2.yaml"),
        $.path("out"),
        {},
        "v2",
      ).generateSchemas();

      expect([...first].sort()).toEqual(["v1/Owner.ts", "v1/Pet.ts"]);
      expect([...second].sort()).toEqual(["v2/Owner.ts", "v2/Pet.ts"]);

      const v1 = await $.read("out/v1/Pet.ts");
      const v2 = await $.read("out/v2/Pet.ts");

      expect(v1).toContain("owner");
      expect(v1).not.toContain("keeper");
      expect(v2).toContain("keeper");
      expect(v1).toContain('from "./Owner.js"');
      expect(v1).not.toContain("../");
      expect(v2).not.toContain("../");
      expect(
        diagnostics([
          $.path("out/v1/Pet.ts"),
          $.path("out/v1/Owner.ts"),
          $.path("out/v2/Pet.ts"),
          $.path("out/v2/Owner.ts"),
        ]),
      ).toEqual([]);
    });
  });

  it("rejects Swagger 2.0 documents instead of silently writing nothing", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "swagger.yaml",
        [
          "swagger: '2.0'",
          "info: { title: Legacy, version: '1' }",
          "paths: {}",
          "definitions:",
          "  Pet: { type: object, properties: { id: { type: string } } }",
        ].join("\n"),
      );

      await expect(
        new CodeGenerator(
          $.path("swagger.yaml"),
          $.path("out"),
          {},
        ).generateSchemas(),
      ).rejects.toThrow(/Swagger 2\.0/u);
    });
  });

  it("fails naming the schema when it depends on a non-schema component", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        [
          "openapi: 3.0.3",
          "info: { title: Bad, version: 1.0.0 }",
          "paths: {}",
          "components:",
          "  parameters:",
          "    Limit: { name: limit, in: query, schema: { type: integer } }",
          "  schemas:",
          "    Bad:",
          "      type: object",
          "      properties:",
          "        limit: { $ref: '#/components/parameters/Limit' }",
        ].join("\n"),
      );

      await expect(
        new CodeGenerator(
          $.path("openapi.yaml"),
          $.path("out"),
          {},
        ).generateSchemas(),
      ).rejects.toThrow(/schema "Bad".*not a schema/u);
      await expect($.read("out/Bad.ts")).rejects.toThrow();
    });
  });
});
