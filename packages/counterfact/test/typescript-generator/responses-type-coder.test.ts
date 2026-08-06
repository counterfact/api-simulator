import { describe, expect, it } from "@jest/globals";

import { Requirement } from "../../src/typescript-generator/requirement.js";
import { ResponsesTypeCoder } from "../../src/typescript-generator/responses-type-coder.js";

describe("a ResponsesTypeCoder", () => {
  it("creates a type for a status code", () => {
    const coder = new ResponsesTypeCoder({
      data: {
        200: {},
        default: {},
      },
    });

    expect(coder.normalizeStatusCode("200", { 200: {}, default: {} })).toBe(
      "200",
    );
  });

  it("creates a type for a default status code when some status codes are defined", () => {
    const coder = new ResponsesTypeCoder({
      data: {
        200: {},
        201: {},
        default: {},
      },
    });

    expect(coder.normalizeStatusCode("default", { 200: {}, 201: {} })).toBe(
      "[statusCode in Exclude<HttpStatusCode, 200 | 201>]",
    );
  });

  it("creates a type for a default status code when its the only entry, so it could represent any status code", () => {
    const coder = new ResponsesTypeCoder({
      data: {
        default: {},
      },
    });

    expect(coder.normalizeStatusCode("default", { default: {} })).toBe(
      "[statusCode in HttpStatusCode]",
    );
  });

  describe("buildResponseObjectType", () => {
    it("returns an intersection when both explicit status codes and a mapped type (default) are present", () => {
      const coder = new ResponsesTypeCoder(
        new Requirement({
          200: {},
          400: {},
          default: {},
        }),
      );

      const result = coder.buildResponseObjectType(null);

      expect(result).toContain(" & ");
      expect(result).toMatch(/200:/);
      expect(result).toMatch(/400:/);
      expect(result).toMatch(
        /\[statusCode in Exclude<HttpStatusCode, 200 \| 400>\]/,
      );
    });

    it("returns a single object when there are only explicit status codes", () => {
      const coder = new ResponsesTypeCoder(
        new Requirement({
          200: {},
          404: {},
        }),
      );

      const result = coder.buildResponseObjectType(null);

      expect(result).not.toContain(" & ");
      expect(result).toMatch(/200:/);
      expect(result).toMatch(/404:/);
    });

    it("returns a single object when there is only a mapped type (default only)", () => {
      const coder = new ResponsesTypeCoder(
        new Requirement({
          default: {},
        }),
      );

      const result = coder.buildResponseObjectType(null);

      expect(result).not.toContain(" & ");
      expect(result).toContain("[statusCode in HttpStatusCode]");
    });
  });
});
