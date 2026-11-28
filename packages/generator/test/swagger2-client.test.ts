import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { expect, it } from "@jest/globals";
import ts from "typescript";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";

const string = { type: "string" };
const integer = { type: "integer" };
const id = { name: "id", in: "path", required: true, ...integer };
const user = { $ref: "#/definitions/User" };
const empty = { 204: { description: "Accepted" } };
const field = (name: string, format?: string) => ({
  name,
  type: "array",
  items: string,
  ...(format && { collectionFormat: format }),
});
const normal = new URL(
  "../../counterfact/test/fixtures/openapi/swagger2.yaml",
  import.meta.url,
);

it("generates a Fetch client in the simulator output for Swagger 2.0", async () => {
  await usingTemporaryFiles(async ($) => {
    await new CodeGenerator(fileURLToPath(normal), $.path("out"), {
      routes: true,
      types: true,
    }).generate();
    const client = await $.read("out/client/index.ts");
    expect(client).toContain("submitForm");
    expect(client).toContain("URLSearchParams");
    expect(client).toContain("formFields:");
  });
});

it("compiles and runs generated Swagger 2.0 requests and response validators", async () => {
  await usingTemporaryFiles(async ($) => {
    await $.add("package.json", '{"type":"module"}');
    await $.add(
      "api.json",
      JSON.stringify({
        swagger: "2.0",
        info: { title: "Swagger client", version: "1" },
        schemes: ["https"],
        host: "example.test",
        basePath: "/v2",
        consumes: ["application/json"],
        produces: ["application/json"],
        security: [{ basic: [] }, { key: [] }, { oauth: ["users:read"] }],
        securityDefinitions: {
          basic: { type: "basic" },
          key: { type: "apiKey", in: "header", name: "X-Key" },
          oauth: {
            type: "oauth2",
            flow: "application",
            tokenUrl: "https://example.test/token",
            scopes: { "users:read": "Read users" },
          },
        },
        parameters: { Id: id },
        responses: {
          Missing: {
            description: "Missing",
            schema: { $ref: "#/definitions/Missing" },
          },
        },
        paths: {
          "/users/{id}": {
            parameters: [{ $ref: "#/parameters/Id" }],
            get: {
              operationId: "getUser",
              parameters: [
                ...[
                  ["csv"],
                  ["multi", "multi"],
                  ["pipes", "pipes"],
                  ["tab", "tsv"],
                  ["space", "ssv"],
                ].map(([name, format]) => ({
                  in: "query",
                  ...field(name!, format),
                })),
                { in: "header", ...field("X-Values", "tsv") },
              ],
              responses: {
                200: { description: "User", schema: user },
                404: { $ref: "#/responses/Missing" },
              },
            },
          },
          "/users": {
            post: {
              operationId: "postUser",
              security: [],
              parameters: [
                { name: "payload", in: "body", required: true, schema: user },
              ],
              responses: empty,
            },
          },
          "/form": {
            post: {
              operationId: "postForm",
              security: [],
              consumes: ["application/x-www-form-urlencoded"],
              parameters: [
                { in: "formData", ...field("tags", "multi"), required: true },
              ],
              responses: empty,
            },
          },
          "/upload": {
            post: {
              operationId: "uploadFile",
              security: [],
              consumes: ["multipart/form-data"],
              parameters: [
                { in: "formData", name: "photo", type: "file", required: true },
                { in: "formData", ...field("labels", "pipes") },
              ],
              responses: empty,
            },
          },
          "/download": {
            get: {
              operationId: "downloadFile",
              security: [],
              produces: ["application/octet-stream"],
              responses: {
                200: { description: "File", schema: { type: "file" } },
              },
            },
          },
          "/text": {
            get: {
              operationId: "getText",
              security: [],
              produces: ["text/plain"],
              responses: {
                200: {
                  description: "Text",
                  schema: { type: "string", minLength: 2 },
                },
              },
            },
          },
        },
        definitions: {
          User: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "integer", minimum: 0, exclusiveMinimum: true },
            },
          },
          Missing: {
            type: "object",
            required: ["error"],
            properties: { error: string },
          },
        },
      }),
    );

    const generator = new CodeGenerator(
      $.path("api.json"),
      $.path("generated"),
      {},
    );
    expect((await generator.generateClient()).sort()).toEqual([
      "index.ts",
      "response-validators.ts",
      "types/definitions/Missing.ts",
      "types/definitions/User.ts",
    ]);

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
      const built = new URL(`../../client/dist/${module}.js`, import.meta.url);
      await $.add(
        `node_modules/@counterfact/client/${module}.js`,
        `export * from ${JSON.stringify(built.href)};`,
      );
    }

    await $.add(
      "consumer.ts",
      `
      import assert from "node:assert/strict";
      import { createClient, createSdk } from "./generated/index.js";

      createClient();
      createSdk();
      const config = (response: Response) => ({
        auth: { basic: () => ({ username: "root", password: "secret" }) },
        fetch: (async (input, init) => {
          const url = new URL(String(input));
          assert.equal(url.origin, "https://example.test");
          assert.equal(url.pathname, "/v2/users/42");
          assert.equal(url.search, "?csv=a,b&multi=a&multi=b&pipes=a|b&tab=a%09b&space=a%20b");
          assert.equal(new Headers(init?.headers).get("X-Values"), "a\\tb");
          assert.equal(new Headers(init?.headers).get("Authorization"), "Basic cm9vdDpzZWNyZXQ=");
          return response;
        }) satisfies typeof fetch,
      });
      const query = { csv: ["a", "b"], multi: ["a", "b"], pipes: ["a", "b"],
        tab: ["a", "b"], space: ["a", "b"] };
      const headers = { "X-Values": ["a", "b"] };
      const route = createClient(config(Response.json({ id: 42 })));
      const fluent = await route("/users/{id}").method("get")
        .path({ id: 42 }).query(query).headers(headers).send();
      if (fluent.matchedStatus === "200") {
        const id: number = fluent.body.id;
        assert.equal(id, 42);
      }
      const result = await createSdk(config(Response.json({ error: "missing" }, { status: 404 })))
        .users.getUser(42, { query, headers });
      if (result.matchedStatus !== "404") throw new Error("Expected 404");
      const error: string = result.body.error;
      assert.equal(error, "missing");
      await assert.rejects(
        createSdk(config(Response.json({ id: 0 }))).users.getUser(42, { query, headers }),
        { reason: "schema-mismatch" },
      );
      const credentials = createSdk({
        auth: {
          oauth: ({ scopes }) => {
            assert.deepEqual(scopes, ["users:read"]);
            return "token";
          },
        },
        fetch: async (_, init) => {
          assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer token");
          return Response.json({ id: 42 });
        },
      });
      await credentials.users.getUser(42);
      await createSdk({
        auth: { key: () => "api-key" },
        fetch: async (_, init) => {
          assert.equal(new Headers(init?.headers).get("X-Key"), "api-key");
          return Response.json({ id: 42 });
        },
      }).users.getUser(42);
      await assert.rejects(
        createSdk({ auth: { basic: () => ({ username: "bad:name", password: "secret" }) } })
          .users.getUser(42),
        { name: "RequestAuthenticationError" },
      );

      const api = createSdk({ baseUrl: "https://override.test", fetch: async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.origin, "https://override.test");
        const headers = new Headers(init?.headers);
        if (url.pathname === "/users") {
          assert.equal(headers.get("Content-Type"), "application/json");
          assert.equal(init?.body, '{"id":42}');
        } else if (url.pathname === "/form") {
          assert.equal(String(init?.body), "tags=one&tags=two");
        } else if (url.pathname === "/upload") {
          assert.ok(init?.body instanceof FormData);
          assert.equal(headers.has("Content-Type"), false);
          assert.equal(init.body.get("labels"), "a|b");
          assert.equal(await (init.body.get("photo") as Blob).text(), "file");
        } else if (url.pathname === "/download") {
          return new Response("file", { headers: { "Content-Type": "application/octet-stream" } });
        } else if (url.pathname === "/text") {
          return new Response("x", { headers: { "Content-Type": "text/plain" } });
        }
        return new Response(null, { status: 204 });
      } });
      await api.users.postUser({ body: { id: 42 } });
      assert.equal((await api.form.postForm({ body: { tags: ["one", "two"] } })).body, undefined);
      await api.upload.uploadFile({ body: { photo: new Blob(["file"]), labels: ["a", "b"] } });
      const downloaded = await api.download.downloadFile.stream();
      assert.equal(await new Response(downloaded.body).text(), "file");
      await assert.rejects(api.text.getText(), { reason: "schema-mismatch" });
      if (false) {
        // @ts-expect-error numeric path parameters stay typed
        api.users.getUser("42");
        // @ts-expect-error a form file is required
        api.upload.uploadFile({ body: { labels: ["x"] } });
        // @ts-expect-error request body is typed from Swagger definitions
        api.users.postUser({ body: { id: "42" } });
        // @ts-expect-error Basic credentials are a username/password object
        createSdk({ auth: { basic: () => "secret" } });
      }
    `,
    );
    const resolve = (relative: string) =>
      fileURLToPath(new URL(relative, import.meta.url));
    const program = ts.createProgram([$.path("consumer.ts")], {
      strict: true,
      skipLibCheck: true,
      noEmitOnError: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      typeRoots: [resolve("../../../node_modules/@types")],
      types: ["node"],
      paths: {
        "@counterfact/client/fetch": [resolve("../../client/dist/fetch.d.ts")],
        "@counterfact/client/validation-helpers": [
          resolve("../../client/dist/validation-helpers.d.ts"),
        ],
      },
    });
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        ),
    ).toEqual([]);
    expect(program.emit().emitSkipped).toBe(false);
    execFileSync(
      process.execPath,
      ["--disallow-code-generation-from-strings", "consumer.js"],
      {
        cwd: $.path(""),
        stdio: "pipe",
      },
    );
  });
});
