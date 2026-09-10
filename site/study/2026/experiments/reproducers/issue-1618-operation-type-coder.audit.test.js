import { describe, expect, it } from "@jest/globals";
import { format as formatCode } from "prettier";

import { OperationTypeCoder } from "../../src/typescript-generator/operation-type-coder.js";
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
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("HTTP_GET");
    });

    it("returns a plain operationId unchanged", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "getUser" }, "#/paths/hello/get"),
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
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("getUserProfile");
    });

    it("converts dot-separated operationId to camelCase", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "user.get" }, "#/paths/hello/get"),
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("userGet");
    });

    it("converts space-separated operationId to camelCase", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "get user" }, "#/paths/hello/get"),
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("getUser");
    });

    it("camelCases across non-identifier characters", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "get@user!" }, "#/paths/hello/get"),
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("getUser");
    });

    it("prefixes with underscore when operationId starts with a digit", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "123getUser" }, "#/paths/hello/get"),
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("_123getUser");
    });

    it("appends underscore when operationId is a reserved word", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "delete" }, "#/paths/stuff/delete"),
        "delete",
      );

      expect(coder.getOperationBaseName()).toBe("delete_");
    });

    it("appends underscore when operationId is another reserved word", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "import" }, "#/paths/stuff/post"),
        "post",
      );

      expect(coder.getOperationBaseName()).toBe("import_");
    });

    it("appends underscore when operationId is await", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "await" }, "#/paths/stuff/get"),
        "get",
      );

      expect(coder.getOperationBaseName()).toBe("await_");
    });
    it("appends underscore when operationId becomes a reserved word after stripping trailing non-identifier chars", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "delete!!" }, "#/paths/stuff/delete"),
        "delete",
      );

      expect(coder.getOperationBaseName()).toBe("delete_");
    });

    it("does not append underscore when operationId already has a suffix making it non-reserved", () => {
      const coder = new OperationTypeCoder(
        new Requirement({ operationId: "deleteItem" }, "#/paths/stuff/delete"),
        "delete",
      );

      expect(coder.getOperationBaseName()).toBe("deleteItem");
    });
  });

  it("creates a type declaration", () => {
    const coder = new OperationTypeCoder(
      new Requirement({}, "#/paths/hello/get"),
      "get",
    );

    expect(coder.typeDeclaration(undefined, dummyScript)).toBe("");
  });

  it("returns the module path", () => {
    const coder = new OperationTypeCoder(
      new Requirement({}, "#/paths/hello~1world/get"),
      "get",
    );

    expect(coder.modulePath()).toBe("types/paths/hello/world.types.ts");
  });

  it("returns the module path for /", () => {
    const coder = new OperationTypeCoder(
      new Requirement({}, "#/paths/~1/get"),
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

    const coder = new OperationTypeCoder(requirement, "get");

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

    const coder = new OperationTypeCoder(requirement, "get");

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

    const coder = new OperationTypeCoder(requirement, "get");

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

    const coder = new OperationTypeCoder(requirement, "get");

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

    const coder = new OperationTypeCoder(requirement, "get");

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

    const coder = new OperationTypeCoder(requirement, "get");

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

    const coder = new OperationTypeCoder(requirement, "get");

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

    const coder = new OperationTypeCoder(requirement, "get", [
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
      "post",
    );

    const [one, two, three] = coder.names();

    expect([one, two, three]).toStrictEqual(["addPet", "addPet2", "addPet3"]);
  });

  it("falls back to HTTP_METHOD when operationId is not available", () => {
    const coder = new OperationTypeCoder(
      new Requirement({}, "#/paths/pet/post"),
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

    const coder = new OperationTypeCoder(requirement, "get");
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

    const coder = new OperationTypeCoder(requirement, "get");
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

    const coder = new OperationTypeCoder(requirement, "get");
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

    const coder = new OperationTypeCoder(requirement, "post");

    expect(() => coder.responseTypes(dummyScript)).not.toThrow();
    expect(coder.responseTypes(dummyScript)).toContain("body?: unknown");
  });
});
