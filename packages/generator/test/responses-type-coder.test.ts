import { describe, expect, it } from "@jest/globals";
import ts from "typescript";

import { printNode } from "../src/ast.js";
import { Requirement } from "../src/requirement.js";
import { ResponsesTypeCoder } from "../src/responses-type-coder.js";

describe("a ResponsesTypeCoder", () => {
  it("creates numeric properties for explicit status codes", () => {
    const coder = new ResponsesTypeCoder(new Requirement({ 200: {} }));
    const type = coder.buildResponseObjectType(null) as ts.TypeLiteralNode;
    const member = type.members[0] as ts.PropertySignature;
    expect(ts.isNumericLiteral(member.name)).toBe(true);
    expect((member.name as ts.NumericLiteral).text).toBe("200");
  });

  it("excludes explicit codes from the default response", () => {
    const coder = new ResponsesTypeCoder(new Requirement({}));
    expect(
      printNode(coder.typeForDefaultStatusCode(["200", "201", "default"])),
    ).toBe("Exclude<HttpStatusCode, 200 | 201>");
  });

  it("uses every status code when only default is defined", () => {
    const coder = new ResponsesTypeCoder(new Requirement({}));
    expect(printNode(coder.typeForDefaultStatusCode(["default"]))).toBe(
      "HttpStatusCode",
    );
  });

  describe("buildResponseObjectType", () => {
    it("intersects explicit responses with the default mapped response", () => {
      const coder = new ResponsesTypeCoder(
        new Requirement({ 200: {}, 400: {}, default: {} }),
      );
      const result = printNode(coder.buildResponseObjectType(null));
      expect(result).toContain(" & ");
      expect(result).toMatch(/200:/);
      expect(result).toMatch(/400:/);
      expect(result).toMatch(
        /\[statusCode in Exclude<HttpStatusCode, 200 \| 400>\]/,
      );
    });

    it("returns a literal type for explicit responses", () => {
      const coder = new ResponsesTypeCoder(
        new Requirement({ 200: {}, 404: {} }),
      );
      const type = coder.buildResponseObjectType(null);
      expect(ts.isTypeLiteralNode(type)).toBe(true);
      expect(printNode(type)).toMatch(/200:/);
      expect(printNode(type)).toMatch(/404:/);
    });

    it("returns a mapped type when only default is defined", () => {
      const coder = new ResponsesTypeCoder(new Requirement({ default: {} }));
      const type = coder.buildResponseObjectType(null);
      expect(ts.isMappedTypeNode(type)).toBe(true);
      expect(printNode(type)).toContain("[statusCode in HttpStatusCode]");
    });
  });

  it("imports HttpStatusCode explicitly when default is present", () => {
    const names: string[] = [];
    const script = { importSharedType: (name: string) => names.push(name) };
    printNode(
      new ResponsesTypeCoder(
        new Requirement({ 200: {}, default: {} }),
      ).writeCode(script),
    );
    expect(names).toEqual(["ResponseBuilderFactory", "HttpStatusCode"]);
  });

  it("does not mistake an example named HttpStatusCode for a type dependency", () => {
    const names: string[] = [];
    const script = { importSharedType: (name: string) => names.push(name) };
    printNode(
      new ResponsesTypeCoder(
        new Requirement({
          200: {
            content: {
              "application/json": {
                examples: { HttpStatusCode: { value: "example" } },
              },
            },
          },
        }),
      ).writeCode(script),
    );
    expect(names).toEqual(["ResponseBuilderFactory"]);
  });
});
