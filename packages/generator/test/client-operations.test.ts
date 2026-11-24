import {
  camelCase,
  collectClientModules,
  pascalCase,
  uniqueName,
  type ClientGroupingOptions,
} from "../src/client-operations.js";
import { Requirement } from "../src/requirement.js";
import { Specification } from "../src/specification.js";

function specificationFor(document: Record<string, unknown>): Specification {
  const specification = new Specification();
  specification.rootRequirement = new Requirement(document, "#", specification);
  return specification;
}

function modulesFor(
  document: Record<string, unknown>,
  options: ClientGroupingOptions = {},
) {
  return collectClientModules(specificationFor(document), options);
}

function operationNamesByModule(
  document: Record<string, unknown>,
  options: ClientGroupingOptions = {},
) {
  return Object.fromEntries(
    modulesFor(document, options).map((module) => [
      module.name,
      module.operations.map((operation) => operation.name),
    ]),
  );
}

const ok = { 200: { description: "OK" } };

describe("client naming helpers", () => {
  it.each([
    ["list_users", "listUsers"],
    ["ListUsers", "listUsers"],
    ["get-user-by-id", "getUserById"],
    ["getHTTPStatus", "getHTTPStatus"],
    ["delete", "delete_"],
    ["2fa", "_2fa"],
  ])("camelCases %s as %s", (input, expected) => {
    expect(camelCase(input)).toBe(expected);
  });

  it.each([
    ["explodable-parameters", "ExplodableParameters"],
    ["user accounts", "UserAccounts"],
    ["123", "_123"],
  ])("PascalCases %s as %s", (input, expected) => {
    expect(pascalCase(input)).toBe(expected);
  });

  it("uses the fallback for text without identifier characters", () => {
    expect(camelCase("!!!", "root")).toBe("root");
    expect(pascalCase("", "Root")).toBe("Root");
  });

  it("numbers names that are already taken, ignoring case", () => {
    const taken = new Set<string>();

    expect(uniqueName("users", taken)).toBe("users");
    expect(uniqueName("Users", taken)).toBe("Users2");
    expect(uniqueName("users", taken)).toBe("users3");
  });
});

