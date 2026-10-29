import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";
import { Repository } from "../src/repository.js";
import { ScenarioFileGenerator } from "../src/scenario-file-generator.js";

const spec = {
  openapi: "3.0.3",
  info: { title: "Helpers", version: "1" },
  paths: {
    "/admin/reports/events": {
      get: { responses: { 204: { description: "Empty" } } },
    },
  },
  components: {
    schemas: {
      Middleware: { type: "string" },
      Scenario: { type: "number" },
      Scenario$: { type: "boolean" },
      Context$: { type: "string" },
    },
  },
};

function diagnostics(file: string): string[] {
  const program = ts.createProgram([file], {
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
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

async function waitForContents(
  read: () => Promise<string>,
  predicate: (content: string) => boolean,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate(await read())) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Helper types did not refresh");
}

describe("central helper exports", () => {
  it("compiles constructors, scenarios, directory-specific middleware, and legacy imports after OpenAPI generation", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("spec.json", JSON.stringify(spec));
      await $.add("api/_.store.ts", "export class Store { shared = 1; }");
      await $.add(
        "api/routes/_.context.ts",
        `import type { Context$ } from "../types/index.js";
        export class Context { rootValue = "root"; constructor($: Context$) { void $; } }`,
      );
      await $.add(
        "api/routes/admin/_.context.ts",
        `import type { Context$ } from "../../types/index.js";
        export class Context { adminValue = 42; constructor($: Context$) { void $; } }`,
      );
      await new CodeGenerator($.path("spec.json"), $.path("api"), {
        routes: true,
        types: true,
      }).generate();
      await $.add(
        "consumer.ts",
        `
        import type { Context$, Scenario, Scenario$, Middleware, Routes, Schemas } from "./api/types/index.js";
        import type { Context$ as LegacyContext, Scenario as LegacyScenario, Scenario$ as LegacyScenarioArg } from "./api/types/_.context.js";
        import type { Middleware as LegacyMiddleware } from "./api/types/admin/_.middleware.js";
        type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
        const contextCompatibility: Same<Context$, LegacyContext> = true;
        const scenarioCompatibility: Same<Scenario, LegacyScenario> = true;
        const argCompatibility: Same<Scenario$, LegacyScenarioArg> = true;
        const middlewareCompatibility: Same<Middleware["/admin"], LegacyMiddleware> = true;
        function constructorHelper($: Context$) {
          const shared: number = $.store.shared;
          const root: string = $.loadContext("/").rootValue;
          const admin: number = $.loadContext("/admin").adminValue;
          const json: Promise<unknown> = $.readJson("seed.json");
        }
        const startup: Scenario = ($) => {
          const root: string = $.context.rootValue;
          const admin: number = $.loadContext("/admin").adminValue;
          // @ts-expect-error Scenarios do not receive the shared store directly.
          $.store;
        };
        const root: Middleware["/"] = ($, next) => {
          const value: string = $.context.rootValue;
          // @ts-expect-error Root middleware does not receive the admin context.
          $.context.adminValue;
          return next($);
        };
        const admin: Middleware["/admin/reports"] = ($, next) => {
          const value: number = $.context.adminValue;
          // @ts-expect-error The nested context replaces the root context.
          $.context.rootValue;
          return next($);
        };
        // @ts-expect-error Only existing route directories are keys.
        type Missing = Middleware["/missing"];
        const model: Schemas["Middleware"] = "ok";
        const scenarioModel: Schemas["Scenario"] = 1;
        const scenarioArgModel: Schemas["Scenario$"] = true;
        const contextModel: Schemas["Context$"] = "ok";
        const handler: Routes["/admin"]["/reports"]["/events"]["GET"] = ($) => $.response.status(204).empty();
      `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
      expect(diagnostics($.path("api/routes/_.context.ts"))).toEqual([]);
      expect(diagnostics($.path("api/routes/admin/reports/events.ts"))).toEqual(
        [],
      );
    });
  });

  it("creates a central helper entry point for spec-free projects", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("routes/_.context.ts", "export class Context { value = 1; }");
      await new Repository().copyCoreFiles($.path(""));
      const generator = new ScenarioFileGenerator($.path(""));
      await generator.generate();
      await $.add(
        "consumer.ts",
        `import type { Context$, Scenario, Middleware } from "./types/index.js";
        const startup: Scenario = ($) => { const value: number = $.context.value; };
        const middleware: Middleware["/"] = ($, next) => next($);
        function helper($: Context$) { const value: number = $.loadContext("/").value; }
      `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
      expect(await $.read("scenarios/index.ts")).toContain(
        'from "../types/index.js"',
      );
    });
  });

  it("preserves group-wide store typing when OpenAPI types regenerate", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("spec.json", JSON.stringify(spec));
      await $.add("api/_.store.ts", "export class Store { token = 'shared'; }");
      const code = new CodeGenerator(
        $.path("spec.json"),
        $.path("api/catalog"),
        { routes: true, types: true },
      );
      await code.generate();
      await new ScenarioFileGenerator(
        $.path("api/catalog"),
        $.path("api"),
      ).generate();
      await $.add(
        "api/catalog/routes/admin/_.context.ts",
        "export class Context { adminValue = 42; }",
      );
      await code.generate();
      await $.add(
        "consumer.ts",
        `import type { Context$, Scenario } from "./api/catalog/types/index.js";
        function helper($: Context$) { const token: string = $.store.token; const admin: number = $.loadContext("/admin").adminValue; }
        const startup: Scenario = ($) => { void $.context; };
      `,
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  });

  it("refreshes middleware directories and context references without replacing API maps", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("spec.json", JSON.stringify({ ...spec, paths: {} }));
      await new CodeGenerator($.path("spec.json"), $.path("api"), {
        routes: true,
        types: true,
      }).generate();
      const generator = new ScenarioFileGenerator($.path("api"));
      await generator.generate();
      const index = await $.read("api/types/index.ts");
      try {
        await generator.watch();
        await $.add(
          "api/routes/admin/_.context.ts",
          "export class Context { adminOnly = true; }",
        );
        await waitForContents(
          () => $.read("api/types/helpers.ts"),
          (content) => content.includes('"/admin"'),
        );
        await waitForContents(
          () => $.read("api/types/_.context.ts"),
          (content) => content.includes("AdminContext"),
        );
        await $.add(
          "consumer.ts",
          `import type { Middleware, Scenario } from "./api/types/index.js";
          const middleware: Middleware["/admin"] = ($, next) => { const flag: boolean = $.context.adminOnly; return next($); };
          const scenario: Scenario = ($) => { const flag: boolean = $.loadContext("/admin").adminOnly; };
        `,
        );
        expect(diagnostics($.path("consumer.ts"))).toEqual([]);
        await $.add(
          "api/routes/admin/_.context.ts",
          "export class Context { adminOnly = 42; }",
        );
        await $.add(
          "consumer.ts",
          `import type { Middleware } from "./api/types/index.js";
          const middleware: Middleware["/admin"] = ($, next) => { const value: number = $.context.adminOnly; return next($); };
        `,
        );
        expect(diagnostics($.path("consumer.ts"))).toEqual([]);
        await $.remove("api/routes/admin/_.context.ts");
        await waitForContents(
          () => $.read("api/types/helpers.ts"),
          (content) => content.includes('"/admin"'),
        );
        await waitForContents(
          () => $.read("api/types/_.context.ts"),
          (content) => !content.includes("AdminContext"),
        );
        await waitForContents(
          () => $.read("api/types/admin/_.middleware.ts"),
          (content) => !content.includes("routes/admin/_.context"),
        );
        expect(await $.read("api/types/index.ts")).toBe(index);
        await $.add(
          "consumer.ts",
          `import type { Middleware } from "./api/types/index.js";
          const inherited: Middleware["/admin"] = ($, next) => {
            // @ts-expect-error The deleted context is no longer available.
            $.context.adminOnly;
            return next($);
          };
          const root: Middleware["/"] = ($, next) => next($);`,
        );
        expect(diagnostics($.path("consumer.ts"))).toEqual([]);
      } finally {
        await generator.stopWatching();
      }
    });
  });
});
