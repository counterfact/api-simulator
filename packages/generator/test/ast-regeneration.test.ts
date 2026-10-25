import { describe, expect, it } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";
import { Repository } from "../src/repository.js";
import { generateVersionsTsContent } from "../src/versions-ts-generator.js";
import { ScenarioFileGenerator } from "../src/scenario-file-generator.js";

const specification = {
  openapi: "3.0.3",
  info: { title: "Regeneration", version: "1" },
  paths: {
    "/thing": {
      get: {
        operationId: "getThing",
        responses: { 204: { description: "Empty" } },
      },
      post: {
        operationId: "createThing",
        responses: { 204: { description: "Empty" } },
      },
    },
  },
};

describe("AST route regeneration", () => {
  it("shares handler names across distinct versioned specifications", async () => {
    await usingTemporaryFiles(async ($) => {
      const repository = new Repository();
      for (const version of ["v1", "v2"]) {
        await $.add(
          `${version}.json`,
          JSON.stringify({
            ...specification,
            paths: {
              "/thing": {
                get: { responses: { 204: { description: version } } },
              },
            },
          }),
        );
        await new CodeGenerator(
          $.path(`${version}.json`),
          $.path(""),
          {
            routes: true,
            types: true,
          },
          version,
        ).generate(repository);
      }
      await $.add(
        "types/versions.ts",
        await generateVersionsTsContent(["v1", "v2"]),
      );
      await new ScenarioFileGenerator($.path("")).generate();
      const route = await $.read("routes/thing.ts");
      const contract = await $.read("types/paths/thing.types.ts");
      expect(route).toContain("export const GET: HTTP_GET");
      expect(route).not.toContain("GET2");
      expect(contract).toContain("export type HTTP_GET =");
      expect(contract).toContain("v1: HTTP_GET_$_v1");
      expect(contract).toContain("v2: HTTP_GET_$_v2");
      const program = ts.createProgram([$.path("routes/thing.ts")], {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        allowImportingTsExtensions: true,
      });
      expect(
        ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
          ),
      ).toEqual([]);
    });
  });

  it.each([
    "export type POST = string;",
    "export interface POST { label: string }",
    'export type { POST } from "./other.js";',
    'export { type POST } from "./other.js";',
    'export { POST } from "./other.js";',
    'export type * from "./other.js";',
    'export * from "./other.js";',
    'import type { POST } from "./other.js";\nexport type { POST };',
  ])(
    "adds a runtime handler alongside type-only declarations: %s",
    async (declaration) => {
      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(specification));
        await $.add(
          "routes/other.ts",
          "export interface POST { label: string }",
        );
        const original =
          declaration + "\nexport function GET() { return {}; }\n";
        await $.add("routes/thing.ts", original);
        const generator = new CodeGenerator(
          $.path("openapi.json"),
          $.path(""),
          { routes: true, types: true },
        );
        await generator.generate();
        const content = await $.read("routes/thing.ts");
        for (const line of original.trim().split("\n"))
          expect(content).toContain(line);
        expect(content).toContain("export const POST: HTTP_POST");
        await generator.generate();
        expect(await $.read("routes/thing.ts")).toBe(content);
      });
    },
  );

  it.each([
    'export type { POST } from "./other.js";',
    'export { type POST } from "./other.js";',
    'export type * from "./other.js";',
  ])(
    "does not treat a type-only re-export of a value as a handler: %s",
    async (original) => {
      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(specification));
        await $.add("routes/other.ts", "export function POST() { return {}; }");
        await $.add("routes/thing.ts", original + "\n");
        await new CodeGenerator($.path("openapi.json"), $.path(""), {
          routes: true,
          types: true,
        }).generate();
        expect(await $.read("routes/thing.ts")).toContain(
          "export const POST: HTTP_POST",
        );
      });
    },
  );

  it("rejects a conflicting local runtime binding", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(specification));
      const original = "const POST = () => {};\n";
      await $.add("routes/thing.ts", original);
      await expect(
        new CodeGenerator($.path("openapi.json"), $.path(""), {
          routes: true,
          types: true,
        }).generate(),
      ).rejects.toThrow(
        "Cannot add handler POST: a local binding already exists",
      );
      expect(await $.read("routes/thing.ts")).toBe(original);
    });
  });

  it("recognizes handlers supplied by a star re-export without executing them", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(specification));
      await $.add(
        "routes/shared.ts",
        'throw new Error("must not execute"); export function GET() { return {}; }',
      );
      const original = 'export * from "./shared.js";\n';
      await $.add("routes/thing.ts", original);
      await new CodeGenerator($.path("openapi.json"), $.path(""), {
        routes: true,
        types: true,
      }).generate();
      const content = await $.read("routes/thing.ts");
      expect(content).toContain(original);
      expect(content).not.toContain("export const GET");
      expect(content).toContain("export const POST");
    });
  });
  it.each([
    'export function GET() { return { nested: { text: "};" } }; }\n',
    'const original = () => ({ nested: { text: "};" } });\nexport { original as GET };\n',
  ])(
    "preserves an existing function or aliased export and adds POST",
    async (original) => {
      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(specification));
        await $.add("routes/thing.ts", original);
        const generator = new CodeGenerator(
          $.path("openapi.json"),
          $.path(""),
          { routes: true, types: true },
        );
        await generator.generate();
        const content = await $.read("routes/thing.ts");
        expect(content).toContain(original);
        expect(content).not.toContain("export const GET");
        expect(content).toContain("export const POST");
        await generator.generate();
        expect(await $.read("routes/thing.ts")).toBe(content);
      });
    },
  );

  it("inserts after complete multiline imports and comments, and aliases a conflicting type", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(specification));
      await $.add("routes/other.ts", "export type HTTP_POST = string;");
      const original =
        'import type {\n  HTTP_POST,\n} from "./other.js"; /* first line\nsecond line */\n' +
        'export function GET() { return { nested: { text: "};" } }; }\n';
      await $.add("routes/thing.ts", original);
      const generator = new CodeGenerator($.path("openapi.json"), $.path(""), {
        routes: true,
        types: true,
      });
      await generator.generate();
      const content = await $.read("routes/thing.ts");
      expect(content).toContain(
        "second line */\nimport type { HTTP_POST as HTTP_POST2 }",
      );
      expect(content).toContain("export const POST: HTTP_POST2");
      expect(content).toContain(
        'export function GET() { return { nested: { text: "};" } }; }',
      );
      await new ScenarioFileGenerator($.path("")).generate();
      const program = ts.createProgram([$.path("routes/thing.ts")], {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        allowImportingTsExtensions: true,
      });
      expect(
        ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
          ),
      ).toEqual([]);
      await generator.generate();
      expect(await $.read("routes/thing.ts")).toBe(content);
    });
  });

  it("keeps a leading reference directive ahead of inserted imports", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("openapi.json", JSON.stringify(specification));
      await $.add("routes/reference.d.ts", "interface Marker {}");
      const directive = '/// <reference path="./reference.d.ts" />\n';
      const original = directive + "export function GET() { return {}; }\n";
      await $.add("routes/thing.ts", original);
      await new CodeGenerator($.path("openapi.json"), $.path(""), {
        routes: true,
        types: true,
      }).generate();
      const content = await $.read("routes/thing.ts");
      expect(content.startsWith(directive + "import type")).toBe(true);
      expect(content).toContain("export function GET() { return {}; }");
    });
  });
});
