import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { expect, it } from "@jest/globals";
import { generateApi } from "swagger-typescript-api";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../../generator/src/code-generator.js";

const text = { type: "string" };
const integer = { type: "integer" };
const json = (schema: object) => ({ "application/json": { schema } });
const user = { $ref: "#/components/schemas/User" };
const parameter = (name: string, place: string, schema: object) => ({
  name,
  in: place,
  schema,
  required: place === "path",
});

const spec = {
  openapi: "3.0.3",
  info: { title: "Migration", version: "1" },
  servers: [{ url: "https://example.test/api" }],
  security: [{ token: [] }],
  paths: {
    "/": { get: { responses: { 204: { description: "Empty" } } } },
    "/users/{id}": {
      parameters: [parameter("id", "path", integer)],
      get: {
        operationId: "getUser",
        parameters: [parameter("tag", "query", { type: "array", items: text })],
        responses: {
          200: { description: "User", content: json(user) },
          404: { description: "Error", content: json(text) },
        },
      },
    },
    "/users": {
      post: {
        parameters: [parameter("unit", "query", text)],
        requestBody: { required: true, content: json(user) },
        responses: { 200: { description: "User", content: json(user) } },
      },
    },
    "/users/sub/{id}": {
      get: {
        parameters: [parameter("id", "path", integer)],
        responses: { 204: { description: "Empty" } },
      },
    },
  },
  components: {
    securitySchemes: { token: { type: "http", scheme: "bearer" } },
    schemas: {
      User: { type: "object", required: ["id"], properties: { id: integer } },
    },
  },
};

const dist = (path: string) => fileURLToPath(new URL(path, import.meta.url));

