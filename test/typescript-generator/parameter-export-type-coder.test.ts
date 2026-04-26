import { describe, expect, it } from "@jest/globals";

import { ParameterExportTypeCoder } from "../../src/typescript-generator/parameter-export-type-coder.js";
import { Requirement } from "../../src/typescript-generator/requirement.js";

describe("a ParameterExportTypeCoder", () => {
  describe("modulePath", () => {
    it("returns types/paths/... path without version", () => {
      const coder = new ParameterExportTypeCoder(
        new Requirement({}, "/paths/~1pets/get"),
        "",
        "HTTP_GET_$_Query",
        "{ id: string }",
        "query",
      );

      expect(coder.modulePath()).toBe("types/paths/pets.types.ts");
    });

    it("includes the version in the path when version is set", () => {
      const coder = new ParameterExportTypeCoder(
        new Requirement({}, "/paths/~1pets/get"),
        "v1",
        "HTTP_GET_$_v1_Query",
        "{ id: string }",
        "query",
      );

      expect(coder.modulePath()).toBe("types/v1/paths/pets.types.ts");
    });

    it("omits the version segment from the path when version is empty", () => {
      const coder = new ParameterExportTypeCoder(
        new Requirement({}, "/paths/~1pets/get"),
        "",
        "HTTP_GET_$_Query",
        "{ id: string }",
        "query",
      );

      expect(coder.modulePath()).toBe("types/paths/pets.types.ts");
    });
  });
});
