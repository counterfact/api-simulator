import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { generateVersionsTsContent } from "../src/versions-ts-generator.js";
import { CodeGenerator } from "../src/code-generator.js";
import { ScenarioFileGenerator } from "../src/scenario-file-generator.js";

const schema = {
  type: "object",
  required: ["name", "files"],
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    files: { type: "array", items: { $ref: "#/components/schemas/Binary" } },
    avatar: {
      anyOf: [{ $ref: "#/components/schemas/Binary" }, { type: "null" }],
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
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
}

describe("multipart request types", () => {
  it.each(["", "v1"])(
    "compiles typed fields and file metadata for version '%s' without changing JSON models",
    async (version) => {
      await usingTemporaryFiles(async ($) => {
        const response = { responses: { 204: { description: "Empty" } } };
        await $.add(
          "spec.json",
          JSON.stringify({
            openapi: "3.0.4",
            info: { title: "Upload", version: "1" },
            paths: {
              "/upload": {
                post: {
                  ...response,
                  requestBody: {
                    required: true,
                    content: {
                      "multipart/form-data": {
                        schema: { $ref: "#/components/schemas/Upload" },
                      },
                    },
                  },
                },
              },
              "/json": {
                post: {
                  ...response,
                  requestBody: {
                    content: {
                      "application/json": {
                        schema: { $ref: "#/components/schemas/Upload" },
                      },
                    },
                  },
                },
              },
              "/form": {
                post: {
                  ...response,
                  requestBody: {
                    content: {
                      "application/x-www-form-urlencoded": {
                        schema: {
                          type: "object",
                          required: ["name"],
                          properties: { name: { type: "string" } },
                        },
                      },
                    },
                  },
                },
              },
            },
            components: {
              schemas: {
                Upload: schema,
                Binary: { type: "string", format: "binary" },
              },
            },
          }),
        );
        const generator = new CodeGenerator(
          $.path("spec.json"),
          $.path("api"),
          { routes: true, types: true },
          version,
        );
        await generator.generate();
        if (version)
          await $.add(
            "api/types/versions.ts",
            await generateVersionsTsContent([version]),
          );
        await new ScenarioFileGenerator($.path("api")).generate();
        await $.add(
          "consumer.ts",
          `
        import type { Routes } from "./api/types/index.js";
        export const upload: Routes["/upload"]["POST"] = ($) => {
          const name: string = $.body.name;
          const bytes: Uint8Array = $.body.files[0]!.data;
          const filename: string = $.body.files[0]!.filename;
          const contentType: string = $.body.files[0]!.contentType;
          const size: number = $.body.files[0]!.size;
          const description: string | undefined = $.body.description;
          if ($.body.avatar) { const avatar: Uint8Array = $.body.avatar.data; }
          // @ts-expect-error file bytes are not a string
          const text: string = $.body.files[0]!.data;
          return $.response.status(204).empty();
        };
        export const json: Routes["/json"]["POST"] = ($) => {
          if ($.body === undefined) return $.response.status(204).empty();
          const original: Uint8Array | string = $.body.files[0]!;
          // @ts-expect-error JSON binary fields have no multipart metadata
          const filename = $.body.files[0]!.filename;
          return $.response.status(204).empty();
        };
        export const form: Routes["/form"]["POST"] = ($) => {
          if ($.body === undefined) return $.response.status(204).empty();
          const name: string = $.body.name;
          return $.response.status(204).empty();
        };
        type Body = Parameters<Routes["/upload"]["POST"]>[0]["body"];
        // @ts-expect-error name is required
        const missing: Body = { files: [] };
        // @ts-expect-error files require bytes and metadata
        const invalid: Body = { name: "x", files: ["x"] };
      `,
        );
        expect(diagnostics($.path("consumer.ts"))).toEqual([]);
        // Authored handlers survive subsequent generation.
        await $.add(
          "api/routes/upload.ts",
          `export const POST = () => ({ status: 204 });\n`,
        );
        await generator.generate();
        expect(await $.read("api/routes/upload.ts")).toContain(
          "export const POST = () => ({ status: 204 });",
        );
      });
    },
  );
});

it.each(["", "v1"])(
  "compiles colliding and nullable binary multipart types (%s)",
  async (version) => {
    await usingTemporaryFiles(async ($) => {
      const binary = { type: "string", format: "binary" };
      await $.add(
        "spec.json",
        JSON.stringify({
          openapi: "3.1.0",
          info: { title: "Files", version: "1" },
          components: { schemas: { MultipartFile: binary } },
          paths: {
            "/upload": {
              post: {
                requestBody: {
                  required: true,
                  content: {
                    "multipart/form-data": {
                      schema: {
                        type: "object",
                        required: ["file", "nullableFile"],
                        properties: {
                          file: { $ref: "#/components/schemas/MultipartFile" },
                          nullableFile: {
                            type: ["string", "null"],
                            format: "binary",
                          },
                        },
                      },
                    },
                  },
                },
                responses: { 204: { description: "OK" } },
              },
            },
          },
        }),
      );
      await new CodeGenerator(
        $.path("spec.json"),
        $.path("api"),
        { routes: true, types: true },
        version,
      ).generate();
      if (version)
        await $.add(
          "api/types/versions.ts",
          await generateVersionsTsContent([version]),
        );
      await $.add(
        "consumer.ts",
        'import type {Routes} from "./api/types/index.js"; const route: Routes["/upload"]["POST"] = ($)=>{ const bytes:Uint8Array=$.body.file.data; if ($.body.nullableFile!==null) { const optionalBytes:Uint8Array=$.body.nullableFile.data; } const nullable: typeof $.body.nullableFile=null; return $.response.status(204).empty(); };',
      );
      expect(diagnostics($.path("consumer.ts"))).toEqual([]);
    });
  },
  30000,
);
