import { valueExpression, printNode } from "../src/ast.js";
import { describe, expect, it } from "@jest/globals";
import { format as formatCode } from "prettier";
import { runInNewContext } from "node:vm";

import { Requirement } from "../src/requirement.js";
import { SchemaCoder } from "../src/schema-coder.js";

function format(code) {
  return formatCode(code, { parser: "typescript" });
}

describe("a SchemaCoder", () => {
  it("preserves escaped schema keys and own __proto__ properties", () => {
    const properties = JSON.parse(
      '{"slash/name":{"type":"string"},"__proto__":{"type":"number"}}',
    );
    const node = new SchemaCoder(
      new Requirement({ type: "object", properties }),
    ).writeCode(undefined);
    const result = runInNewContext("(" + printNode(node) + ")");
    expect(Object.hasOwn(result.properties, "__proto__")).toBe(true);
    expect(JSON.stringify(result)).toBe(
      JSON.stringify({ type: "object", required: [], properties }),
    );
  });

  it("retains JSON serialization of dates and undefined values", () => {
    const data = {
      type: "string",
      default: new Date("2026-10-14T00:00:00.000Z"),
      omitted: undefined,
    };
    const node = new SchemaCoder(new Requirement(data)).writeCode(undefined);
    expect(JSON.stringify(runInNewContext("(" + printNode(node) + ")"))).toBe(
      JSON.stringify(data),
    );
  });
  it("generates a list of potential names", () => {
    const coder = new SchemaCoder(
      new Requirement({ $ref: "/components/schemas/Example" }),
    );

    const [one, two, three] = coder.names();

    expect([one, two, three]).toStrictEqual([
      "ExampleSchema",
      "ExampleSchema2",
      "ExampleSchema3",
    ]);
  });

  it("when given a $ref, creates an import", () => {
    const coder = new SchemaCoder(
      new Requirement({ $ref: "/components/schemas/Example" }),
    );

    const script = {
      import(c) {
        this.importedCoder = c;

        return "aVariable";
      },
    };

    const result = printNode(coder.write(script));

    expect(script.importedCoder).toBe(coder);
    expect(result).toBe("aVariable");
  });

  it.each`
    type         | output
    ${"string"}  | ${'{"type":"string"}'}
    ${"number"}  | ${'{"type":"number"}'}
    ${"integer"} | ${'{"type":"integer"}'}
  `("generates a type declaration for $type", ({ output, type }) => {
    const coder = new SchemaCoder(
      new Requirement({ type, xml: "should be ignored" }),
    );
    const result = printNode(coder.write({}));

    expect(result).toBe(printNode(valueExpression(JSON.parse(output))));
  });

  it("generates a type declaration for an object", async () => {
    const coder = new SchemaCoder(
      new Requirement({
        properties: {
          "@needsQuotes": { type: "string" },
          age: { type: "integer" },
          name: { type: "string" },
        },

        type: "object",

        xml: "should be ignored",
      }),
    );

    const expected = await format(`const x = { 
      type: "object",
      required: [],
      properties: { "@needsQuotes": { type: "string"}, "age": {"type":"integer"}, "name": {"type":"string"}  }
    }`);

    await expect(
      format(`const x = ${printNode(coder.write())}`),
    ).resolves.toStrictEqual(expected);
  });

  it("generates a type declaration for an array", async () => {
    const coder = new SchemaCoder(
      new Requirement({
        items: { type: "string" },
        type: "array",
        xml: "should be ignored",
      }),
    );

    const expected = await format(
      `const x = { 
          type: "array", 
          items: { type: "string" } 
      };`,
    );

    await expect(
      format(`const x = ${printNode(coder.write())}`),
    ).resolves.toStrictEqual(expected);
  });

  it("has type JSONSchema6", () => {
    const coder = new SchemaCoder(
      new Requirement({
        items: { type: "string" },
        type: "array",
        xml: "should be ignored",
      }),
    );

    const script = {
      importExternalType(name, path) {
        this.imported = { name, path };

        return name;
      },
    };

    expect(printNode(coder.typeDeclaration(undefined, script))).toBe(
      "JSONSchema6",
    );

    expect(script.imported).toStrictEqual({
      name: "JSONSchema6",
      path: "json-schema",
    });
  });

  it("calculates the modulePath", () => {
    const coder = new SchemaCoder(
      new Requirement({
        $ref: "foo/bar/baz",
      }),
    );

    expect(coder.modulePath()).toBe("types/foo/bar/baz.ts");
  });
});
