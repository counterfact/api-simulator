import { describe, expect, it } from "@jest/globals";

import ts from "typescript";

import { printNode } from "../src/ast.js";
import { Requirement } from "../src/requirement.js";
import { ResponseTypeCoder } from "../src/response-type-coder.js";

function exampleNames(type: ts.TypeLiteralNode): string[] {
  return type.members.map(
    (member) =>
      ((member as ts.PropertySignature).name as ts.StringLiteral).text,
  );
}

function contentEntries(entries: [string, ts.TypeNode][]): [string, string][] {
  return entries.map(([name, type]) => [
    name,
    printNode(
      ((type as ts.TypeLiteralNode).members[0] as ts.PropertySignature).type!,
    ),
  ]);
}

describe("a ResponseTypeCoder", () => {
  it("prints required headers", () => {
    const coder = new ResponseTypeCoder({
      data: {
        default: {},
      },
    });

    const headers = new Requirement({
      headers: {
        always: {
          required: true,
        },

        mandatory: {
          required: true,
        },

        occasionally: {},
        sometimes: {},
      },
    });

    expect(printNode(coder.requiredHeadersType(headers))).toBe(
      '"always" | "mandatory"',
    );
  });

  describe("buildExamplesObjectType", () => {
    it("returns '{}' when response has no content field", () => {
      const coder = new ResponseTypeCoder({ data: {} });
      const response = new Requirement({
        schema: { type: "object" },
      });

      expect(exampleNames(coder.buildExamplesObjectType(response))).toEqual([]);
    });

    it("returns '{}' when content types have no examples", () => {
      const coder = new ResponseTypeCoder({ data: {} });
      const response = new Requirement({
        content: {
          "application/json": {
            schema: { type: "object" },
          },
        },
      });

      expect(exampleNames(coder.buildExamplesObjectType(response))).toEqual([]);
    });

    it("returns an object type with example names from a single content type", () => {
      const coder = new ResponseTypeCoder({ data: {} });
      const response = new Requirement({
        content: {
          "application/json": {
            examples: {
              success: { value: { id: 1 } },
              empty: { value: [] },
            },
            schema: { type: "object" },
          },
        },
      });

      expect(exampleNames(coder.buildExamplesObjectType(response))).toEqual([
        "success",
        "empty",
      ]);
    });

    it("merges example names from multiple content types without duplicates", () => {
      const coder = new ResponseTypeCoder({ data: {} });
      const response = new Requirement({
        content: {
          "application/json": {
            examples: {
              success: { value: { id: 1 } },
            },
            schema: { type: "object" },
          },
          "text/plain": {
            examples: {
              success: { value: "ok" },
              error: { value: "not found" },
            },
            schema: { type: "string" },
          },
        },
      });

      expect(exampleNames(coder.buildExamplesObjectType(response))).toEqual([
        "success",
        "error",
      ]);
    });
  });

  describe("buildContentObjectType", () => {
    it("uses 'unknown' for schema when content has no schema", () => {
      const coder = new ResponseTypeCoder({ data: {} });
      const response = new Requirement({
        content: {
          "application/json": {
            examples: {
              "Example 1": { value: { stuffId: 123 } },
            },
          },
        },
      });

      const result = contentEntries(coder.buildContentObjectType({}, response));

      expect(result).toStrictEqual([["application/json", "unknown"]]);
    });

    it("generates AsyncIterable<T> when content has itemSchema and is text/event-stream", () => {
      const coder = new ResponseTypeCoder({ data: {} });
      const response = new Requirement({
        content: {
          "text/event-stream": {
            itemSchema: { type: "string" },
          },
        },
      });

      const result = contentEntries(coder.buildContentObjectType({}, response));

      expect(result).toStrictEqual([
        ["text/event-stream", "AsyncIterable<string>"],
      ]);
    });

    it("generates AsyncIterable<T> for application/jsonl with itemSchema", () => {
      const coder = new ResponseTypeCoder({ data: {} });
      const response = new Requirement({
        content: {
          "application/jsonl": {
            itemSchema: { type: "number" },
          },
        },
      });

      const result = contentEntries(coder.buildContentObjectType({}, response));

      expect(result).toStrictEqual([
        ["application/jsonl", "AsyncIterable<number>"],
      ]);
    });

    it("generates AsyncIterable<T> for application/json-seq with itemSchema", () => {
      const coder = new ResponseTypeCoder({ data: {} });
      const response = new Requirement({
        content: {
          "application/json-seq": {
            itemSchema: { type: "string" },
          },
        },
      });

      const result = contentEntries(coder.buildContentObjectType({}, response));

      expect(result).toStrictEqual([
        ["application/json-seq", "AsyncIterable<string>"],
      ]);
    });

    it("falls back to schema type when itemSchema is absent for a streaming content type", () => {
      const coder = new ResponseTypeCoder({ data: {} });
      const response = new Requirement({
        content: {
          "text/event-stream": {
            schema: { type: "string" },
          },
        },
      });

      const result = contentEntries(coder.buildContentObjectType({}, response));

      expect(result).toStrictEqual([["text/event-stream", "string"]]);
    });

    it("ignores itemSchema for non-streaming content types", () => {
      const coder = new ResponseTypeCoder({ data: {} });
      const response = new Requirement({
        content: {
          "application/json": {
            itemSchema: { type: "string" },
            schema: { type: "object" },
          },
        },
      });

      const result = contentEntries(coder.buildContentObjectType({}, response));

      // Should use schema, not itemSchema, because application/json is not a streaming type
      expect(result).toStrictEqual([["application/json", "{}"]]);
    });
  });

  describe("modulePath", () => {
    it("returns path with types prefix and .ts extension", () => {
      const coder = new ResponseTypeCoder(
        new Requirement({ $ref: "responses/MyResponse" }),
      );

      expect(coder.modulePath()).toBe("types/responses/MyResponse.ts");
    });

    it("includes the version in the path when version is set", () => {
      const coder = new ResponseTypeCoder(
        new Requirement({ $ref: "responses/MyResponse" }),
        "v2",
      );

      expect(coder.modulePath()).toBe("types/v2/responses/MyResponse.ts");
    });

    it("omits the version segment from the path when version is empty", () => {
      const coder = new ResponseTypeCoder(
        new Requirement({ $ref: "responses/MyResponse" }),
        "",
      );

      expect(coder.modulePath()).toBe("types/responses/MyResponse.ts");
    });
  });

  describe("writeCode", () => {
    it("includes an 'examples' field in the output", () => {
      const response = new Requirement({
        content: {
          "application/json": {
            examples: {
              myExample: { value: { id: 1 } },
            },
            schema: { type: "object" },
          },
        },
      });
      const coder = new ResponseTypeCoder(response);

      const code = printNode(coder.writeCode(null));

      expect(code).toContain("examples:");
      expect(code).toContain("myExample: unknown");
    });

    it("includes 'examples: {}' when no examples are defined", () => {
      const response = new Requirement({
        content: {
          "application/json": {
            schema: { type: "string" },
          },
        },
      });
      const coder = new ResponseTypeCoder(response);

      const code = printNode(coder.writeCode(null));

      expect(code).toContain("examples: {}");
    });
  });
});
