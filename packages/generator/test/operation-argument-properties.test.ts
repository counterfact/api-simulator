import { describe, expect, it } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";
import { addVersionFile } from "./helpers/version-file.js";

describe("generated operation argument properties", () => {
  it.each([
    {
      version: "",
      prefix: "types",
      suffix: "",
      versionKey: "",
      versionAssertion: "",
      arg: (name: string) => `Parameters<${name}>[0]`,
    },
    {
      version: "v1",
      prefix: "types/v1",
      suffix: "_$_v1",
      versionKey: ' | "version"',
      versionAssertion: 'const version: "v1" = input.version;',
      arg: (name: string) => `${name}_$_v1`,
    },
  ])(
    "omits absent inputs and preserves declared inputs (version: $version)",
    async ({ version, prefix, suffix, versionKey, versionAssertion, arg }) => {
      await usingTemporaryFiles(async ($) => {
        await $.add(
          "openapi.json",
          JSON.stringify({
            openapi: "3.2.0",
            info: { title: "Argument properties", version: "1" },
            paths: {
              "/empty": {
                get: { responses: { 204: { description: "Empty" } } },
              },
              "/inputs/{id}": {
                post: {
                  parameters: [
                    {
                      in: "path",
                      name: "id",
                      required: true,
                      schema: { type: "string" },
                    },
                    { in: "query", name: "search", schema: { type: "string" } },
                    { in: "header", name: "token", schema: { type: "string" } },
                    {
                      in: "cookie",
                      name: "session",
                      schema: { type: "string" },
                    },
                    {
                      in: "querystring",
                      name: "filters",
                      schema: {
                        type: "object",
                        properties: { active: { type: "boolean" } },
                      },
                    },
                  ],
                  requestBody: {
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: { name: { type: "string" } },
                        },
                      },
                    },
                  },
                  security: [{ basic: [] }],
                  responses: { 204: { description: "Empty" } },
                },
              },
            },
            components: {
              securitySchemes: { basic: { type: "http", scheme: "basic" } },
            },
          }),
        );
        await new CodeGenerator(
          $.path("openapi.json"),
          $.path(""),
          { routes: true, types: true },
          version,
        ).generate();
        await addVersionFile($, version, "types");
        const empty = await $.read(`${prefix}/paths/empty.types.ts`);
        const inputs = await $.read(`${prefix}/paths/inputs/{id}.types.ts`);
        expect(empty).not.toContain("OmitValueWhenNever");
        expect(inputs).not.toContain("OmitValueWhenNever");
        await $.add(
          "consumer.ts",
          `import type { HTTP_GET${suffix} } from "./${prefix}/paths/empty.types.js";
          import type { HTTP_POST${suffix} } from "./${prefix}/paths/inputs/{id}.types.js";
          type Equal<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
          type Assert<T extends true> = T;
          type Empty = ${arg("HTTP_GET")};
          type Inputs = ${arg("HTTP_POST")};
          type EmptyKeys = Assert<Equal<keyof Empty, "context" | "response" | "x" | "proxy" | "delay" | "auth" | "user"${versionKey}>>;
          type InputKeys = Assert<Equal<keyof Inputs, keyof Empty | "query" | "querystring" | "path" | "headers" | "cookie" | "body" | "auth" | "user">>;
          declare const input: Inputs;
          const id: string = input.path.id;
          const search: string | undefined = input.query.search;
          const token: string | undefined = input.headers.token;
          const session: string | undefined = input.cookie.session;
          const active: boolean | undefined = input.querystring.active;
          const name: string | undefined = input.body?.name;
          const username: string | undefined = input.auth.username;
          const password: string | undefined = input.user.password;
          ${versionAssertion}
          `,
        );
        const program = ts.createProgram([$.path("consumer.ts")], {
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
    },
  );
});
