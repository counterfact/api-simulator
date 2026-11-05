import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";
import { Repository } from "../src/repository.js";
import { generateVersionsTsContent } from "../src/versions-ts-generator.js";

type Files = {
  add(path: string, contents: string): Promise<void>;
  path(path: string): string;
};

async function generate(
  files: Files,
  versions: readonly string[],
  skipped: readonly string[] = [],
): Promise<void> {
  const repository = new Repository();
  for (const [index, version] of versions.entries()) {
    const properties = {
      message: { type: "string" },
      ...(index >= 1 ? { locale: { type: "string", enum: ["en", "es"] } } : {}),
      ...(index >= 2 ? { timezone: { type: "string" } } : {}),
    };
    const operation = {
      responses: {
        200: {
          description: "Greeting",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: Object.keys(properties),
                properties,
              },
            },
          },
        },
      },
    };
    await files.add(
      `${index}.json`,
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Greetings", version },
        paths: skipped.includes(version)
          ? {}
          : { "/greeting": { get: operation } },
      }),
    );
    await new CodeGenerator(
      files.path(`${index}.json`),
      files.path("api"),
      { routes: true, types: true },
      version,
    ).generate(repository);
  }
  await files.add(
    "api/types/versions.ts",
    await generateVersionsTsContent(versions),
  );
}

async function check(files: Files, source: string): Promise<string[]> {
  await files.add(
    "consumer.ts",
    `import type { Routes } from "./api/types/index.js";
    type Handler = Routes["/greeting"]["GET"];
    type Arg = Parameters<Handler>[0];
    ${source}`,
  );
  const program = ts.createProgram([files.path("consumer.ts")], {
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

describe("versioned handler control flow", () => {
  it("narrows response builders after early returns and in both branches", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate($, ["v1", "v2"]);
      await expect(
        check(
          $,
          `
        export const GET: Handler = async ($) => {
          if ($.minVersion("v2")) {
            const version: "v2" = $.version;
            // @ts-expect-error v2 requires locale.
            $.response.status(200).json({ message: "x" });
            return $.response.status(200).json({ message: "x", locale: "en" });
          }
          const version: "v1" = $.version;
          return $.response.status(200).json({ message: "x" });
        };
        export const negated: Handler = ($) => {
          if (!$.minVersion("v2")) {
            const version: "v1" = $.version;
            return $.response.status(200).json({ message: "x" });
          }
          const version: "v2" = $.version;
          return $.response.status(200).json({ message: "x", locale: "en" });
        };
        export const explicitElse: Handler = ($) => {
          if ($.minVersion("v2")) {
            return $.response.status(200).json({ message: "x", locale: "en" });
          } else {
            return $.response.status(200).json({ message: "x" });
          }
        };
        export const discriminant: Handler = ($) => {
          if ($.version === "v2") return $.response.status(200).json({ message: "x", locale: "en" });
          return $.response.status(200).json({ message: "x" });
        };
      `,
        ),
      ).resolves.toEqual([]);
    });
  });

  it.each([
    ["v1", "v2", "v3"],
    ["current", "legacy", "next"],
  ])(
    "preserves declaration order across nested and sequential guards (%s, %s, %s)",
    async (first, second, third) => {
      await usingTemporaryFiles(async ($) => {
        await generate($, [first, second, third]);
        const a = JSON.stringify(first),
          b = JSON.stringify(second),
          c = JSON.stringify(third);
        await expect(
          check(
            $,
            `
        export const sequential: Handler = ($) => {
          if ($.minVersion(${c})) {
            const version: ${c} = $.version;
            return $.response.status(200).json({ message: "x", locale: "en", timezone: "UTC" });
          }
          const remaining: ${a} | ${b} = $.version;
          if ($.minVersion(${b})) {
            const version: ${b} = $.version;
            return $.response.status(200).json({ message: "x", locale: "en" });
          }
          const version: ${a} = $.version;
          return $.response.status(200).json({ message: "x" });
        };
        export const nested: Handler = ($) => {
          if ($.minVersion(${b})) {
            const newer: ${b} | ${c} = $.version;
            // @ts-expect-error The latest version still requires timezone.
            $.response.status(200).json({ message: "x", locale: "en" });
            if ($.minVersion(${c})) return $.response.status(200).json({ message: "x", locale: "en", timezone: "UTC" });
            const version: ${b} = $.version;
            return $.response.status(200).json({ message: "x", locale: "en" });
          }
          const version: ${a} = $.version;
          return $.response.status(200).json({ message: "x" });
        };
      `,
          ),
        ).resolves.toEqual([]);
      });
    },
  );

  it("retains generic calls and handles dynamic thresholds without making false branches unreachable", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate($, ["v1", "v2", "v3"]);
      await expect(
        check(
          $,
          `
        function dynamic($: Arg, minimum: "v1" | "v2") {
          if ($.minVersion(minimum)) {
            const version: "v1" | "v2" | "v3" = $.version;
          } else {
            // This can run for v1 when the runtime minimum is v2.
            const version: "v1" | "v2" | "v3" = $.version;
          }
        }
        function anotherDynamic($: Arg, minimum: "v2" | "v3") {
          if (!$.minVersion(minimum)) {
            // v2 can also be below a dynamic v3 threshold.
            // @ts-expect-error The branch is not known to be v1 alone.
            const unsafe: "v1" = $.version;
          }
        }
        function generic<M extends "v1" | "v2" | "v3">($: Arg, minimum: M): boolean {
          return $.minVersion<M>(minimum);
        }
        function explicit($: Arg) {
          if ($.minVersion<"v3">("v3")) {
            const version: "v3" = $.version;
          }
          // @ts-expect-error Unknown versions remain invalid.
          $.minVersion("missing");
        }
        function untyped($: Arg, minimum: any) {
          if (!$.minVersion(minimum)) { const version: "v1" | "v2" | "v3" = $.version; }
        }
      `,
        ),
      ).resolves.toEqual([]);
    });
  });

  it("supports single-version and sparse operation maps", async () => {
    await usingTemporaryFiles(async ($) => {
      await generate($, ["v1"]);
      await expect(
        check(
          $,
          `export const GET: Handler = ($) => {
        if ($.minVersion("v1")) return $.response.status(200).json({ message: "x" });
        const unreachable: never = $;
        throw new Error("Unreachable");
      };`,
        ),
      ).resolves.toEqual([]);
    });
    await usingTemporaryFiles(async ($) => {
      await generate($, ["v1", "v2", "v3"], ["v2"]);
      await expect(
        check(
          $,
          `export const GET: Handler = ($) => {
        // @ts-expect-error v2 does not declare this operation.
        $.minVersion("v2");
        if ($.minVersion("v3")) return $.response.status(200).json({ message: "x", locale: "en", timezone: "UTC" });
        const version: "v1" = $.version;
        return $.response.status(200).json({ message: "x" });
      };`,
        ),
      ).resolves.toEqual([]);
    });
  });
});
