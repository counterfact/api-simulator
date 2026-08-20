// To do: add types to usingTemporaryFiles package

import { usingTemporaryFiles } from "using-temporary-files";

import { determineModuleKind } from "../../src/server/determine-module-kind.js";

describe("getModuleKind", () => {
  it("returns the module type from package.json in the current directory", async () => {
    await usingTemporaryFiles(async ({ add, path }) => {
      await add("package.json", JSON.stringify({ type: "module" }));

      await expect(determineModuleKind(path("."))).resolves.toBe("module");
    });
  });

  it("returns the module type from package.json in a parent directory", async () => {
    await usingTemporaryFiles(async ({ add, path }) => {
      await add(
        "subdirectory/package.json",
        JSON.stringify({ type: "module" }),
      );

      await expect(determineModuleKind(path("./subdirectory"))).resolves.toBe(
        "module",
      );
    });
  });

  it("returns the module type from package.json in a grandparent directory", async () => {
    await usingTemporaryFiles(async ({ add, path }) => {
      await add("deep/down/package.json", JSON.stringify({ type: "module" }));

      await expect(
        determineModuleKind(path("./deep/down/even/further/down")),
      ).resolves.toBe("module");
    });
  });

  it('returns "commonjs" if type is not specified in package.json', async () => {
    await usingTemporaryFiles(async ({ add, path }) => {
      await add("package.json", JSON.stringify({}));

      await expect(determineModuleKind(path("."))).resolves.toBe("commonjs");
    });
  });

  it("returns commonjs if no package.json is found", async () => {
    await usingTemporaryFiles(async ({ path }) => {
      await expect(determineModuleKind(path("."))).resolves.toBe("commonjs");
    });
  });
});
