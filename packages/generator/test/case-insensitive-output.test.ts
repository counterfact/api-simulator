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
  it("writes each type file to a path that differs by more than case", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.yaml", SPEC);

      await new CodeGenerator($.path("openapi.yaml"), $.path("out"), {
        routes: true,
        types: true,
      }).generate();

      const written = [
        "out/types/components/schemas/OutPutType.ts",
        "out/types/components/schemas/OutputType_2.ts",
        "out/types/paths/Companies/list.types.ts",
        "out/types/paths/Companies/{id}.types.ts",
      ];

      expect(lowerCaseDuplicates(written)).toEqual([]);

      for (const path of written) {
        await expect($.read(path)).resolves.toBeDefined();
      }

      expect(
        await $.read("out/types/components/schemas/OutPutType.ts"),
      ).toContain("second");
      expect(
        await $.read("out/types/components/schemas/OutputType_2.ts"),
      ).toContain("first");
      expect(await $.read("out/types/paths/Companies/list.types.ts")).toContain(
        'from "../../components/schemas/OutputType_2.js"',
      );
      expect(await $.read("out/types/paths/Companies/{id}.types.ts")).toContain(
        'from "../../components/schemas/OutPutType.js"',
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
          $.path("out/routes/companies/{id}.ts"),
        ]),
      ).toEqual([]);
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

      expect([...written].sort()).toEqual(["OutPutType.ts", "OutputType_2.ts"]);
      expect(await $.read("out/OutputType_2.ts")).toContain("first");
    });
  });
});
