import { describe, expect, it } from "@jest/globals";

import { printNode } from "../src/ast.js";
import { type ContractNaming, DataContracts } from "../src/client-contracts.js";
import { Repository } from "../src/repository.js";
import { Requirement } from "../src/requirement.js";
import { Specification } from "../src/specification.js";

function specificationFor(document: Record<string, unknown>): Specification {
  const specification = new Specification();
  specification.rootRequirement = new Requirement(document, "#", specification);
  return specification;
}

function contractsFor(
  document: Record<string, unknown>,
  naming: Partial<ContractNaming> = {},
) {
  const specification = specificationFor(document);
  const contracts = new DataContracts(specification, {
    directory: "client",
    reserved: [],
    ...naming,
  });
  const script = new Repository().get("client/Module.ts");
  return { contracts, script, specification };
}

const OPENAPI = {
  openapi: "3.1.0",
  paths: {
    "/things/{id}": {
      parameters: [
        { in: "path", name: "id", required: true, schema: { type: "string" } },
        { $ref: "#/components/parameters/Limit" },
      ],
      get: {
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: {},
      },
    },
  },
  components: {
    parameters: {
      Limit: { in: "query", name: "limit", schema: { type: "integer" } },
    },
    requestBodies: {
      Thing: {
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Thing" },
          },
        },
      },
    },
    responses: {
      NotFound: {
        description: "Missing",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Problem" },
          },
        },
      },
    },
    schemas: {
      Thing: { type: "object" },
      Problem: { type: "object" },
    },
  },
};

describe("DataContracts naming", () => {
  it("names every schema up front, in document order, with the affixes", () => {
    const { contracts } = contractsFor(
      {
        components: {
          schemas: { "user-account": {}, Role: {}, "a/b": {} },
        },
      },
      { typePrefix: "I", typeSuffix: "Dto" },
    );

    expect(contracts.entries).toEqual([
      ["IUserAccountDto", "#/components/schemas/user-account"],
      ["IRoleDto", "#/components/schemas/Role"],
      ["IABDto", "#/components/schemas/a~1b"],
    ]);
  });

  it("names Swagger 2.0 definitions", () => {
    const { contracts } = contractsFor({
      swagger: "2.0",
      definitions: { Pet: {} },
    });

    expect(contracts.entries).toEqual([["Pet", "#/definitions/Pet"]]);
  });

  it("keeps names distinct regardless of case, since they are file names", () => {
    const { contracts } = contractsFor({
      components: { schemas: { OutputType: {}, OutPutType: {} } },
    });

    expect(contracts.entries.map(([name]) => name)).toEqual([
      "OutputType",
      "OutPutType2",
    ]);
  });

  it("avoids reserved names case-insensitively", () => {
    const { contracts } = contractsFor(
      { components: { schemas: { "http-client": {}, users: {} } } },
      { reserved: ["HttpClient", "Users"] },
    );

    expect(contracts.entries.map(([name]) => name)).toEqual([
      "HttpClient2",
      "Users2",
    ]);
  });

  it("makes names that are not identifiers safe", () => {
    const { contracts } = contractsFor({
      components: { schemas: { "2fa": {} } },
    });

    expect(contracts.entries[0]![0]).toMatch(/^[A-Z_$a-z][\w$]*$/u);
  });

  it("returns the same name for the same reference and names other references lazily", () => {
    const { contracts } = contractsFor({
      components: { schemas: { Thing: {} } },
    });

    expect(contracts.nameFor("#/components/schemas/Thing")).toBe("Thing");
    expect(
      contracts.nameFor("#/components/schemas/Thing/properties/child"),
    ).toBe("Child");
    expect(
      contracts.nameFor("#/components/schemas/Thing/properties/child"),
    ).toBe("Child");
    expect(contracts.modulePath("#/components/schemas/Thing")).toBe(
      "client/data-contracts/Thing.ts",
    );
  });
});