describe("collectClientModules", () => {
  it("groups operations by their first path segment, with root operations in Root", () => {
    expect(
      operationNamesByModule({
        paths: {
          "/": { get: { responses: ok } },
          "/users": {
            get: { operationId: "listUsers", responses: ok },
            post: { operationId: "create_user", responses: ok },
          },
          "/users/{id}": { get: { operationId: "getUser", responses: ok } },
          "/explodable-parameters": { get: { responses: ok } },
        },
      }),
    ).toEqual({
      Root: ["rootList"],
      Users: ["listUsers", "createUser", "getUser"],
      ExplodableParameters: ["explodableParametersList"],
    });
  });

  it("names operations without an operationId from their path and method", () => {
    expect(
      operationNamesByModule({
        paths: {
          "/pets": {
            get: { responses: ok },
            post: { responses: ok },
          },
          "/pets/{petId}": {
            get: { responses: ok },
            put: { responses: ok },
            patch: { responses: ok },
            delete: { responses: ok },
            options: { responses: ok },
          },
          "/pets/{petId}/toys": { get: { responses: ok } },
        },
      }),
    ).toEqual({
      Pets: [
        "petsList",
        "petsCreate",
        "petsDetail",
        "petsUpdate",
        "petsPartialUpdate",
        "petsDelete",
        "petsOptions",
        "petsToysList",
      ],
    });
  });

  it("groups by a later path segment with moduleNameIndex", () => {
    expect(
      operationNamesByModule(
        {
          paths: {
            "/v1/accounts": {
              get: { operationId: "listAccounts", responses: ok },
            },
            "/v1/{tenant}/payments": {
              get: { operationId: "listPayments", responses: ok },
            },
            "/v1": { get: { operationId: "version", responses: ok } },
          },
        },
        { moduleNameIndex: 1 },
      ),
    ).toEqual({
      Accounts: ["listAccounts"],
      Tenant: ["listPayments"],
      Root: ["version"],
    });
  });

  it("groups by the first tag with moduleNameFirstTag, falling back to the path", () => {
    expect(
      operationNamesByModule(
        {
          paths: {
            "/users": {
              get: {
                operationId: "listUsers",
                tags: ["user accounts", "admin"],
                responses: ok,
              },
            },
            "/pets": { get: { operationId: "listPets", responses: ok } },
            "/toys": {
              get: { operationId: "listToys", tags: ["???"], responses: ok },
            },
          },
        },
        { moduleNameFirstTag: true },
      ),
    ).toEqual({
      UserAccounts: ["listUsers"],
      Pets: ["listPets"],
      Toys: ["listToys"],
    });
  });

  it("keeps module names and member names from colliding with generated names", () => {
    expect(
      operationNamesByModule({
        paths: {
          "/http-client": { get: { operationId: "http", responses: ok } },
          "/routes": {
            get: { operationId: "list", responses: ok },
            post: { operationId: "List", responses: ok },
            put: { operationId: "constructor", responses: ok },
            delete: { operationId: "!!!", responses: ok },
          },
        },
      }),
    ).toEqual({
      HttpClientModule: ["http2"],
      RoutesModule: ["list", "list2", "constructor2", "routesDelete"],
    });
  });

  it("describes path, query and body parameters, merging path-level parameters", () => {
    const [module] = modulesFor({
      paths: {
        "/users/{user-id}/posts/{postId}": {
          parameters: [
            { $ref: "#/components/parameters/UserId" },
            { in: "query", name: "page", schema: { type: "integer" } },
          ],
          get: {
            operationId: "listPosts",
            parameters: [
              { in: "query", name: "page", required: true, schema: {} },
              { in: "header", name: "X-Trace", schema: {} },
            ],
            responses: ok,
          },
          post: {
            operationId: "createPost",
            parameters: [
              { in: "query", name: "draft", schema: { type: "boolean" } },
            ],
            requestBody: {
              content: { "application/json": { schema: {} } },
            },
            responses: ok,
          },
        },
      },
      components: {
        parameters: {
          UserId: {
            in: "path",
            name: "user-id",
            required: true,
            schema: { type: "string" },
          },
        },
      },
    });

    expect(module?.operations).toEqual([
      expect.objectContaining({
        name: "listPosts",
        body: undefined,
        pathParameters: [
          { name: "user-id", declared: true },
          { name: "postId", declared: false },
        ],
        query: { required: true },
      }),
      expect.objectContaining({
        name: "createPost",
        body: { contentType: "Json", required: false },
        query: { required: false },
      }),
    ]);
  });

  it.each([
    [{ "application/vnd.api+json": {} }, "JsonApi"],
    [{ "application/problem+json": {} }, "Json"],
    [{ "multipart/form-data": {} }, "FormData"],
    [{ "application/x-www-form-urlencoded": {} }, "UrlEncoded"],
    [{ "text/plain; charset=utf-8": {} }, "Text"],
    [{ "application/octet-stream": {} }, undefined],
  ])("maps request content %j to ContentType %s", (content, contentType) => {
    const [module] = modulesFor({
      paths: {
        "/upload": {
          post: { requestBody: { content }, responses: ok },
        },
      },
    });

    expect(module?.operations[0]?.body).toEqual({
      contentType,
      required: false,
    });
  });

  it("follows referenced request bodies", () => {
    const [module] = modulesFor({
      paths: {
        "/upload": {
          post: {
            requestBody: { $ref: "#/components/requestBodies/Upload" },
            responses: ok,
          },
        },
      },
      components: {
        requestBodies: {
          Upload: { required: true, content: { "multipart/form-data": {} } },
        },
      },
    });

    expect(module?.operations[0]?.body).toEqual({
      contentType: "FormData",
      required: true,
    });
  });

  it.each([
    [{ "application/json": {} }, "json"],
    [{ "text/csv": {} }, "text"],
    [{ "image/png": {} }, "blob"],
  ])("reads %j responses with format %s", (content, format) => {
    const [module] = modulesFor({
      paths: {
        "/report": {
          get: {
            responses: {
              200: { description: "OK", content },
              400: { description: "Bad", content: { "application/json": {} } },
            },
          },
        },
      },
    });

    expect(module?.operations[0]?.format).toBe(format);
  });

  it("does not parse responses without content", () => {
    const [module] = modulesFor({
      paths: {
        "/thing": {
          delete: {
            responses: {
              204: { $ref: "#/components/responses/NoContent" },
              default: {
                description: "Error",
                content: { "application/json": {} },
              },
            },
          },
        },
      },
      components: { responses: { NoContent: { description: "Gone" } } },
    });

    expect(module?.operations[0]?.format).toBeUndefined();
  });

  it("describes Swagger 2.0 bodies, form data and response formats", () => {
    const document = {
      swagger: "2.0",
      consumes: ["application/json"],
      produces: ["application/json"],
      paths: {
        "/pets": {
          post: {
            parameters: [
              { in: "body", name: "pet", required: true, schema: {} },
            ],
            responses: { 200: { description: "OK", schema: {} } },
          },
          put: {
            consumes: ["multipart/form-data"],
            produces: ["text/plain"],
            parameters: [{ in: "formData", name: "file", type: "file" }],
            responses: { 200: { description: "OK", schema: {} } },
          },
          patch: {
            consumes: [],
            produces: [],
            parameters: [{ in: "body", name: "pet", schema: {} }],
            responses: { 200: { description: "OK", schema: {} } },
          },
          get: {
            parameters: [{ in: "formData", name: "name", type: "string" }],
            responses: { 200: { description: "OK" } },
          },
        },
      },
    };

    expect(
      modulesFor(document)[0]?.operations.map(({ body, format }) => ({
        body,
        format,
      })),
    ).toEqual([
      { body: { contentType: "Json", required: true }, format: "json" },
      { body: { contentType: "FormData", required: false }, format: "text" },
      { body: { contentType: "Json", required: false }, format: "json" },
      {
        body: { contentType: "UrlEncoded", required: false },
        format: undefined,
      },
    ]);
  });

  it("marks operations secure from operation or document security", () => {
    const paths = {
      "/a": {
        get: { operationId: "inherits", responses: ok },
        post: { operationId: "optOut", security: [], responses: ok },
        put: {
          operationId: "anonymousAllowed",
          security: [{}],
          responses: ok,
        },
        delete: {
          operationId: "own",
          security: [{ bearer: [] }],
          responses: ok,
        },
      },
    };
    const secureNames = (document: Record<string, unknown>) =>
      modulesFor(document)[0]
        ?.operations.filter(({ secure }) => secure)
        .map(({ name }) => name);

    expect(secureNames({ paths, security: [{ bearer: [] }] })).toEqual([
      "inherits",
      "own",
    ]);
    expect(secureNames({ paths })).toEqual(["own"]);
  });

  it("copies documentation for JSDoc", () => {
    const [module] = modulesFor({
      paths: {
        "/legacy": {
          get: {
            summary: "Old endpoint",
            description: "Use /new instead",
            deprecated: true,
            tags: ["legacy"],
            responses: ok,
          },
        },
      },
    });

    expect(module?.operations[0]).toEqual(
      expect.objectContaining({
        deprecated: true,
        description: "Use /new instead",
        summary: "Old endpoint",
        tags: ["legacy"],
      }),
    );
  });

  it("follows referenced path items and includes additional operations", () => {
    expect(
      operationNamesByModule({
        paths: {
          "/files": { $ref: "#/components/pathItems/Files" },
        },
        components: {
          pathItems: {
            Files: {
              get: { operationId: "listFiles", responses: ok },
              additionalOperations: {
                COPY: { operationId: "copyFiles", responses: ok },
              },
            },
          },
        },
      }),
    ).toEqual({ Files: ["listFiles", "copyFiles"] });
  });

  it("returns no modules when there are no paths", () => {
    expect(modulesFor({ openapi: "3.1.0" })).toEqual([]);
  });
});
