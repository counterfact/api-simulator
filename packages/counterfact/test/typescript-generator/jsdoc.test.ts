import { describe, expect, it } from "@jest/globals";

import { buildJsDoc } from "../../src/typescript-generator/jsdoc.js";

describe("buildJsDoc", () => {
  it("returns empty string when there is no relevant metadata", () => {
    expect(buildJsDoc({ type: "string" })).toBe("");
  });

  it("generates a JSDoc comment from description", () => {
    expect(buildJsDoc({ description: "A pet in the store" })).toBe(
      "/**\n * A pet in the store\n */\n",
    );
  });

  it("falls back to summary when description is absent", () => {
    expect(buildJsDoc({ summary: "Add a new pet" })).toBe(
      "/**\n * Add a new pet\n */\n",
    );
  });

  it("prefers description over summary", () => {
    expect(
      buildJsDoc({ description: "Full description", summary: "Short summary" }),
    ).toBe("/**\n * Full description\n */\n");
  });

  it("includes @format tag", () => {
    expect(buildJsDoc({ format: "date-time" })).toBe(
      "/**\n * @format date-time\n */\n",
    );
  });

  it("includes @default tag", () => {
    expect(buildJsDoc({ default: 42 })).toBe("/**\n * @default 42\n */\n");
  });

  it("includes @example tag from scalar example", () => {
    expect(buildJsDoc({ example: 123 })).toBe("/**\n * @example 123\n */\n");
  });

  it("includes @example tag from first entry in examples object", () => {
    expect(buildJsDoc({ examples: { fox: { value: "Slick" } } })).toBe(
      '/**\n * @example "Slick"\n */\n',
    );
  });

  it("prefers scalar example over examples object", () => {
    expect(
      buildJsDoc({ example: "direct", examples: { foo: { value: "other" } } }),
    ).toBe('/**\n * @example "direct"\n */\n');
  });

  it("includes @deprecated tag when deprecated is true", () => {
    expect(buildJsDoc({ deprecated: true })).toBe("/**\n * @deprecated\n */\n");
  });

  it("does not include @deprecated when deprecated is false", () => {
    expect(buildJsDoc({ deprecated: false })).toBe("");
  });

  it("combines all fields", () => {
    const result = buildJsDoc({
      description: "A pet",
      format: "uuid",
      default: "none",
      example: "fluffy",
      deprecated: true,
    });

    expect(result).toBe(
      '/**\n * A pet\n * @format uuid\n * @default "none"\n * @example "fluffy"\n * @deprecated\n */\n',
    );
  });

  it("escapes */ in description to prevent breaking the JSDoc block", () => {
    expect(buildJsDoc({ description: "ends with */ here" })).toBe(
      "/**\n * ends with * / here\n */\n",
    );
  });

  it("handles multi-line descriptions", () => {
    expect(buildJsDoc({ description: "line one\nline two" })).toBe(
      "/**\n * line one\n * line two\n */\n",
    );
  });
});