describe("DataContracts types", () => {
  it("writes unknown for a missing schema and imports referenced contracts", () => {
    const { contracts, script, specification } = contractsFor(OPENAPI);

    expect(printNode(contracts.type(script, undefined))).toBe("unknown");
    expect(
      printNode(
        contracts.type(
          script,
          new Requirement(
            { $ref: "#/components/schemas/Thing" },
            "#/x",
            specification,
          ),
        ),
      ),
    ).toBe("Thing");
    expect(script.imports.get("Thing")?.script.path).toBe(
      "client/data-contracts/Thing.ts",
    );
  });

  it("merges path-level and operation-level parameters, resolving references", () => {
    const { contracts, script, specification } = contractsFor(OPENAPI);
    const pathItem = specification.getRequirement("#/paths/~1things~1{id}");
    const parameters = contracts.parameters(pathItem, pathItem.get("get")!);

    expect([...parameters.keys()]).toEqual(["path:id", "query:limit"]);
    // The operation's declaration wins.
    expect(
      printNode(contracts.parameterType(script, parameters.get("path:id")!)),
    ).toBe("number");
    expect(
      printNode(
        contracts.parameterObject(script, [parameters.get("query:limit")!]),
      ),
    ).toBe("{ limit?: number; }");
  });

  it("types parameters from content and Swagger 2.0 inline types", () => {
    const { contracts, script, specification } = contractsFor({});
    const parameter = (data: Record<string, unknown>) =>
      new Requirement(data, "#/p", specification);

    expect(
      printNode(
        contracts.parameterType(
          script,
          parameter({
            in: "query",
            name: "filter",
            content: {
              "application/json": { schema: { type: "boolean" } },
            },
          }),
        ),
      ),
    ).toBe("boolean");
    expect(
      printNode(
        contracts.parameterType(
          script,
          parameter({
            in: "query",
            name: "tags",
            type: "array",
            items: { type: "string" },
          }),
        ),
      ),
    ).toBe("Array<string>");
    expect(
      printNode(
        contracts.parameterObject(script, [
          parameter({
            in: "query",
            name: "page-size",
            required: true,
            type: "integer",
          }),
        ]),
      ),
    ).toBe('{ "page-size": number; }');
  });

  it("prefers JSON media types and falls back to every media type", () => {
    const { contracts, script, specification } = contractsFor({});
    const content = (data: Record<string, unknown>) =>
      new Requirement(data, "#/c", specification);

    expect(
      printNode(
        contracts.contentType(
          script,
          content({
            "text/plain": { schema: { type: "string" } },
            "application/json; charset=utf-8": {
              schema: { type: "number" },
            },
            "application/problem+json": { schema: { type: "boolean" } },
          }),
        ),
      ),
    ).toBe("number | boolean");
    expect(
      printNode(
        contracts.contentType(
          script,
          content({
            "text/plain": { schema: { type: "string" } },
            "image/png": {},
          }),
        ),
      ),
    ).toBe("string | unknown");
    expect(printNode(contracts.contentType(script, content({})))).toBe(
      "unknown",
    );
  });

  it("types OpenAPI 3 request bodies, following references", () => {
    const { contracts, script, specification } = contractsFor(OPENAPI);
    const operation = (data: Record<string, unknown>) =>
      new Requirement(data, "#/o", specification);
    const none = new Map<string, Requirement>();

    expect(
      printNode(
        contracts.bodyType(
          script,
          operation({
            requestBody: { $ref: "#/components/requestBodies/Thing" },
          }),
          none,
        )!,
      ),
    ).toBe("Thing");
    expect(
      printNode(
        contracts.bodyType(script, operation({ requestBody: {} }), none)!,
      ),
    ).toBe("unknown");
    expect(contracts.bodyType(script, operation({}), none)).toBeUndefined();
  });

  it("types Swagger 2.0 body and form parameters", () => {
    const { contracts, script, specification } = contractsFor({
      swagger: "2.0",
      definitions: { Pet: { type: "object" } },
    });
    const parameters = (...list: Record<string, unknown>[]) =>
      new Map(
        list.map((data) => [
          `${String(data["in"])}:${String(data["name"])}`,
          new Requirement(data, "#/p", specification),
        ]),
      );
    const operation = new Requirement({}, "#/o", specification);

    expect(
      printNode(
        contracts.bodyType(
          script,
          operation,
          parameters({
            in: "body",
            name: "pet",
            schema: { $ref: "#/definitions/Pet" },
          }),
        )!,
      ),
    ).toBe("Pet");
    expect(
      printNode(
        contracts.bodyType(
          script,
          operation,
          parameters(
            { in: "formData", name: "name", required: true, type: "string" },
            { in: "formData", name: "age", type: "integer" },
          ),
        )!,
      ),
    ).toBe("{ name: string; age?: number; }");
  });

  it("unions success and error responses separately", () => {
    const { contracts, script, specification } = contractsFor(OPENAPI);
    const operation = new Requirement(
      {
        responses: {
          200: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Thing" },
              },
            },
          },
          "2XX": { content: { "text/plain": { schema: { type: "string" } } } },
          204: { description: "No content" },
          404: { $ref: "#/components/responses/NotFound" },
          default: { content: {} },
        },
      },
      "#/o",
      specification,
    );

    expect(printNode(contracts.responseType(script, operation, true))).toBe(
      // Numeric status codes come first, as in any JavaScript object.
      "Thing | void | string",
    );
    expect(printNode(contracts.responseType(script, operation, false))).toBe(
      "Problem | void",
    );
  });

  it("reads Swagger 2.0 response schemas and writes unknown without responses", () => {
    const { contracts, script, specification } = contractsFor({
      swagger: "2.0",
      definitions: { Pet: { type: "object" } },
    });
    const operation = (data: Record<string, unknown>) =>
      new Requirement(data, "#/o", specification);

    expect(
      printNode(
        contracts.responseType(
          script,
          operation({
            responses: { 200: { schema: { $ref: "#/definitions/Pet" } } },
          }),
          true,
        ),
      ),
    ).toBe("Pet");
    expect(
      printNode(contracts.responseType(script, operation({}), false)),
    ).toBe("unknown");
  });
});
