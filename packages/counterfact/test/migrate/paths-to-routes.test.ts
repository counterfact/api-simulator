import { describe, expect, it } from "@jest/globals";

import { usingTemporaryFiles } from "using-temporary-files";

import { pathsToRoutes } from "../../src/migrate/paths-to-routes.js";

describe("pathsToRoutes", () => {
  it("copies files from paths/ to routes/ and replaces path-types with types/paths", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "paths/pets/index.ts",
        'import type { HTTP_GET } from "../../path-types/pets.types.ts";\n',
      );

      await pathsToRoutes($.path("."));

      const content = await $.read("routes/pets/index.ts");
      expect(content).toContain("types/paths");
      expect(content).not.toContain("path-types");
    });
  });

  it("recursively copies nested directories", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("paths/a/b/c.ts", "export const x = 1;\n");

      await pathsToRoutes($.path("."));

      const content = await $.read("routes/a/b/c.ts");
      expect(content).toBe("export const x = 1;\n");
    });
  });

  it("resolves without error when the paths/ directory does not exist", async () => {
    await usingTemporaryFiles(async ($) => {
      await expect(pathsToRoutes($.path("."))).resolves.toBeUndefined();
    });
  });
});
