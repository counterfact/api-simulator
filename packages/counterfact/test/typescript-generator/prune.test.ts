import { describe, expect, it } from "@jest/globals";

import { usingTemporaryFiles } from "using-temporary-files";

import {
  pruneRoutes,
  pruneTypes,
} from "../../src/typescript-generator/prune.js";

describe("pruneRoutes", () => {
  it("removes a route file that is not in the OpenAPI spec", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "routes/pet/{id}.ts",
        "export const GET = () => ({ status: 200 });",
      );
      await $.add(
        "routes/pet/{name}.ts",
        "export const GET = () => ({ status: 200 });",
      );

      const expectedPaths = ["/pet/{id}"];
      const count = await pruneRoutes($.path(""), expectedPaths);

      expect(count).toBe(1);
      await expect($.read("routes/pet/{id}.ts")).resolves.toBeDefined();
      await expect($.read("routes/pet/{name}.ts")).rejects.toThrow();
    });
  });

  it("keeps context files even when not in the spec", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("routes/_.context.ts", "export class Context {}");
      await $.add("routes/pet/_.context.ts", "export class Context {}");
      await $.add(
        "routes/pet/{id}.ts",
        "export const GET = () => ({ status: 200 });",
      );

      const expectedPaths = ["/pet/{id}"];
      const count = await pruneRoutes($.path(""), expectedPaths);

      expect(count).toBe(0);
      await expect($.read("routes/_.context.ts")).resolves.toBeDefined();
      await expect($.read("routes/pet/_.context.ts")).resolves.toBeDefined();
    });
  });

  it("removes empty directories after pruning", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "routes/old/{id}.ts",
        "export const GET = () => ({ status: 200 });",
      );

      const expectedPaths = [];
      await pruneRoutes($.path(""), expectedPaths);

      await expect($.read("routes/old/{id}.ts")).rejects.toThrow();
    });
  });

  it("does not remove directories that still contain context files", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "routes/old/{id}.ts",
        "export const GET = () => ({ status: 200 });",
      );
      await $.add("routes/old/_.context.ts", "export class Context {}");

      const expectedPaths = [];
      await pruneRoutes($.path(""), expectedPaths);

      await expect($.read("routes/old/_.context.ts")).resolves.toBeDefined();
    });
  });

  it("handles the root path '/'", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "routes/index.ts",
        "export const GET = () => ({ status: 200 });",
      );
      await $.add(
        "routes/old.ts",
        "export const GET = () => ({ status: 200 });",
      );

      const expectedPaths = ["/"];
      const count = await pruneRoutes($.path(""), expectedPaths);

      expect(count).toBe(1);
      await expect($.read("routes/index.ts")).resolves.toBeDefined();
      await expect($.read("routes/old.ts")).rejects.toThrow();
    });
  });

  it("keeps the normalized route and removes a legacy trailing-slash dotfile", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "routes/customers.ts",
        "export const GET = () => ({ status: 200 });",
      );
      await $.add(
        "routes/customers/.ts",
        "export const GET = () => ({ status: 200 });",
      );

      const count = await pruneRoutes($.path(""), ["/customers/"]);

      expect(count).toBe(1);
      await expect($.read("routes/customers.ts")).resolves.toBeDefined();
      await expect($.read("routes/customers/.ts")).rejects.toThrow();
    });
  });

  it("returns 0 when all files match the spec", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "routes/pet/{id}.ts",
        "export const GET = () => ({ status: 200 });",
      );
      await $.add(
        "routes/pet.ts",
        "export const GET = () => ({ status: 200 });",
      );

      const expectedPaths = ["/pet/{id}", "/pet"];
      const count = await pruneRoutes($.path(""), expectedPaths);

      expect(count).toBe(0);
    });
  });

  it("returns 0 when the routes directory does not exist", async () => {
    await usingTemporaryFiles(async ($) => {
      const count = await pruneRoutes($.path(""), ["/pet/{id}"]);

      expect(count).toBe(0);
    });
  });
});

describe("pruneTypes", () => {
  it("removes obsolete generated types, including hidden path dotfiles", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("types/paths/customers.types.ts", "// current");
      await $.add("types/paths/customers/.types.ts", "// obsolete");
      await $.add("types/components/schemas/OldPet.ts", "// obsolete");
      await $.add("types/#/components/responses/OldError.ts", "// obsolete");

      const count = await pruneTypes($.path(""), [
        "types/paths/customers.types.ts",
      ]);

      expect(count).toBe(3);
      await expect($.read("types/paths/customers.types.ts")).resolves.toBe(
        "// current",
      );
      await expect($.read("types/paths/customers/.types.ts")).rejects.toThrow();
      await expect(
        $.read("types/components/schemas/OldPet.ts"),
      ).rejects.toThrow();
      await expect(
        $.read("types/#/components/responses/OldError.ts"),
      ).rejects.toThrow();
    });
  });

  it("preserves every expected generated type category", async () => {
    await usingTemporaryFiles(async ($) => {
      const expected = [
        "types/paths/pets.types.ts",
        "types/components/schemas/Pet.ts",
        "types/#/components/responses/NotFound.ts",
        "types/v2/paths/pets.types.ts",
        "types/v2/components/schemas/Pet.ts",
      ];

      for (const file of expected) {
        await $.add(file, `// ${file}`);
      }

      expect(await pruneTypes($.path(""), expected)).toBe(0);
      await Promise.all(
        expected.map(async (file) =>
          expect($.read(file)).resolves.toBe(`// ${file}`),
        ),
      );
    });
  });

  it("protects context and user-authored type files", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("types/_.context.ts", "// generated elsewhere");
      await $.add("types/custom.ts", "// user authored");
      await $.add("types/helpers/utility.ts", "// user authored");

      expect(await pruneTypes($.path(""), [])).toBe(0);
      await expect($.read("types/_.context.ts")).resolves.toBe(
        "// generated elsewhere",
      );
      await expect($.read("types/custom.ts")).resolves.toBe("// user authored");
      await expect($.read("types/helpers/utility.ts")).resolves.toBe(
        "// user authored",
      );
    });
  });

  it("prunes obsolete version metadata unless it is expected", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("types/versions.ts", "// old versions");

      expect(await pruneTypes($.path(""), [])).toBe(1);
      await expect($.read("types/versions.ts")).rejects.toThrow();

      await $.add("types/versions.ts", "// current versions");
      expect(await pruneTypes($.path(""), ["types/versions.ts"])).toBe(0);
      await expect($.read("types/versions.ts")).resolves.toBe(
        "// current versions",
      );
    });
  });

  it("is idempotent after stale files have been removed", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("types/paths/current.types.ts", "// current");
      await $.add("types/paths/stale.types.ts", "// stale");
      const expected = ["types/paths/current.types.ts"];

      expect(await pruneTypes($.path(""), expected)).toBe(1);
      expect(await pruneTypes($.path(""), expected)).toBe(0);
    });
  });
});
