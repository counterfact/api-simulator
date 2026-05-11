import { describe, expect, it } from "@jest/globals";
import { format as formatCode } from "prettier";

import {
  OperationTypeCoder,
  VersionedArgTypeCoder,
} from "../../src/typescript-generator/operation-type-coder.js";
import { Repository } from "../../src/typescript-generator/repository.js";
import { Requirement } from "../../src/typescript-generator/requirement.js";
import { Specification } from "../../src/typescript-generator/specification.js";

function format(code) {
  return formatCode(code, { parser: "typescript" });
}

const dummyScript = {
  export(coder) {
    // Safely return the first name from the coder's names generator, if available
    const getNames =
      coder && typeof coder.names === "function" ? coder.names() : undefined;
    if (!getNames || typeof getNames.next !== "function") {
      return undefined;
    }
    const result = getNames.next();
    if (!result || result.done) {
      return undefined;
    }
    return result.value;
  },

  import() {
    return "schema";
  },

  importDefault() {
    return "default";
  },

  importExternalType() {
    return "ExternalType";
  },

  importSharedType() {
    return "SharedType";
  },

  importType() {
    return "Type";
  },

  path: ".",
};

describe("an OperationTypeCoder", () => {
  it("generates a list of potential names", () => {
    const coder = new OperationTypeCoder(
      new Requirement({}, "#/paths/hello/get"),
      "",
      "get",
    );

    const [one, two, three] = coder.names();

    expect([one, two, three]).toStrictEqual([
      "HTTP_GET",
      "HTTP_GET2",
      "HTTP_GET3",
    ]);
  });

  describe("getOperationBaseName", () => {
    it("falls back to HTTP method when operationId is absent", () => {
      const coder = new OperationTypeCoder(
        new Requirement({}, "#/paths/hello/get"),
        "",
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("HTTP_GET");
    });

    it("returns a plain operationId unchanged", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "getUser" }, "#/paths/hello/get"),
        "",
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("getUser");
    });

    it("converts hyphenated operationId to camelCase", () => {
      const coder = new OperationTypeCoder(
        new Requirement(
          { operationId: "get-user-profile" },
          "#/paths/hello/get",
        ),
        "",
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("getUserProfile");
    });

    it("converts dot-separated operationId to camelCase", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "user.get" }, "#/paths/hello/get"),
        "",
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("userGet");
    });

    it("converts space-separated operationId to camelCase", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "get user" }, "#/paths/hello/get"),
        "",
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("getUser");
    });

    it("camelCases across non-identifier characters", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "get@user!" }, "#/paths/hello/get"),
        "",
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("getUser");
    });

    it("prefixes with underscore when operationId starts with a digit", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "123getUser" }, "#/paths/hello/get"),
        "",
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("_123getUser");
    });

    it("appends underscore when operationId is a reserved word", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "delete" }, "#/paths/stuff/delete"),
        "",
        "delete",
      );

      expect(coder.getOperationBaseName()).toBe("delete_");
    });

    it("appends underscore when operationId is another reserved word", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "import" }, "#/paths/stuff/post"),
        "",
        "post",
      );

      expect(coder.getOperationBaseName()).toBe("import_");
    });

    it("appends underscore when operationId is await", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "await" }, "#/paths/stuff/get"),
        "",
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("await_");
    });
    it("appends underscore when operationId becomes a reserved word after stripping trailing non-identifier chars", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "delete!!" }, "#/paths/stuff/delete"),
        "",
        "delete",
      );

      expect(coder.getOperationBaseName()).toBe("delete_");
    });

    it("does not append underscore when operationId already has a suffix making it non-reserved", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "deleteItem" }, "#/paths/stuff/delete"),
        "",
        "delete",
      );

      expect(coder.getOperationBaseName()).toBe("deleteItem");
    });
  });

  it("creates a type declaration", () => {
    const coder = new OperationTypeCoder(
      new Requirement({}, "#/paths/hello/get"),
      "",
      "get",
    );

    expect(coder.typeDeclaration(undefined, dummyScript)).toBe("");
  });

  it("returns the module path", () => {
    const coder = new OperationTypeCoder(
      new Requirement({}, "#/paths/hello~1world/get"),
      "",
      "get",
    );

    expect(coder.modulePath()).toBe("types/paths/hello/world.types.ts");
  });

  it("returns the module path for /", () => {
    const coder = new OperationTypeCoder(
      new Requirement({}, "#/paths/~1/get"),
      "",
      "get",
    );

    expect(coder.modulePath()).toBe("types/paths/index.types.ts");
  });

  it("generates a complex post operation", async () => {
    const requirement = new Requirement(
      {
        parameters: [
          { in: "path", name: "id", schema: { type: "string" } },
          { in: "query", name: "name", schema: { type: "string" } },
          { in: "header", name: "name", schema: { type: "string" } },
        ],

        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Example" },
            },
          },
        },

        responses: {
          200: {
            content: {
              "application/json": {
                examples: {
                  "first-example": {
                    value: "first",
                  },

                  "second-example": {
                    value: "second",
                  },
                },

                schema: { $ref: "#/components/schemas/Example" },
              },
            },
          },

          400: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },

          default: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
      "#/paths/hello/post",
    );

    const coder = new OperationTypeCoder(requirement, "", "get");

    await expect(
      format(`type TestType = ${coder.write(dummyScript)}`),
    ).resolves.toMatchSnapshot();
  });

  it("generates a complex post operation (OpenAPI 2)", async () => {
    const requirement = new Requirement(
      {
        consumes: ["application/json"],

        parameters: [
          { in: "path", name: "id", type: "string" },
          { in: "query", name: "name", type: "string" },
          { in: "header", name: "name", type: "string" },
          {
            in: "body",
            name: "body",
            schema: { $ref: "#/components/schemas/Example" },
          },
        ],

        produces: ["application/json"],

        responses: {
          200: {
            schema: { $ref: "#/components/schemas/Example" },
          },

          400: {
            schema: { $ref: "#/components/schemas/Error" },
          },

          default: {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      "#/paths/hello/post",
    );

    const coder = new OperationTypeCoder(requirement, "", "get");

    await expect(
      format(`type TestType = ${coder.write(dummyScript)}`),
    ).resolves.toMatchSnapshot();
  });

  it("generates a complex post operation (OpenAPI 2, consumes in root)", async () => {
    const requirement = new Requirement(
      {
        parameters: [
          { in: "path", name: "id", type: "string" },
          { in: "query", name: "name", type: "string" },
          { in: "header", name: "name", type: "string" },
          {
            in: "body",
            name: "body",
            schema: { $ref: "#/components/schemas/Example" },
          },
        ],

        produces: ["application/json"],

        responses: {
          200: {
            schema: { $ref: "#/components/schemas/Example" },
          },

          400: {
            schema: { $ref: "#/components/schemas/Error" },
          },

          default: {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      "#/paths/hello/post",
    );

    requirement.specification = {
      rootRequirement: new Requirement({
        consumes: ["application/json"],
      }),
    };

    const coder = new OperationTypeCoder(requirement, "", "get");

    await expect(
      format(`type TestType = ${coder.write(dummyScript)}`),
    ).resolves.toMatchSnapshot();
  });

  it("generates a complex post operation (OpenAPI 2 with produces at the root)", async () => {
    const specification = new Specification(
      new Requirement({
        produces: ["application/json"],
      }),
    );

    const requirement = new Requirement(
      {
        consumes: ["application/json"],

        parameters: [
          { in: "path", name: "id", type: "string" },
          { in: "query", name: "name", type: "string" },
          { in: "header", name: "name", type: "string" },
          {
            in: "body",
            name: "body",
            schema: { $ref: "#/components/schemas/Example" },
          },
        ],

        produces: ["application/json"],

        responses: {
          200: {
            schema: { $ref: "#/components/schemas/Example" },
          },

          400: {
            schema: { $ref: "#/components/schemas/Error" },
          },

          default: {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      "#/paths/hello/post",
      specification,
    );

    const coder = new OperationTypeCoder(requirement, "", "get");

    await expect(
      format(`type TestType = ${coder.write(dummyScript)}`),
    ).resolves.toMatchSnapshot();
  });

  it("generates a simple get operation", async () => {
    const requirement = new Requirement(
      {
        responses: {
          default: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Example" },
              },
            },
          },
        },
      },
      "#/paths/hello/get",
    );

    const coder = new OperationTypeCoder(requirement, "", "get");

    await expect(
      format(`type TestType =${coder.write(dummyScript)}`),
    ).resolves.toMatchSnapshot();
  });

  it("generates a simple get operation (OpenAPI 2)", async () => {
    const requirement = new Requirement(
      {
        produces: ["application/json"],

        responses: {
          default: {
            schema: { $ref: "#/components/schemas/Example" },
          },
        },
      },
      "#/paths/hello/get",
    );

    const coder = new OperationTypeCoder(requirement, "", "get");

    await expect(
      format(`type TestType =${coder.write(dummyScript)}`),
    ).resolves.toMatchSnapshot();
  });

  it("falls back to root level produces (OpenAPI 2)", async () => {
    const requirement = new Requirement(
      {
        produces: ["text/plain"],

        responses: {
          default: {
            schema: { $ref: "#/components/schemas/Example" },
          },
        },
      },
      "#/paths/hello/get",
    );

    const coder = new OperationTypeCoder(requirement, "", "get");

    await expect(
      format(`type TestType =${coder.write(dummyScript)}`),
    ).resolves.toMatchSnapshot();
  });

  it("generates an auth object for basic authentication", async () => {
    const requirement = new Requirement(
      {
        responses: {
          default: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Example" },
              },
            },
          },
        },
      },
      "#/paths/hello/get",
    );

    const coder = new OperationTypeCoder(requirement, "", "get", [
      {
        scheme: "basic",
        type: "http",
      },
    ]);

    await expect(
      format(`type TestType =${coder.write(dummyScript)}`),
    ).resolves.toMatchSnapshot();
  });

  it("uses operationId for type names when available", () => {
    const coder = new OperationTypeCoder(
      new Requirement({ operationId: "addPet" }, "#/paths/pet/post"),
      "",
      "post",
    );

    const [one, two, three] = coder.names();

    expect([one, two, three]).toStrictEqual(["addPet", "addPet2", "addPet3"]);
  });

  it("falls back to HTTP_METHOD when operationId is not available", () => {
    const coder = new OperationTypeCoder(
      new Requirement({}, "#/paths/pet/post"),
      "",
      "post",
    );

    const [one, two, three] = coder.names();

    expect([one, two, three]).toStrictEqual([
      "HTTP_POST",
      "HTTP_POST2",
      "HTTP_POST3",
    ]);
  });

  it("exports parameter types separately and references them", async () => {
    const requirement = new Requirement(
      {
        operationId: "searchPets",
        parameters: [
          { in: "query", name: "name", schema: { type: "string" } },
          { in: "path", name: "id", schema: { type: "string" } },
          { in: "header", name: "x-api-key", schema: { type: "string" } },
          { in: "cookie", name: "sessionId", schema: { type: "string" } },
        ],
        responses: {
          200: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Example" },
              },
            },
          },
        },
      },
      "#/paths/pet~1search~1{id}/get",
    );

    const scriptWithExportTracking = {
      ...dummyScript,
      exports: {},
      export(coder) {
        const name = coder.names().next().value;
        this.exports[name] = coder;
        return name;
      },
    };

    const coder = new OperationTypeCoder(requirement, "", "get");
    const result = coder.write(scriptWithExportTracking);

    // Verify that parameter types are exported
    expect(scriptWithExportTracking.exports).toHaveProperty("searchPets_Query");
    expect(scriptWithExportTracking.exports).toHaveProperty("searchPets_Path");
    expect(scriptWithExportTracking.exports).toHaveProperty(
      "searchPets_Headers",
    );
    expect(scriptWithExportTracking.exports).toHaveProperty(
      "searchPets_Cookie",
    );

    // Verify that the main type references the exported parameter types
    expect(result).toContain("query: searchPets_Query");
    expect(result).toContain("path: searchPets_Path");
    expect(result).toContain("headers: searchPets_Headers");
    expect(result).toContain("cookie: searchPets_Cookie");
  });

  it("does not export parameter types when they are 'never'", async () => {
    const requirement = new Requirement(
      {
        operationId: "getPet",
        responses: {
          200: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Example" },
              },
            },
          },
        },
      },
      "#/paths/pet/get",
    );

    const scriptWithExportTracking = {
      ...dummyScript,
      exports: {},
      export(coder) {
        const name = coder.names().next().value;
        this.exports[name] = coder;
        return name;
      },
    };

    const coder = new OperationTypeCoder(requirement, "", "get");
    const result = coder.write(scriptWithExportTracking);

    // Verify that parameter types are NOT exported when they are 'never'
    expect(scriptWithExportTracking.exports).not.toHaveProperty("getPet_Query");
    expect(scriptWithExportTracking.exports).not.toHaveProperty("getPet_Path");
    expect(scriptWithExportTracking.exports).not.toHaveProperty(
      "getPet_Headers",
    );
    expect(scriptWithExportTracking.exports).not.toHaveProperty(
      "getPet_Cookie",
    );

    // Verify that the main type uses 'never' directly
    expect(result).toContain("query: never");
    expect(result).toContain("path: never");
    expect(result).toContain("headers: never");
    expect(result).toContain("cookie: never");
  });

  it("generates a strongly-typed cookie object from cookie parameters", async () => {
    const requirement = new Requirement(
      {
        operationId: "getSession",
        parameters: [
          { in: "cookie", name: "sessionId", schema: { type: "string" } },
          { in: "cookie", name: "theme", schema: { type: "string" } },
        ],
        responses: {
          200: {
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
      "#/paths/session/get",
    );

    const scriptWithExportTracking = {
      ...dummyScript,
      exports: {},
      export(coder) {
        const name = coder.names().next().value;
        this.exports[name] = coder;
        return name;
      },
    };

    const coder = new OperationTypeCoder(requirement, "", "get");
    const result = coder.write(scriptWithExportTracking);

    expect(scriptWithExportTracking.exports).toHaveProperty(
      "getSession_Cookie",
    );
    expect(result).toContain("cookie: getSession_Cookie");
    expect(result).not.toContain("cookie: never");
  });

  it("uses 'unknown' body type when response content has no schema", () => {
    const requirement = new Requirement(
      {
        operationId: "createStuff",
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
        responses: {
          200: {
            content: {
              "application/json": {
                examples: {
                  "Example 1": { value: { stuffId: 123 } },
                },
              },
            },
          },
        },
      },
      "#/paths/stuff/post",
    );

    const coder = new OperationTypeCoder(requirement, "", "post");

    expect(() => coder.responseTypes(dummyScript)).not.toThrow();
    expect(coder.responseTypes(dummyScript)).toContain("body?: unknown");
  });

  // ---------------------------------------------------------------------------
  // Path-item-level parameters
  // ---------------------------------------------------------------------------

  it("includes path-level parameters when defined only at path item level", () => {
    const specification = new Specification();
    const rootRequirement = new Requirement(
      {
        paths: {
          "/stuff/{stuffId}": {
            parameters: [
              {
                in: "path",
                name: "stuffId",
                required: true,
                schema: { type: "string" },
              },
            ],
            get: {
              responses: { "204": { description: "successful" } },
            },
          },
        },
      },
      "spec.yaml",
      specification,
    );

    specification.rootRequirement = rootRequirement;

    // Navigate to the operation using the same escaped URL format the
    // code-generator uses (leading slash is escaped as ~1).
    const operationReq = rootRequirement.select(
      "paths/~1stuff~1{stuffId}/get",
    )!;

    const scriptWithExportTracking = {
      ...dummyScript,
      exports: {},
      export(coder) {
        const name = coder.names().next().value;
        this.exports[name] = coder;
        return name;
      },
    };

    const coder = new OperationTypeCoder(operationReq, "", "get");
    const result = coder.write(scriptWithExportTracking);

    // stuffId is defined at path level — it must NOT generate `path: never`
    expect(result).not.toContain("path: never");
    expect(scriptWithExportTracking.exports).toHaveProperty("HTTP_GET_Path");
    expect(result).toContain("path: HTTP_GET_Path");
  });

  it("generates a strongly-typed querystring type from a querystring parameter", () => {
    const requirement = new Requirement(
      {
        operationId: "searchItems",
        parameters: [
          {
            in: "querystring",
            name: "q",
            schema: {
              type: "object",
              properties: {
                filter: { type: "string" },
                page: { type: "integer" },
              },
            },
          },
        ],
        responses: {
          200: {
            content: {
              "application/json": {
                schema: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      "#/paths/items/get",
    );

    const scriptWithExportTracking = {
      ...dummyScript,
      exports: {},
      export(coder) {
        const name = coder.names().next().value;
        this.exports[name] = coder;
        return name;
      },
    };

    const coder = new OperationTypeCoder(requirement, "", "get");
    const result = coder.write(scriptWithExportTracking);

    expect(scriptWithExportTracking.exports).toHaveProperty(
      "searchItems_Querystring",
    );
    expect(result).toContain("querystring: searchItems_Querystring");
    expect(result).not.toContain("querystring: never");
  });

  it("uses querystring: never when no querystring parameter is present", () => {
    const requirement = new Requirement(
      {
        operationId: "listItems",
        parameters: [{ in: "query", name: "name", schema: { type: "string" } }],
        responses: {
          200: {
            content: {
              "application/json": {
                schema: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      "#/paths/items/get",
    );

    const coder = new OperationTypeCoder(requirement, "", "get");
    const result = coder.write(dummyScript);

    expect(result).toContain("querystring: never");
  });

  it("merges path-level and operation-level parameters (operation-level overrides)", () => {
    const specification = new Specification();
    const rootRequirement = new Requirement(
      {
        paths: {
          "/stuff/{stuffId}": {
            parameters: [
              // path-level: stuffId (string) – will be overridden by operation level
              {
                in: "path",
                name: "stuffId",
                required: true,
                schema: { type: "string" },
              },
              // path-level only: sharedQuery (string)
              {
                in: "query",
                name: "sharedQuery",
                schema: { type: "string" },
              },
            ],
            get: {
              parameters: [
                // operation-level: stuffId (number) – overrides path-level
                {
                  in: "path",
                  name: "stuffId",
                  required: true,
                  schema: { type: "number" },
                },
                // operation-level only: extraQuery (string)
                {
                  in: "query",
                  name: "extraQuery",
                  schema: { type: "string" },
                },
              ],
              responses: { "204": { description: "successful" } },
            },
          },
        },
      },
      "spec.yaml",
      specification,
    );

    specification.rootRequirement = rootRequirement;

    const operationReq = rootRequirement.select(
      "paths/~1stuff~1{stuffId}/get",
    )!;

    const scriptWithExportTracking = {
      ...dummyScript,
      exports: {},
      export(coder) {
        const name = coder.names().next().value;
        this.exports[name] = coder;
        return name;
      },
    };

    const coder = new OperationTypeCoder(operationReq, "", "get");
    const result = coder.write(scriptWithExportTracking);

    // Path type should be exported (not never)
    expect(result).not.toContain("path: never");
    // Query type should be exported (not never) — sharedQuery + extraQuery both present
    expect(result).not.toContain("query: never");
  });
});

// ---------------------------------------------------------------------------
// VersionedArgTypeCoder
// ---------------------------------------------------------------------------

describe("a VersionedArgTypeCoder", () => {
  const makeRequirement = (operationData = {}) =>
    new Requirement(
      {
        parameters: [],
        responses: { 200: {} },
        ...operationData,
      },
      "#/paths/pets/get",
    );

  it("includes the version in the exported name (e.g. HTTP_GET_$_v1)", () => {
    const coder = new VersionedArgTypeCoder(makeRequirement(), "v1", "get");

    const [first] = coder.names();

    expect(first).toBe("HTTP_GET_$_v1");
  });

  it("sanitizes the version when building the name", () => {
    const coder = new VersionedArgTypeCoder(
      makeRequirement(),
      "2.0-beta",
      "get",
    );

    const [first] = coder.names();

    // "2.0-beta" → sanitizeIdentifier → "_2Beta" (or similar safe identifier)
    expect(first).toMatch(/^HTTP_GET_\$_/u);
    expect(first).not.toMatch(/-|\./u);
  });

  it("writes to the per-version module path", () => {
    const coder = new VersionedArgTypeCoder(makeRequirement(), "v1", "get");

    expect(coder.modulePath()).toBe("types/v1/paths/pets.types.ts");
  });

  it("id includes the version so v1 and v2 are distinct cache entries", () => {
    const req = makeRequirement();
    const v1 = new VersionedArgTypeCoder(req, "v1", "get");
    const v2 = new VersionedArgTypeCoder(req, "v2", "get");

    expect(v1.id).not.toBe(v2.id);
    expect(v1.id).toContain("v1");
    expect(v2.id).toContain("v2");
  });

  it("write() on the per-version script calls writeCode() directly", () => {
    const coder = new VersionedArgTypeCoder(makeRequirement(), "v1", "get");
    const repository = new Repository();
    const perVersionScript = repository.get(coder.modulePath());

    // write() on the per-version file should produce the $ arg type string
    const result = coder.write(perVersionScript);

    expect(typeof result).toBe("string");
    expect(result).toContain("OmitValueWhenNever");
  });

  it("write() on the shared script delegates to importType()", () => {
    const coder = new VersionedArgTypeCoder(makeRequirement(), "v1", "get");
    const repository = new Repository();
    const sharedScript = repository.get("types/paths/pets.types.ts");

    let importTypeCalled = false;
    const originalImportType = sharedScript.importType.bind(sharedScript);

    sharedScript.importType = (c) => {
      importTypeCalled = true;
      return originalImportType(c);
    };

    coder.write(sharedScript);

    expect(importTypeCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// OperationTypeCoder — versioned output shape
// ---------------------------------------------------------------------------

describe("an OperationTypeCoder (versioned)", () => {
  const makeRequirement = () =>
    new Requirement(
      { parameters: [], responses: { 200: {} } },
      "#/paths/pets/get",
    );

  it("returns {raw: ''} from writeCode() so the normal export is suppressed", () => {
    const coder = new OperationTypeCoder(makeRequirement(), "v1", "get");
    const repository = new Repository();
    const sharedScript = repository.get(coder.modulePath());

    const result = coder.writeCode(sharedScript);

    expect(result).toStrictEqual({ raw: "" });
  });

  it("registers a versionFormatter on the shared script", () => {
    const coder = new OperationTypeCoder(makeRequirement(), "v1", "get");
    const repository = new Repository();
    const sharedScript = repository.get(coder.modulePath());

    coder.writeCode(sharedScript);

    expect(sharedScript.versionFormatters.has("HTTP_GET")).toBe(true);
  });

  it("formatter generates correct merged type for two versions", async () => {
    const requirement = makeRequirement();
    const repository = new Repository();
    const sharedScript = repository.get(
      new OperationTypeCoder(requirement, "v1", "get").modulePath(),
    );

    // Run writeCode to register the formatter
    const coder = new OperationTypeCoder(requirement, "v1", "get");
    coder.writeCode(sharedScript);

    const formatter = sharedScript.versionFormatters.get("HTTP_GET")!;

    const versionCodes = new Map([
      ["v1", "HTTP_GET_$_v1"],
      ["v2", "HTTP_GET_$_v2"],
    ]);

    const result = await formatCode(formatter(versionCodes), {
      parser: "typescript",
    });

    expect(result).toContain("HTTP_GET_$_Versions");
    expect(result).toMatch(/v1:\s*HTTP_GET_\$_v1/u);
    expect(result).toMatch(/v2:\s*HTTP_GET_\$_v2/u);
    expect(result).toContain("Versioned<HTTP_GET_$_Versions>");
    expect(result).toContain("MaybePromise");
    expect(result).toContain("COUNTERFACT_RESPONSE");
  });

  it("imports Versioned (from types/versions.ts), MaybePromise, COUNTERFACT_RESPONSE on the shared script", () => {
    const coder = new OperationTypeCoder(makeRequirement(), "v1", "get");
    const repository = new Repository();
    const sharedScript = repository.get(coder.modulePath());

    coder.writeCode(sharedScript);

    expect(sharedScript.externalImport.has("Versioned")).toBe(true);
    expect(sharedScript.externalImport.get("Versioned")?.modulePath).toContain(
      "types/versions.ts",
    );
    expect(sharedScript.externalImport.has("MaybePromise")).toBe(true);
    expect(sharedScript.externalImport.has("COUNTERFACT_RESPONSE")).toBe(true);
  });

  it("end-to-end: shared script emits merged HTTP_GET type for two versioned specs", async () => {
    const requirement = new Requirement(
      { parameters: [], responses: { 200: {} } },
      "#/paths/pets/get",
    );

    const repository = new Repository();

    // Simulate OperationCoder.typeDeclaration() for v1 and v2
    for (const version of ["v1", "v2"]) {
      const opTypeCoder = new OperationTypeCoder(requirement, version, "get");
      const versionedArgCoder = new VersionedArgTypeCoder(
        requirement,
        version,
        "get",
      );
      const sharedScript = repository.get(opTypeCoder.modulePath());
      const routeScript = repository.get(`routes/v${version}/pets.ts`);

      sharedScript.declareVersion(versionedArgCoder, "HTTP_GET");
      routeScript.importType(opTypeCoder);
    }

    const sharedScript = repository.get("types/paths/pets.types.ts");

    await sharedScript.finished();

    const contents = await sharedScript.contents();

    // The shared file must export a merged HTTP_GET type
    expect(contents).toContain("HTTP_GET_$_Versions");
    expect(contents).toMatch(/v1:\s*HTTP_GET_\$_v1/u);
    expect(contents).toMatch(/v2:\s*HTTP_GET_\$_v2/u);
    expect(contents).toContain("Versioned");
    expect(contents).toContain("export type HTTP_GET");

    // Per-version files must export their respective $ arg types
    const v1Script = repository.get("types/v1/paths/pets.types.ts");
    const v2Script = repository.get("types/v2/paths/pets.types.ts");

    await Promise.all([v1Script.finished(), v2Script.finished()]);

    const v1Contents = await v1Script.contents();
    const v2Contents = await v2Script.contents();

    expect(v1Contents).toContain("HTTP_GET_$_v1");
    expect(v1Contents).toContain("OmitValueWhenNever");
    expect(v2Contents).toContain("HTTP_GET_$_v2");
    expect(v2Contents).toContain("OmitValueWhenNever");
  });
});

// ---------------------------------------------------------------------------
// version property in generated $ arg type
// ---------------------------------------------------------------------------

describe("version property in the generated $ arg type", () => {
  const makeRequirement = (operationData = {}) =>
    new Requirement(
      { parameters: [], responses: { 200: {} }, ...operationData },
      "#/paths/pets/get",
    );

  it("includes version: <literal> in the VersionedArgTypeCoder output", () => {
    const coder = new VersionedArgTypeCoder(makeRequirement(), "v3", "get");
    const repository = new Repository();
    const perVersionScript = repository.get(coder.modulePath());

    const result = coder.writeCode(perVersionScript);

    expect(result).toContain('version: "v3"');
  });

  it("includes version: never in the unversioned OperationTypeCoder output", () => {
    const coder = new OperationTypeCoder(makeRequirement(), "", "get");
    const result = coder.write(dummyScript);

    expect(result).toContain("version: never");
  });
});
