import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";
import { it } from "node:test";
import { expect } from "expect";
import { counterfact } from "../dist/app.js";
async function eventually(assertion) {
  let failure;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await assertion();
      return;
    } catch (error) {
      failure = error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw failure;
}
const operation = (query) => ({
  get: {
    parameters: query
      ? [{ in: "query", name: query, schema: { type: "string" } }]
      : [],
    responses: {
      200: {
        description: "Greeting",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { message: { type: "string" } },
            },
          },
        },
      },
    },
  },
});
const spec = (paths) =>
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Greetings", version: "1" },
    paths,
  });
it(
  "retains sibling versions when either watched specification changes",
  { timeout: 30_000 },
  async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("v1.json", spec({ "/greeting": operation() }));
      await $.add("v2.json", spec({ "/greeting": operation() }));
      const simulator = await counterfact(
        {
          basePath: $.path("api"),
          startServer: false,
          buildCache: false,
          startRepl: false,
        },
        ["v1", "v2"].map((version) => ({
          source: $.path(`${version}.json`),
          group: "greetings",
          version,
          prefix: `/${version}`,
        })),
      );
      const { stop } = await simulator.start();
      const shared = "api/greetings/types/paths/greeting.types.ts";
      const expectBothVersions = async () => {
        const content = await $.read(shared);
        expect(content).toContain("v1: HTTP_GET_$_v1");
        expect(content).toContain("v2: HTTP_GET_$_v2");
      };
      try {
        await expectBothVersions();
        await $.add(
          "v2.json",
          spec({
            "/greeting": operation("foo"),
            "/newer": operation(),
          }),
        );
        await eventually(async () => {
          expect(
            await $.read("api/greetings/types/v2/paths/greeting.types.ts"),
          ).toContain("foo?: string");
          expect(await $.read("api/greetings/types/index.ts")).toContain(
            '"/newer"',
          );
          await expectBothVersions();
        });
        await $.add(
          "api/greetings/routes/greeting.ts",
          `
        import type { Routes } from "../types/index.js";
        export const GET: Routes["/greeting"]["GET"] = ($) => {
          if ($.minVersion("v2")) {
            const version: "v2" = $.version;
            const foo: string | undefined = $.query.foo;
            return $.response.status(200).random();
          }
          const version: "v1" = $.version;
          // @ts-expect-error Only v2 has query parameters.
          $.query;
          return $.response.status(200).random();
        };
      `,
        );
        // A second watcher event can still be publishing shared type files.
        await eventually(async () => {
          const program = ts.createProgram(
            [$.path("api/greetings/routes/greeting.ts")],
            {
              strict: true,
              noEmit: true,
              skipLibCheck: true,
              types: [],
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.ESNext,
              moduleResolution: ts.ModuleResolutionKind.Bundler,
              allowImportingTsExtensions: true,
            },
          );
          expect(
            ts
              .getPreEmitDiagnostics(program)
              .map((diagnostic) =>
                ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
              ),
          ).toEqual([]);
        });
        await Promise.all([
          $.add("v1.json", spec({ "/greeting": operation("bar") })),
          $.add(
            "v2.json",
            spec({ "/greeting": operation("updated"), "/newer": operation() }),
          ),
        ]);
        await eventually(async () => {
          expect(
            await $.read("api/greetings/types/v1/paths/greeting.types.ts"),
          ).toContain("bar?: string");
          expect(
            await $.read("api/greetings/types/v2/paths/greeting.types.ts"),
          ).toContain("updated?: string");
          expect(await $.read("api/greetings/types/index.ts")).toContain(
            '"/newer"',
          );
          await expectBothVersions();
        });
        await $.add("v2.json", spec({ "/newer": operation() }));
        await eventually(async () => {
          const content = await $.read(shared);
          expect(content).toContain("v1: HTTP_GET_$_v1");
          expect(content).not.toContain("v2: HTTP_GET_$_v2");
          expect(await $.read("api/greetings/types/index.ts")).toContain(
            '"/newer"',
          );
        });
      } finally {
        await stop();
      }
    });
  },
);
