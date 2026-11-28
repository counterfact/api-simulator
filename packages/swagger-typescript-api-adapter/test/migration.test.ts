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
    "/upload": {
      post: {
        operationId: "uploadFiles",
        security: [],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: { $ref: "#/components/schemas/Upload" },
              encoding: {
                file: { contentType: "image/png" },
                metadata: { contentType: "application/xml, application/json" },
                "extra/data": { contentType: "application/json" },
              },
            },
          },
        },
        responses: { 204: { description: "Uploaded" } },
      },
    },
    "/users/sub/{id}": {
      get: {
        parameters: [parameter("id", "path", integer)],
        responses: { 204: { description: "Empty" } },
      },
    },
    "/downloads/image": {
      get: {
        operationId: "downloadImage",
        security: [],
        responses: {
          200: {
            description: "An image",
            content: {
              "image/png": { schema: { type: "string", format: "binary" } },
            },
          },
        },
      },
    },
    "/downloads/report": {
      get: {
        operationId: "downloadReport",
        security: [],
        responses: {
          200: {
            description: "A report",
            content: {
              "application/json": { schema: user },
              "text/plain": { schema: text },
            },
          },
        },
      },
    },
    "/downloads/fallback": {
      get: {
        operationId: "downloadFallback",
        security: [],
        responses: {
          default: { description: "Default report", content: json(user) },
        },
      },
    },
    "/downloads/range": {
      get: {
        operationId: "downloadRange",
        security: [],
        responses: {
          "2XX": { description: "Report", content: json(user) },
          default: { description: "Unexpected result", content: json(text) },
        },
      },
    },
  },
  components: {
    securitySchemes: { token: { type: "http", scheme: "bearer" } },
    schemas: {
      User: { type: "object", required: ["id"], properties: { id: integer } },
      Upload: {
        type: "object",
        required: ["file", "attachments", "metadata"],
        properties: {
          file: { $ref: "#/components/schemas/Binary" },
          attachments: {
            type: "array",
            items: { $ref: "#/components/schemas/Binary" },
          },
          metadata: {
            type: "object",
            required: ["count"],
            properties: { count: integer },
          },
          tags: { type: "array", items: text },
          "extra/data": {},
          optional: text,
          alternate: {
            oneOf: [{ $ref: "#/components/schemas/Binary" }, integer],
          },
        },
      },
      Binary: { type: "string", format: "binary" },
    },
  },
};

const legacyUser = { $ref: "#/definitions/User" };
const swagger = {
  swagger: "2.0",
  info: spec.info,
  host: "example.test",
  schemes: ["https"],
  basePath: "/api",
  consumes: ["application/json"],
  produces: ["application/json"],
  security: spec.security,
  securityDefinitions: {
    token: { type: "apiKey", in: "header", name: "Authorization" },
  },
  definitions: { User: spec.components.schemas.User },
  paths: {
    "/": spec.paths["/"],
    "/users/{id}": {
      parameters: [{ name: "id", in: "path", required: true, ...integer }],
      get: {
        operationId: "getUser",
        parameters: [
          {
            name: "tag",
            in: "query",
            type: "array",
            items: text,
            collectionFormat: "multi",
          },
        ],
        responses: {
          200: { description: "User", schema: legacyUser },
          404: { description: "Error", schema: text },
        },
      },
    },
    "/users": {
      post: {
        parameters: [
          { name: "unit", in: "query", ...text },
          { name: "body", in: "body", required: true, schema: legacyUser },
        ],
        responses: { 200: { description: "User", schema: legacyUser } },
      },
    },
    "/users/sub/{id}": {
      get: {
        parameters: [{ name: "id", in: "path", required: true, ...integer }],
        responses: spec.paths["/users/sub/{id}"].get.responses,
      },
    },
  },
};

const verifyMultipart = `
  let calls = 0;
  const options = {
    baseUrl: "https://example.test",
    fetch: (async (input, init) => {
      const request = new Request(input, init);
      assert.match(request.headers.get("content-type") ?? "", /^multipart\\/form-data; boundary=/);
      if (calls < 2) {
        assert.ok((await request.clone().text()).includes(
          'Content-Disposition: form-data; name="metadata"\\r\\nContent-Type: application/json\\r\\n',
        ));
      }
      const form = await request.formData();
      const file = form.get("file");
      assert.ok(file instanceof Blob);
      assert.equal(file.type, calls < 2 ? "image/png" : "application/octet-stream");
      assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [255, 0]);
      const [first, second] = form.getAll("attachments");
      assert.ok(first instanceof File);
      assert.equal(first.name, "notes.txt");
      assert.equal(first.type, "text/plain");
      assert.equal(await first.text(), "hello");
      assert.ok(second instanceof Blob);
      assert.equal(second.type, "application/octet-stream");
      assert.deepEqual([...new Uint8Array(await second.arrayBuffer())], [128, 5]);
      assert.equal(form.get("metadata"), '{"count":2}');
      assert.equal(form.get("extra/data"), '{"nested":true}');
      assert.equal(form.get("alternate"), "7");
      assert.deepEqual(form.getAll("tags"), calls < 2 ? ["a", "b"] : ['["a","b"]']);
      calls += 1;
      return new Response(null, { status: 204 });
    }) satisfies typeof fetch,
  };
  const body = {
    file: new Uint8Array([9, 255, 0, 8]).subarray(1, 3),
    attachments: [new File(["hello"], "notes.txt", { type: "text/plain" }), new Uint8Array([128, 5])],
    metadata: { count: 2 },
    "extra/data": { nested: true },
    tags: ["a", "b"],
    alternate: 7,
  };
  const route = createClient(options)("/upload").method("post");
  const sdk = createSdk(options);
  const Api = wrapSta(createSdk);
  const sta = new Api({
    baseUrl: options.baseUrl,
    customFetch: options.fetch,
    baseApiParams: { headers: { "Content-Type": "application/json" } },
  });
  await route.body(body).send();
  await sdk.upload.uploadFiles({ body });
  await sta.upload.uploadFiles(body);
  assert.equal(calls, 3);

  if (false) {
    // @ts-expect-error the named SDK requires the file
    sdk.upload.uploadFiles({ body: { attachments: [], metadata: { count: 0 } } });
    // @ts-expect-error binary parts must be bytes or a Blob
    route.body({ ...body, file: 42 });
    // @ts-expect-error multipart metadata is typed too
    route.body({ ...body, metadata: { count: "2" } });
    // Explicit FormData is still accepted.
    route.body(new FormData());
  }
`;

