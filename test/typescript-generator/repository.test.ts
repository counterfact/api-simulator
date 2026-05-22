import { describe, expect, it } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../../src/typescript-generator/code-generator.js";
import { Repository } from "../../src/typescript-generator/repository.js";

describe("a Repository", () => {
  it("creates a new Script or returns an existing one", () => {
    const repository = new Repository("/base/path");

    const a = repository.get("a.ts");
    const b = repository.get("b.ts");
    const a2 = repository.get("a.ts");

    expect(a).not.toBe(b);
    expect(a2).toBe(a);
  });

  it.each([
    ["./types/paths/x.ts", "../../routes/_.context.ts"],
    ["./types/paths/a/x.ts", "../../../routes/_.context.ts"],
    ["./types/paths/a/b/x.ts", "../../../../routes/a/b/_.context.ts"],
    ["./types/paths/a/b/c/x.ts", "../../../../../routes/a/b/_.context.ts"],
  ])(
    "finds the relative location of the most relevant _.context.ts file (%s => %s)",
    async (importingFilePath, relativePathToNearestContext) => {
      await usingTemporaryFiles(async ({ add, path }) => {
        const repository = new Repository();

        await add("./routes/_.context.ts", "export class Context");
        await add("./routes/a/b/_.context.ts", "export class Context");

        expect(repository.findContextPath(path("."), importingFilePath)).toBe(
          relativePathToNearestContext,
        );
      });
    },
  );

  it("creates the root _.context.ts file", async () => {
    await usingTemporaryFiles(async ({ path, read }) => {
      const repository = new Repository();

      await repository.writeFiles(path("."), { routes: true, types: true });

      await expect(read("./routes/_.context.ts")).resolves.toContain(
        "export class Context",
      );
    });
  });

  it("does not create the root _.context.ts file when generate routes is false", async () => {
    await usingTemporaryFiles(async ({ path, read }) => {
      const repository = new Repository();

      await repository.writeFiles(path("."), { routes: false, types: true });

      await expect(read("./paths/_.context.ts")).rejects.toThrow(
        "no such file or directory",
      );
    });
  });

  it("does not overwrite an existing _.context.ts file", async () => {
    await usingTemporaryFiles(async ({ add, path, read }) => {
      const repository = new Repository();

      await add(
        "./paths/_.context.ts",
        "export class Context { /* do not overwrite me */ }",
      );

      await repository.writeFiles(path("."), { routes: true, types: true });

      await expect(read("./paths/_.context.ts")).resolves.toContain(
        "do not overwrite me",
      );
    });
  });

  describe("appending new handlers to existing route files", () => {
    const specWithGet = {
      openapi: "3.0.0" as const,
      info: { title: "Test", version: "0.1.0" },
      paths: {
        "/pet": {
          get: {
            operationId: "getPets",
            responses: { "200": { description: "OK" } },
          },
        },
      },
    };

    const specWithGetAndPost = {
      ...specWithGet,
      paths: {
        "/pet": {
          ...specWithGet.paths["/pet"],
          post: {
            operationId: "addPet",
            responses: { "200": { description: "OK" } },
          },
        },
      },
    };

    it("appends a new handler export when the spec gains a new HTTP method", async () => {
      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(specWithGet));

        // First generation: creates routes/pet.ts with GET only.
        await new CodeGenerator($.path("openapi.json"), $.path(""), {
          routes: true,
          types: true,
        }).generate();

        const contentAfterFirstGen = await $.read("routes/pet.ts");
        expect(contentAfterFirstGen).toContain("export const GET");
        expect(contentAfterFirstGen).not.toContain("export const POST");

        // Update the spec to add POST, then regenerate.
        await $.remove("openapi.json");
        await $.add("openapi.json", JSON.stringify(specWithGetAndPost));

        await new CodeGenerator($.path("openapi.json"), $.path(""), {
          routes: true,
          types: true,
        }).generate();

        const contentAfterSecondGen = await $.read("routes/pet.ts");
        expect(contentAfterSecondGen).toContain("export const GET");
        expect(contentAfterSecondGen).toContain("export const POST");
      });
    });

    it("preserves user edits to existing handlers when appending a new one", async () => {
      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(specWithGet));

        await new CodeGenerator($.path("openapi.json"), $.path(""), {
          routes: true,
          types: true,
        }).generate();

        // Simulate a user customising the GET handler.
        const original = await $.read("routes/pet.ts");
        await $.remove("routes/pet.ts");
        await $.add(
          "routes/pet.ts",
          original.replace(
            "$.response[200]",
            "/* user edit */ $.response[200]",
          ),
        );

        // Regenerate with POST added.
        await $.remove("openapi.json");
        await $.add("openapi.json", JSON.stringify(specWithGetAndPost));

        await new CodeGenerator($.path("openapi.json"), $.path(""), {
          routes: true,
          types: true,
        }).generate();

        const finalContent = await $.read("routes/pet.ts");
        expect(finalContent).toContain("/* user edit */");
        expect(finalContent).toContain("export const POST");
      });
    });

    it("does not modify an existing route file when no new methods are present", async () => {
      await usingTemporaryFiles(async ($) => {
        await $.add("openapi.json", JSON.stringify(specWithGetAndPost));

        await new CodeGenerator($.path("openapi.json"), $.path(""), {
          routes: true,
          types: true,
        }).generate();

        const firstContent = await $.read("routes/pet.ts");

        // Regenerate with the same spec — nothing should change.
        await new CodeGenerator($.path("openapi.json"), $.path(""), {
          routes: true,
          types: true,
        }).generate();

        const secondContent = await $.read("routes/pet.ts");
        expect(secondContent).toBe(firstContent);
      });
    });
  });
});
