import { describe, expect, it } from "@jest/globals";
import { format as formatCode } from "prettier";

import { Requirement } from "../../src/typescript-generator/requirement.js";
import { SchemaTypeCoder } from "../../src/typescript-generator/schema-type-coder.js";

function format(code) {
  return formatCode(code, { parser: "typescript" });
}

describe("a SchemaTypeCoder", () => {
  it("generates a list of potential names", () => {
    const coder = new SchemaTypeCoder(
      new Requirement({ $ref: "/components/schemas/Example" }),
    );

    const [one, two, three] = coder.names();

    expect([one, two, three]).toStrictEqual([
      "Example",
      "Example2",
      "Example3",
    ]);
  });

  it("when given a $ref, creates an import", () => {
    const coder = new SchemaTypeCoder(
      new Requirement({ $ref: "/components/schemas/Example" }),
    );

    const script = {
      importType(c) {
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
    ${"string"}  | ${"string"}
    ${"number"}  | ${"number"}
    ${"integer"} | ${"number"}
  `("generates a type declaration for $type", ({ output, type }) => {
    const coder = new SchemaTypeCoder(
      new Requirement({ type, xml: "should be ignored" }),
    );
    const result = coder.write({});

    expect(result).toBe(output);
  });

  it("generates Uint8Array | string for type: string, format: binary (OpenAPI v3 binary)", () => {
    const coder = new SchemaTypeCoder(
      new Requirement({ type: "string", format: "binary" }),
    );

    expect(coder.write({})).toBe("Uint8Array | string");
  });

  it("generates Uint8Array | string for type: file (OpenAPI v2 binary)", () => {
    const coder = new SchemaTypeCoder(new Requirement({ type: "file" }));

    expect(coder.write({})).toBe("Uint8Array | string");
  });

  it("generates a type declaration for an object", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        properties: {
          age: { type: "integer" },
          name: { type: "string" },
        },

        type: "object",

        xml: "should be ignored",
      }),
    );

    const expected = await format("type x = { age?: number, name?: string };");

    await expect(format(`type x = ${coder.write()}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates a type declaration for an object with additionalProperties", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        additionalProperties: { type: "string" },

        properties: {
          age: { type: "integer" },
          name: { type: "string" },
        },

        type: "object",

        xml: "should be ignored",
      }),
    );

    const expected = await format(
      "type x = { age?: number, name?: string, [key: string]: unknown };",
    );

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates a type declaration for an object with required properties", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        properties: {
          anotherRequiredString: { type: "string" },
          optionalString: { type: "string" },
          requiredString: { required: true, type: "string" },
          "with spaces": { type: "string" },
        },

        required: ["anotherRequiredString"],

        type: "object",
      }),
    );

    const expected = await format(
      `type x = { 
        anotherRequiredString: string, 
        optionalString?: string, 
        requiredString: string, 
        "with spaces"?: string  };
      `,
    );

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates a type declaration for an object with additionalProperties: true", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        additionalProperties: true,

        properties: {
          age: { type: "integer" },
          name: { type: "string" },
        },

        type: "object",
      }),
    );

    const expected = await format(
      "type x = {  age?: number, name?: string, [key: string]: unknown };",
    );

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates a type declaration for an object with additionalProperties: false", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        additionalProperties: false,

        properties: {
          age: { type: "integer" },
          name: { type: "string" },
        },

        type: "object",
      }),
    );

    const expected = await format("type x = {  age?: number, name?: string};");

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates a type declaration for an object with additionalProperties and no properties", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        additionalProperties: { type: "boolean" },

        type: "object",
      }),
    );

    const expected = await format("type x = {  [key: string]: boolean };");

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates a type declaration for an object with additionalProperties all of the same type", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        additionalProperties: { type: "number" },

        properties: {
          anotherNumber: { type: "number" },
          aNumber: { type: "number" },
        },

        type: "object",
      }),
    );

    const expected = await format(
      "type x = { anotherNumber?: number; aNumber?: number; [key: string]: number };",
    );

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates a type declaration for an array", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        items: { type: "string" },
        type: "array",
        xml: "should be ignored",
      }),
    );

    const expected = await format("type x = Array<string>;");

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates a type declaration for allOf", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        allOf: [{ type: "string" }, { type: "number" }],
      }),
    );

    const expected = await format("type x = string & number;");

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates a type declaration for an array of types", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        type: ["string", "number"],
      }),
    );

    const expected = await format("type x = string | number;");

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates unknown with a comment if the type is not an array or string", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        type: 100,
      }),
    );

    const expected = await format("type x = unknown;");

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates a type declaration for anyOf", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        anyOf: [{ type: "string" }, { type: "number" }],
      }),
    );

    const expected = await format("type x = string | number;");

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates a type declaration for oneOf", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        oneOf: [{ type: "string" }, { type: "number" }],
      }),
    );

    const expected = await format("type x = string | number;");

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates a type declaration for not (unknown)", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        not: { type: "string" },
      }),
    );

    // not is not expressible in TypeScript
    // The best we could do is Exclude<any, string>, but that doesn't actually exclude strings
    const expected = await format("type x = unknown;");

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates a type declaration for enum", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        enum: [1, "two", null],
      }),
    );

    const expected = await format('type x = 1 | "two" | null;');

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("has type JSONSchema6", () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        items: { type: "string" },
        type: "array",
        xml: "should be ignored",
      }),
    );

    expect(coder.typeDeclaration(undefined, {})).toBe("");
  });

  it("calculates the modulePath", () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        $ref: "components/Example",
      }),
    );

    expect(coder.modulePath()).toBe("types/components/Example.ts");
  });

  it("includes the version in modulePath when version is set", () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        $ref: "components/Example",
      }),
      "v2",
    );

    expect(coder.modulePath()).toBe("types/v2/components/Example.ts");
  });

  it("omits the version segment from modulePath when version is empty", () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        $ref: "components/Example",
      }),
      "",
    );

    expect(coder.modulePath()).toBe("types/components/Example.ts");
  });

  it("does not mark a property as required when it has a nested required array for its own sub-properties", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        properties: {
          address: {
            properties: {
              street: { type: "string" },
              city: { type: "string" },
            },
            required: ["street", "city"],
            type: "object",
          },
        },
        type: "object",
      }),
    );

    const expected = await format(
      "type x = { address?: { street: string, city: string } };",
    );

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("marks a property as required when its required flag is explicitly set to true", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        properties: {
          name: { required: true, type: "string" },
          nickname: { type: "string" },
        },
        type: "object",
      }),
    );

    const expected = await format(
      "type x = { name: string, nickname?: string };",
    );

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("adds JSDoc for properties with description", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        properties: {
          id: { type: "integer", description: "Unique identifier" },
          name: { type: "string" },
        },
        type: "object",
      }),
    );

    const result = await format(`type x = ${coder.write({})}`);

    expect(result).toContain("* Unique identifier");
    expect(result).toContain("id?: number");
  });

  it("adds @example tag for properties with example", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        properties: {
          name: { type: "string", example: "Fido" },
        },
        type: "object",
      }),
    );

    const result = await format(`type x = ${coder.write({})}`);

    expect(result).toContain('@example "Fido"');
  });

  it("adds @deprecated tag for deprecated properties", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        properties: {
          oldField: { type: "string", deprecated: true },
        },
        type: "object",
      }),
    );

    const result = await format(`type x = ${coder.write({})}`);

    expect(result).toContain("@deprecated");
  });

  it("returns JSDoc from jsdoc() for schema with description", () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        description: "A pet in the store",
        type: "object",
        properties: {},
      }),
    );

    expect(coder.jsdoc()).toBe("/**\n * A pet in the store\n */\n");
  });

  it("returns empty string from jsdoc() when no metadata", () => {
    const coder = new SchemaTypeCoder(new Requirement({ type: "string" }));

    expect(coder.jsdoc()).toBe("");
  });

  it("generates AsyncIterable<T> when the schema has itemSchema", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({
        itemSchema: { type: "object", properties: { id: { type: "integer" } } },
      }),
    );

    const expected = await format("type x = AsyncIterable<{ id?: number }>;");

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });

  it("generates AsyncIterable<string> when itemSchema is a string type", async () => {
    const coder = new SchemaTypeCoder(
      new Requirement({ itemSchema: { type: "string" } }),
    );

    const expected = await format("type x = AsyncIterable<string>;");

    await expect(format(`type x = ${coder.write({})}`)).resolves.toStrictEqual(
      expected,
    );
  });
});
