import { fileURLToPath } from "node:url";

import { describe, expect, it } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";
import { Repository } from "../src/repository.js";
import { ScenarioFileGenerator } from "../src/scenario-file-generator.js";
import { generateVersionsTsContent } from "../src/versions-ts-generator.js";

function diagnostics(paths: string[]): string[] {
  const program = ts.createProgram(paths, {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
}

describe("standalone AST output", () => {
  it("compiles the example contract's quoted literals and nested composition", async () => {
    await usingTemporaryFiles(async ($) => {
      const fixture = fileURLToPath(
        new URL(
          "../../counterfact/test/fixtures/openapi/example.yaml",
          import.meta.url,
        ),
      );
      await new CodeGenerator(fixture, $.path(""), {
        routes: true,
        types: true,
      }).generate(new Repository());
      await new ScenarioFileGenerator($.path("")).generate();
      await $.add(
        "consumer.ts",
        `
        import type { TypeEdgeCases } from "./types/components/schemas/TypeEdgeCases.js";
        const quoted: TypeEdgeCases = { 'display "name"': 'say "hello"', label: "example" };
        const backslash: TypeEdgeCases = { 'display "name"': 'C:\\\\examples\\\\sample', count: 1 };
        const newline: TypeEdgeCases = { 'display "name"': "line\\nbreak", label: "example" };
        // @ts-expect-error The quoted property is required on the label branch.
        const missingOnLabel: TypeEdgeCases = { label: "example" };
        // @ts-expect-error The quoted property is required on the count branch.
        const missingOnCount: TypeEdgeCases = { count: 1 };
        // @ts-expect-error A union branch is required as well as the quoted property.
        const missingBranch: TypeEdgeCases = { 'display "name"': 'say "hello"' };
        // @ts-expect-error Only the declared enum literals are accepted.
        const invalidEnum: TypeEdgeCases = { 'display "name"': "other", label: "example" };
      `,
      );
      expect(
        diagnostics([
          $.path("consumer.ts"),
          $.path("routes/type-edge-cases.ts"),
        ]),
      ).toEqual([]);
    });
  });

  it("preserves version ordering, escaping, and minVersion narrowing", async () => {
    await usingTemporaryFiles(async ($) => {
      const odd = 'v"3\\\n';
      await $.add(
        "versions.ts",
        await generateVersionsTsContent(["v1", "v2", odd]),
      );
      await $.add(
        "consumer.ts",
        `
        import type { Versioned, Versions, VersionsGTE } from "./versions.js";
        const escaped: Versions = ${JSON.stringify(odd)};
        const newer: VersionsGTE["v2"] = ${JSON.stringify(odd)};
        // @ts-expect-error v1 is older than v2.
        const older: VersionsGTE["v2"] = "v1";
        type Arg = Versioned<{ v1: { body: { name: string } }; v2: { body: { name: string; extra: number } } }>;
        function handler($: Arg) {
          // @ts-expect-error extra is not available in every version.
          const unavailable: number = $.body.extra;
          if ($.minVersion("v2")) {
            const available: number = $.body.extra;
            const version: "v2" = $.version;
          }
        }
      `,
      );
      expect(diagnostics([$.path("consumer.ts")])).toEqual([]);
    });
  });

  it("compiles context overloads, middleware, and starter scenarios for unusual paths", async () => {
    await usingTemporaryFiles(async ($) => {
      const paths = new Map([
        ["foo-bar", "dash"],
        ["foo_bar", "underscore"],
        ["123", "numeric"],
        ["weird`/${literal}", "odd"],
        ["pets/{id}", "parameterized"],
      ]);
      await new Repository().copyCoreFiles($.path(""));
      for (const [path, kind] of paths) {
        await $.add(
          "routes/" + path + "/_.context.ts",
          `export class Context { readonly kind = ${JSON.stringify(kind)} as const; }`,
        );
      }
      await new ScenarioFileGenerator($.path("")).generate();
      await $.add(
        "consumer.ts",
        `
        import type { Scenario$ } from "./types/_.context.js";
        function inspect($: Scenario$) {
          const dashed: "dash" = $.loadContext("/foo-bar").kind;
          const underscored: "underscore" = $.loadContext("/foo_bar").kind;
          const numeric: "numeric" = $.loadContext("/123").kind;
          const odd: "odd" = $.loadContext(${JSON.stringify("/weird`/${literal}")}).kind;
          const parameterized: "parameterized" = $.loadContext("/pets/42").kind;
        }
      `,
      );
      expect(
        diagnostics([
          $.path("consumer.ts"),
          $.path("scenarios/index.ts"),
          ...[...paths.keys()].map((path) =>
            $.path("types/" + path + "/_.middleware.ts"),
          ),
        ]),
      ).toEqual([]);
    });
  });
});
