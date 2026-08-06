import { describe, expect, it } from "@jest/globals";
import { format as formatCode } from "prettier";

import { Requirement } from "../../src/typescript-generator/requirement.js";
import { SchemaCoder } from "../../src/typescript-generator/schema-coder.js";

function format(code) {
  return formatCode(code, { parser: "typescript" });
}

describe("a SchemaCoder", () => {
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

    const result = coder.write(script);

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
    const result = coder.write({});

    expect(result).toBe(output);
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

    await expect(format(`const x = ${coder.write()}`)).resolves.toStrictEqual(
      expected,
    );
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

    await expect(format(`const x = ${coder.write()}`)).resolves.toStrictEqual(
      expected,
    );
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

    expect(coder.typeDeclaration(undefined, script)).toBe("JSONSchema6");

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