it.each([
  { singleHttpClient: false, unwrapResponseData: false },
  { singleHttpClient: true, unwrapResponseData: false },
  { singleHttpClient: false, unwrapResponseData: true },
  { singleHttpClient: true, unwrapResponseData: true },
])(
  "runs the same STA consumer with %j",
  async (options) => {
    await usingTemporaryFiles(async ($) => {
      await $.add("package.json", '{"type":"module"}');
      await $.add("spec.json", JSON.stringify(spec));
      const { files } = await generateApi({
        input: $.path("spec.json"),
        output: false,
        name: "Api.ts",
        httpClientType: "fetch",
        generateResponses: true,
        silent: true,
        ...options,
      });
      for (const file of files)
        await $.add(
          `upstream/${file.fileName}${file.fileExtension}`,
          file.fileContent,
        );

      const generator = new CodeGenerator(
        $.path("spec.json"),
        $.path("native"),
        {},
      );
      await generator.generateClient();

      await $.add(
        "node_modules/@counterfact/client/package.json",
        JSON.stringify({
          type: "module",
          exports: {
            "./fetch": "./fetch.js",
            "./validation-helpers": "./validation-helpers.js",
          },
        }),
      );
      for (const module of ["fetch", "validation-helpers"]) {
        const url = new URL(`../../client/dist/${module}.js`, import.meta.url);
        await $.add(
          `node_modules/@counterfact/client/${module}.js`,
          `export * from ${JSON.stringify(url.href)};`,
        );
      }
      await $.add(
        "node_modules/swagger-typescript-api-adapter/package.json",
        '{"type":"module","exports":"./index.js"}',
      );
      const adapterUrl = new URL("../dist/index.js", import.meta.url);
      await $.add(
        "node_modules/swagger-typescript-api-adapter/index.js",
        `export * from ${JSON.stringify(adapterUrl.href)};`,
      );

      const body = `
      import assert from "node:assert/strict";
      const requests: string[] = [];
      const config = {
        securityWorker: (token: string | null) => ({ headers: { Authorization: \`Bearer \${token}\` } }),
        customFetch: (async (url, init) => {
          requests.push(String(url));
          assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer secret");
          if (String(url).endsWith("/users/404")) return Response.json("missing", { status: 404 });
          if (String(url).endsWith("/users/99")) return Response.json({ id: "wrong type" });
          if (init?.method === "POST") {
            assert.equal(new Headers(init.headers).get("Content-Type"), "application/json");
            assert.equal(init.body, '{"id":42}');
            return Response.json({ id: 42 });
          }
          if (String(url).endsWith("/users/sub/42") || String(url).endsWith("/api/")) {
            return new Response(null, { status: 204 });
          }
          return Response.json({ id: 42 });
        }) satisfies typeof fetch,
      };
      ${
        options.singleHttpClient
          ? `
        const http = new HttpClient(config);
        http.setSecurityData("secret");
        const api = new Api(http);
        assert.equal(api.http, http);
        assert.equal(new Api(http).http, http);
      `
          : `
        const api = new Api(config);
        api.setSecurityData("secret");
      `
      }
      const response = await api.users.getUser(42, { tag: ["a b", "c"] });
      const user: { id: number } = ${options.unwrapResponseData ? "response" : "response.data"};
      assert.deepEqual(user, { id: 42 });
      const created = await api.users.usersCreate({ id: 42 }, { unit: "test" }, { redirect: "manual" });
      assert.deepEqual(${options.unwrapResponseData ? "created" : "created.data"}, user);
      assert.equal(requests[0], "https://example.test/api/users/42?tag=a%20b&tag=c");
      assert.equal(requests[1], "https://example.test/api/users?unit=test");
      await api.users.getUsers(42);
      await api.getRoot();
      await assert.rejects(api.users.getUser(404), { status: 404, error: "missing" });
      const unexpected = await api.users.getUser(99);
      assert.deepEqual(${options.unwrapResponseData ? "unexpected" : "unexpected.data"}, { id: "wrong type" });
      if (false) {
        // @ts-expect-error the path ID is numeric
        api.users.getUser("42");
        // @ts-expect-error the body goes before optional query
        api.users.usersCreate({ unit: "test" }, { id: 42 });
      }
    `;
      await $.add(
        "upstream.ts",
        `import { Api${options.singleHttpClient ? ", HttpClient" : ""} } from "./upstream/Api.js";\n${body}`,
      );
      await $.add(
        "adapted.ts",
        `
      import { createSdk } from "./native/index.js";
      import { wrapSta${options.singleHttpClient ? ", HttpClient" : ""} } from "swagger-typescript-api-adapter";
      const Api = wrapSta(createSdk${options.unwrapResponseData ? ", { unwrapResponseData: true }" : ""});
      ${body}
    `,
      );

      await $.add(
        "validated.ts",
        `
        import assert from "node:assert/strict";
        import { createSdk } from "./native/index.js";
        const api = createSdk({
          baseUrl: "https://example.test",
          auth: { token: () => "secret" },
          fetch: async () => Response.json({ id: "wrong type" }),
        });
        await assert.rejects(api.users.getUser(99), { reason: "schema-mismatch" });
      `,
      );

      const program = ts.createProgram(
        [$.path("upstream.ts"), $.path("adapted.ts"), $.path("validated.ts")],
        {
          strict: true,
          skipLibCheck: true,
          noEmitOnError: true,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          typeRoots: [dist("../../../node_modules/@types")],
          types: ["node"],
          paths: {
            "@counterfact/client/fetch": [dist("../../client/dist/fetch.d.ts")],
            "@counterfact/client/validation-helpers": [
              dist("../../client/dist/validation-helpers.d.ts"),
            ],
            "swagger-typescript-api-adapter": [dist("../dist/index.d.ts")],
          },
        },
      );
      expect(
        ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
          ),
      ).toEqual([]);
      expect(program.emit().emitSkipped).toBe(false);
      for (const module of ["upstream.js", "adapted.js", "validated.js"]) {
        execFileSync(process.execPath, [module], {
          cwd: $.path(""),
          stdio: "pipe",
        });
      }
    });
  },
  30_000,
);
