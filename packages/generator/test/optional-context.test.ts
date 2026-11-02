import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";
import { generateVersionsTsContent } from "../src/versions-ts-generator.js";
import { ScenarioFileGenerator } from "../src/scenario-file-generator.js";

function diagnostics(file: string): string[] {
  const program = ts.createProgram([file], {
    strict: true,
    noEmit: true,
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

async function waitForContent(
  read: () => Promise<string>,
  text: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await read()).includes(text)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Context types did not update: ${text}`);
}

it.each(["", "v1"])(
  "updates optional context typing without regenerating %s operations",
  async (version) => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "spec.json",
        JSON.stringify({
          openapi: "3.0.3",
          info: { title: "Optional context", version: "1" },
          paths: {
            "/pets/{id}": {
              get: { responses: { 204: { description: "OK" } } },
            },
          },
        }),
      );
      const destination = "groups/example";
      await new CodeGenerator(
        $.path("spec.json"),
        $.path(destination),
        {
          routes: true,
          types: true,
        },
        version,
      ).generate();
      if (version) {
        await $.add(
          `${destination}/types/versions.ts`,
          await generateVersionsTsContent([version]),
        );
      }
      const helpers = new ScenarioFileGenerator($.path(destination));
      await helpers.generate();
      const operationPath = `${destination}/types/${version ? version + "/" : ""}paths/pets/{id}.types.ts`;
      const original = await $.read(operationPath);
      await expect(
        $.read(`${destination}/routes/_.context.ts`),
      ).rejects.toThrow();
      const consumer = (checks: string) => `
      import type { Routes, Scenario, Middleware } from "./${destination}/types/index.js";
      const handler: Routes["/pets"]["/{id}"]["GET"] = ($) => {
        ${checks}
        return $.response.status(204).empty();
      };
    `;
      await $.add(
        "consumer.ts",
        consumer(`
      $.context.count ??= 0;
      $.context.count++;
      $.context.items = [];
      $.context.items.push("pet");
      type IsAny<T> = 0 extends (1 & T) ? true : false;
      const dynamic: IsAny<typeof $.context.count> = true;
    `) +
          `
      const scenario: Scenario = ($) => { $.context.count++; $.loadContext("/pets").count++; };
      const middleware: Middleware["/pets"] = async ($, next) => { $.context.count++; return next($); };
    `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);

      await helpers.watch();
      try {
        const nested = `${destination}/routes/pets/_.context.ts`;
        await $.add(nested, "export class Context { count = 0; }");
        await waitForContent(
          () => $.read(`${destination}/types/_.context.ts`),
          "PetsContext",
        );
        await $.remove("consumer.ts");
        await $.add(
          "consumer.ts",
          consumer(`
        const count: number = $.context.count;
        // @ts-expect-error Typed contexts reject invalid values.
        $.context.count = "wrong";
        // @ts-expect-error Typed contexts reject undeclared properties.
        $.context.typo = true;
      `),
        );
        expect(diagnostics($.path("consumer.ts"))).toEqual([]);

        await $.add(
          `${destination}/routes/_.context.ts`,
          "export class Context { root = true; }",
        );
        await waitForContent(
          () => $.read(`${destination}/types/_.context.ts`),
          "readonly context: Context;",
        );
        await $.remove(nested);
        await waitForContent(
          () => $.read(`${destination}/types/_.context.ts`),
          "export type ContextFor<Path extends string> = Context;",
        );
        await waitForContent(
          () => $.read(`${destination}/types/pets/_.middleware.ts`),
          "../../routes/_.context.js",
        );
        await $.remove("consumer.ts");
        await $.add(
          "consumer.ts",
          consumer(`
        const root: boolean = $.context.root;
        // @ts-expect-error Removing the nested context restores the root type.
        $.context.count++;
      `),
        );
        expect(diagnostics($.path("consumer.ts"))).toEqual([]);

        await $.remove(`${destination}/routes/_.context.ts`);
        await waitForContent(
          () => $.read(`${destination}/types/_.context.ts`),
          "readonly context: Record<string, any>",
        );
        await $.remove("consumer.ts");
        await waitForContent(
          () => $.read(`${destination}/types/pets/_.middleware.ts`),
          "MiddlewareFunction<Record<string, any>>",
        );
        await $.add("consumer.ts", consumer("$.context.count++;"));
        expect(diagnostics($.path("consumer.ts"))).toEqual([]);
        expect(await $.read(operationPath)).toBe(original);
      } finally {
        await helpers.stopWatching();
      }
    });
  },
  30_000,
);