const verifyAdapterResponseTypes = `
  const DownloadApi = wrapSta(createSdk);
  const customFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/image"))
      return new Response(new Uint8Array([137, 80]), { headers: { "content-type": "image/png" } });
    if (url.endsWith("/report"))
      return new Response("hello", { headers: { "content-type": "text/plain; charset=utf-8" } });
    return Response.json({ id: 42 }, { status: 202 });
  };
  const downloads = new DownloadApi({
    baseUrl: "https://example.test",
    customFetch,
  }).downloads;
  const image: Blob = (await downloads.downloadImage()).data;
  assert.equal(image.type, "image/png");
  assert.deepEqual([...new Uint8Array(await image.arrayBuffer())], [137, 80]);
  const report: string | { id: number } = (await downloads.downloadReport()).data;
  assert.equal(report, "hello");
  const fallback: { id: number } = (await downloads.downloadFallback()).data;
  assert.equal(fallback.id, 42);
  const range: { id: number } = (await downloads.downloadRange()).data;
  assert.equal(range.id, 42);

  const { definition } = createSdk;
  const CollisionApi = wrapSta({ definition: {
    ...definition,
    names: { ...definition.names, http: definition.names.downloads, request: definition.names.downloads },
  }});
  const colliding = new CollisionApi({ baseUrl: "https://example.test", customFetch });
  assert.equal((await colliding.http.downloadFallback()).data.id, 42);
  assert.equal((await colliding.request.downloadFallback()).data.id, 42);
  assert.equal((await colliding.downloads.downloadFallback()).data.id, 42);
  if (false) {
    // @ts-expect-error the generated http group replaces the public transport accessor
    colliding.http.abortRequest("token");
  }

  const UnwrappedDownloadApi = wrapSta(createSdk, { unwrapResponseData: true });
  const unwrapped = new UnwrappedDownloadApi({
    baseUrl: "https://example.test",
    customFetch,
  });
  assert.equal(await unwrapped.downloads.downloadReport(), "hello");
  assert.equal((await unwrapped.downloads.downloadFallback()).id, 42);
`;

const verifyRawMultipartTypes = `
  if (false) {
    const raw = { ...body, attachment: new File(["file"], "file.txt") };
    route.body(raw);
    sdk.upload.uploadFiles({ body: raw });
    sta.upload.uploadFiles(raw);
    // @ts-expect-error a typeless OpenAPI 3.1+ raw part requires bytes or a Blob
    route.body({ ...raw, attachment: 42 });
    // @ts-expect-error the named SDK also checks the raw part
    sdk.upload.uploadFiles({ body: { ...raw, attachment: 42 } });
    // @ts-expect-error the adapter also checks the raw part
    sta.upload.uploadFiles({ ...raw, attachment: 42 });
    // @ts-expect-error a contentMediaType raw part requires bytes or a Blob in the adapter
    sta.upload.uploadFiles({ ...raw, file: 42 });
  }
`;

const dist = (path: string) => fileURLToPath(new URL(path, import.meta.url));

it.each([
  { singleHttpClient: false, unwrapResponseData: false },
  { singleHttpClient: true, unwrapResponseData: false },
  { singleHttpClient: false, unwrapResponseData: true },
  { singleHttpClient: true, unwrapResponseData: true },
  { singleHttpClient: false, unwrapResponseData: false, swagger2: true },
  {
    singleHttpClient: false,
    unwrapResponseData: false,
    openapiVersion: "3.1.0",
  },
  {
    singleHttpClient: false,
    unwrapResponseData: false,
    openapiVersion: "3.2.0",
  },
])(
  "runs the same STA consumer with %j",
  async ({ swagger2, openapiVersion, ...options }) => {
    await usingTemporaryFiles(async ($) => {
      await $.add("package.json", '{"type":"module"}');
      await $.add(
        "spec.json",
        JSON.stringify(
          swagger2
            ? swagger
            : openapiVersion
              ? {
                  ...spec,
                  openapi: openapiVersion,
                  components: {
                    ...spec.components,
                    schemas: {
                      ...spec.components.schemas,
                      Binary: { contentMediaType: "application/pdf" },
                      RawFile: {},
                      Upload: {
                        ...spec.components.schemas.Upload,
                        properties: {
                          ...spec.components.schemas.Upload.properties,
                          attachment: { $ref: "#/components/schemas/RawFile" },
                        },
                      },
                    },
                  },
                }
              : spec,
        ),
      );
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
        import { createClient, createSdk } from "./native/index.js";
        import { wrapSta } from "swagger-typescript-api-adapter";
        const api = createSdk({
          baseUrl: "https://example.test",
          auth: { token: () => "secret" },
          fetch: async () => Response.json({ id: "wrong type" }),
        });
        await assert.rejects(api.users.getUser(99), { reason: "schema-mismatch" });
        ${swagger2 ? "" : verifyMultipart}
        ${swagger2 ? "" : verifyAdapterResponseTypes}
        ${openapiVersion ? verifyRawMultipartTypes : ""}
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
