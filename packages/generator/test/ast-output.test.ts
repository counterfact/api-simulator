import { fileURLToPath } from "node:url";

import { describe, expect, it } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";
import { Repository } from "../src/repository.js";
import { ScenarioFileGenerator } from "../src/scenario-file-generator.js";
import { Specification } from "../src/specification.js";
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

  it("compiles the example's schema-accuracy acceptance cases after regeneration", async () => {
    await usingTemporaryFiles(async ($) => {
      const fixture = fileURLToPath(
        new URL(
          "../../counterfact/test/fixtures/openapi/example.yaml",
          import.meta.url,
        ),
      );
      const generate = () =>
        new CodeGenerator(fixture, $.path(""), {
          routes: true,
          types: true,
        }).generate(new Repository());
      await generate();
      await new ScenarioFileGenerator($.path("")).generate();

      // Acceptance 6: preserve an authored handler while regenerating contracts.
      const routePath = "routes/schema-accuracy.ts";
      const authoredRoute = `import type { HTTP_GET } from "../types/paths/schema-accuracy.types.js";
export const GET: HTTP_GET = function ($) {
  // Keep this authored choice when regenerating the example.
  return $.response.status(200).example("valid");
};
`;
      await $.add(routePath, authoredRoute);
      await generate();
      expect(await $.read(routePath)).toBe(authoredRoute);
      const specification = await Specification.fromFile(fixture);
      const example = specification.getRequirement(
        "#/paths/~1schema-accuracy/get/responses/200/content/application~1json/examples/valid/value",
      ).data;
      await $.add(
        "schema-accuracy-consumer.ts",
        `
        import type { SchemaAccuracy } from "./types/components/schemas/SchemaAccuracy.js";
        import type { SchemaAccuracyBase } from "./types/components/schemas/SchemaAccuracyBase.js";
        import type { SchemaAccuracyAnimal } from "./types/components/schemas/SchemaAccuracyAnimal.js";
        import type { HTTP_GET as getReport } from "./types/paths/reports/{reportId}.types.js";
        import type { HTTP_GET as streamEvents } from "./types/paths/stream/events.types.js";

        const example: SchemaAccuracy = ${JSON.stringify(example)};

        // Acceptance 1: nullable is independent of optional.
        const nullable: Pick<SchemaAccuracy, "nullableName"> = {nullableName: null};
        const text: Pick<SchemaAccuracy, "nullableName"> = {nullableName: "name"};
        // @ts-expect-error A nullable required field cannot be omitted.
        const absent: Pick<SchemaAccuracy, "nullableName"> = {};
        // @ts-expect-error A nullable string cannot be a number.
        const wrongNullable: Pick<SchemaAccuracy, "nullableName"> = {nullableName: 1};

        // Acceptance 2 and #2560: sibling and referenced properties survive.
        const shared: SchemaAccuracyBase = {};
        ${["allOfSibling", "anyOfSibling", "oneOfSibling"]
          .map(
            (key) => `
        const ${key}: SchemaAccuracy["${key}"] = {propA: "base", propB: "sibling"};
        // @ts-expect-error The containing required list applies to the referenced propA.
        const ${key}MissingBase: SchemaAccuracy["${key}"] = {propB: "sibling"};
        // @ts-expect-error The sibling property is required too.
        const ${key}MissingSibling: SchemaAccuracy["${key}"] = {propA: "base"};
        // @ts-expect-error The referenced property retains its string type.
        const ${key}WrongBase: SchemaAccuracy["${key}"] = {propA: 1, propB: "sibling"};
        // @ts-expect-error The sibling property retains its string type.
        const ${key}WrongSibling: SchemaAccuracy["${key}"] = {propA: "base", propB: 1};
        `,
          )
          .join("\n")}

        // Acceptance 3: referenced dictionary values and primitive const.
        const dictionary: SchemaAccuracy["dictionary"] = {one: {kind: "entry", label: "example"}};
        // @ts-expect-error Dictionary values must satisfy the referenced model.
        const wrongDictionary: SchemaAccuracy["dictionary"] = {one: "entry"};
        // @ts-expect-error The const value remains a literal constraint.
        const wrongConst: SchemaAccuracy["dictionary"] = {one: {kind: "other", label: "example"}};

        // Acceptance 4: each alias and the remaining branch narrow correctly.
        function inspect(animal: SchemaAccuracyAnimal) {
          if (animal.kind === "cat") {
            const meows: boolean = animal.meows;
            // @ts-expect-error A cat has no barks property.
            animal.barks;
          } else if (animal.kind === "kitten") {
            const meows: boolean = animal.meows;
            // @ts-expect-error A kitten has no barks property.
            animal.barks;
          } else {
            const barks: boolean = animal.barks;
            // @ts-expect-error The remaining branch is Dog.
            animal.meows;
          }
        }

        // Acceptance 5: tuple positions, optional prefixes, and typed tails.
        const closed: SchemaAccuracy["closedTuple"] = [1, "text"];
        // @ts-expect-error Both closed tuple positions are required.
        const short: SchemaAccuracy["closedTuple"] = [1];
        // @ts-expect-error Closed tuples reject additional elements.
        const long: SchemaAccuracy["closedTuple"] = [1, "text", true];
        // @ts-expect-error Tuple element order matters.
        const reversed: SchemaAccuracy["closedTuple"] = ["text", 1];
        const empty: SchemaAccuracy["optionalTuple"] = [];
        const partial: SchemaAccuracy["optionalTuple"] = [1];
        const full: SchemaAccuracy["optionalTuple"] = [1, "text"];
        // @ts-expect-error Optional positions retain their element types.
        const wrongOptional: SchemaAccuracy["optionalTuple"] = ["text"];
        // @ts-expect-error Optional prefixes still have a closed tail.
        const longOptional: SchemaAccuracy["optionalTuple"] = [1, "text", true];
        const prefix: SchemaAccuracy["openTuple"] = [1];
        const open: SchemaAccuracy["openTuple"] = [1, true, false];
        // @ts-expect-error Open tuples still require their first position.
        const noPrefix: SchemaAccuracy["openTuple"] = [];
        // @ts-expect-error Rest elements must be boolean.
        const wrongRest: SchemaAccuracy["openTuple"] = [1, "text"];

        // Acceptance 6: binary responses and streaming remain typed.
        function report($: Parameters<getReport>[0]) {
          $.response.status(200).match("application/pdf", new Uint8Array([1]));
          $.response.status(200).match("application/pdf", "PDF contents");
          // @ts-expect-error Binary responses reject numbers.
          $.response.status(200).match("application/pdf", 1);
        }
        function stream($: Parameters<streamEvents>[0]) {
          async function* entries() {
            yield {timestamp: "2026-10-25T00:00:00Z", level: "INFO" as const, message: "example"};
          }
          $.response.status(200).stream(entries());
          // @ts-expect-error Stream items must satisfy LogEntry.
          $.response.status(200).stream((async function* () { yield "wrong"; })());
        }
      `,
      );
      expect(
        diagnostics([
          $.path("schema-accuracy-consumer.ts"),
          $.path(routePath),
          $.path("routes/stream/events.ts"),
          $.path("routes/uploads.ts"),
          $.path("routes/reports/{reportId}.ts"),
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
