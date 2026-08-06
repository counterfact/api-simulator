import { describe, expect, it } from "@jest/globals";
import { format as formatCode } from "prettier";

import { ParametersTypeCoder } from "../../src/typescript-generator/parameters-type-coder.js";
import { Requirement } from "../../src/typescript-generator/requirement.js";

function format(code) {
  return formatCode(code, { parser: "typescript" });
}

describe("a ParametersTypeCoder", () => {
  it("generates a list of potential names", () => {
    const coder = new ParametersTypeCoder(new Requirement({}));

    const [one, two, three] = coder.names();

    expect([one, two, three]).toStrictEqual([
      "parameters",
      "parameters2",
      "parameters3",
    ]);
  });

  it("generates types for parameters", async () => {
    const requirement = new Requirement([
      { in: "path", name: "id", required: true, schema: { type: "string" } },
      { in: "query", name: "name", schema: { type: "string" } },
      { in: "query", name: "age", schema: { type: "number" } },
      { in: "header", name: "name", schema: { type: "string" } },
    ]);

    const pathCoder = new ParametersTypeCoder(requirement, "", "path");
    const queryCoder = new ParametersTypeCoder(requirement, "", "query");
    const headerCoder = new ParametersTypeCoder(requirement, "", "header");

    await expect(
      format(`type TestType =${pathCoder.write({})}`),
    ).resolves.toMatchSnapshot("path");
    await expect(
      format(`type TestType =${queryCoder.write({})}`),
    ).resolves.toMatchSnapshot("query");
    await expect(
      format(`type TestType =${headerCoder.write({})}`),
    ).resolves.toMatchSnapshot("header");
  });

  it("generates types for parameters (OAS2)", async () => {
    const requirement = new Requirement([
      { in: "path", name: "id", required: true, type: "string" },
      { in: "query", name: "name", type: "string" },
      { in: "query", name: "age", type: "number" },
      { in: "header", name: "name", type: "string" },
    ]);

    const pathCoder = new ParametersTypeCoder(requirement, "", "path");
    const queryCoder = new ParametersTypeCoder(requirement, "", "query");
    const headerCoder = new ParametersTypeCoder(requirement, "", "header");

    await expect(
      format(`type TestType =${pathCoder.write({})}`),
    ).resolves.toMatchSnapshot("path");
    await expect(
      format(`type TestType =${queryCoder.write({})}`),
    ).resolves.toMatchSnapshot("query");
    await expect(
      format(`type TestType =${headerCoder.write({})}`),
    ).resolves.toMatchSnapshot("header");
  });

  it("generates type never when there is no match", async () => {
    const requirement = new Requirement([
      { in: "path", name: "id", required: true, schema: { type: "string" } },
    ]);

    const coder = new ParametersTypeCoder(requirement, "", "query");

    await expect(
      format(`type TestType =${coder.write({})}`),
    ).resolves.toMatchSnapshot();
  });

  it("has no type", () => {
    const coder = new ParametersTypeCoder(new Requirement({}));

    expect(coder.typeDeclaration(undefined, {})).toBe("");
  });

  it("includes JSDoc from parameter description", async () => {
    const requirement = new Requirement([
      {
        in: "query",
        name: "status",
        description: "Status values for filter",
        schema: { type: "string" },
      },
    ]);

    const coder = new ParametersTypeCoder(requirement, "", "query");
    const result = await format(`type TestType = ${coder.write({})}`);

    expect(result).toContain("* Status values for filter");
    expect(result).toContain("status?: string");
  });

  it("includes @deprecated and @example in parameter JSDoc", async () => {
    const requirement = new Requirement([
      {
        in: "query",
        name: "legacyParam",
        deprecated: true,
        example: "foo",
        schema: { type: "string" },
      },
    ]);

    const coder = new ParametersTypeCoder(requirement, "", "query");
    const result = await format(`type TestType = ${coder.write({})}`);

    expect(result).toContain("@deprecated");
    expect(result).toContain('@example "foo"');
  });

  it("calculates the modulePath", () => {
    const coder = new ParametersTypeCoder(
      new Requirement({}, "/components/parameters/foo"),
    );

    expect(coder.modulePath()).toBe("parameters/parameters.types.ts");
  });
});
