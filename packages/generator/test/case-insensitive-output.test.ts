import { usingTemporaryFiles } from "using-temporary-files";
import ts from "typescript";

import { CodeGenerator } from "../src/code-generator.js";

const SPEC = [
  "openapi: 3.0.3",
  "info: { title: Case, version: 1.0.0 }",
  "paths:",
  "  /Companies/list:",
  "    get:",
  "      responses:",
  "        '200':",
  "          description: ok",
  "          content:",
  "            application/json:",
  "              schema: { $ref: '#/components/schemas/OutputType' }",
  "  /Companies/summary:",
  "    get:",
  "      responses:",
  "        '200': { description: ok }",
  "  /companies/{id}:",
  "    get:",
  "      parameters:",
  "        - { name: id, in: path, required: true, schema: { type: string } }",
  "      responses:",
  "        '200':",
  "          description: ok",
  "          content:",
  "            application/json:",
  "              schema: { $ref: '#/components/schemas/OutPutType' }",
  "components:",
  "  schemas:",
  "    OutputType:",
  "      type: object",
  "      required: [first]",
  "      properties:",
  "        first: { type: string }",
  "    OutPutType:",
  "      type: object",
  "      required: [second]",
  "      properties:",
  "        second: { type: number }",
].join("\n");

function diagnostics(files: string[]): string[] {
  const program = ts.createProgram(files, {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    forceConsistentCasingInFileNames: true,
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

function lowerCaseDuplicates(paths: readonly string[]): string[] {
  const seen = new Set<string>();

  return paths.filter((path) => {
    const key = path.toLowerCase();
    const duplicate = seen.has(key);

    seen.add(key);
    return duplicate;
  });
}

describe("generated types on case-insensitive file systems", () => {
  it("writes distinct schema exports in the first-spelled type file", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.yaml", SPEC);

      await new CodeGenerator($.path("openapi.yaml"), $.path("out"), {
        routes: true,
        types: true,
      }).generate();

      const written = [
        "out/types/components/schemas/OutputType.ts",
        "out/types/paths/Companies/list.types.ts",
        "out/types/paths/Companies/{id}.types.ts",
      ];

      expect(lowerCaseDuplicates(written)).toEqual([]);

      for (const path of written) {
        await expect($.read(path)).resolves.toBeDefined();
      }

      const models = await $.read("out/types/components/schemas/OutputType.ts");
      expect(models).toContain("export type OutputType");
      expect(models).toContain("export type OutPutType");
      expect(models).toContain("first");
      expect(models).toContain("second");
      expect(await $.read("out/types/paths/Companies/list.types.ts")).toContain(
        'from "../../components/schemas/OutputType.js"',
      );
      expect(await $.read("out/types/paths/Companies/{id}.types.ts")).toContain(
        'from "../../components/schemas/OutputType.js"',
      );
    });
  });

  it("writes routes and types that compile with consistent casing", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.yaml", SPEC);

      await new CodeGenerator($.path("openapi.yaml"), $.path("out"), {
        routes: true,
        types: true,
      }).generate();

      expect(
        diagnostics([
          $.path("out/routes/Companies/list.ts"),
          $.path("out/routes/Companies/summary.ts"),
          $.path("out/routes/Companies/{id}.ts"),
          $.path("out/types/helpers.ts"),
        ]),
      ).toEqual([]);

      // The canonical route directory must not introduce duplicate
      // case-insensitive middleware type imports.
      const helpers = await $.read("out/types/helpers.ts");
      const imports = [...helpers.matchAll(/from "(?<path>[^"]+)"/gu)].map(
        (match) => match.groups!.path!,
      );

      expect(lowerCaseDuplicates(imports)).toEqual([]);
    });
  });

  it("prunes the old name of a file that becomes a case-insensitive twin", async () => {
    await usingTemporaryFiles(async ($) => {
      const schemas = (...lines: string[]) =>
        [
          "openapi: 3.0.3",
          "info: { title: Prune, version: 1.0.0 }",
          "paths: {}",
          "components:",
          "  schemas:",
          ...lines,
        ].join("\n");
      const lower =
        "    a: { type: object, properties: { lower: { type: string } } }";
      const upper =
        "    A: { type: object, properties: { upper: { type: string } } }";
      const generate = () =>
        new CodeGenerator($.path("openapi.yaml"), $.path("out"), {
          prune: true,
          routes: false,
          types: true,
        }).generate();
      const schemaFile = (name: string) =>
        $.read(`out/types/components/schemas/${name}`).catch(() => "");

      await $.add("openapi.yaml", schemas(lower));
      await generate();
      expect(await schemaFile("a.ts")).toContain("lower");

      await $.add("openapi.yaml", schemas(lower, upper));
      await generate();
      expect(await schemaFile("a.ts")).toContain("lower");
      expect(await schemaFile("a.ts")).toContain("upper");

      await generate();
      expect(await schemaFile("a.ts")).toContain("lower");
      expect(await schemaFile("a.ts")).toContain("upper");
    });
  });

  it("writes schemas alone to case-safe paths", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.yaml", SPEC);

      const written = await new CodeGenerator(
        $.path("openapi.yaml"),
        $.path("out"),
        {},
      ).generateSchemas();

      expect([...written].sort()).toEqual(["OutputType.ts"]);
      expect(await $.read("out/OutputType.ts")).toContain("first");
    });
  });
});
