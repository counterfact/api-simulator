import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../../src/typescript-generator/code-generator.js";
import { ScenarioFileGenerator } from "../../src/typescript-generator/scenario-file-generator.js";
import { Repository } from "../../src/typescript-generator/repository.js";

describe("end-to-end test", () => {
  it("generates the same code for pet store that it did on the last test run", async () => {
    await usingTemporaryFiles(async ($) => {
      const basePath = $.path("");
      const repository = new Repository();

      repository.writeFiles = async () => {
        await Promise.resolve(undefined);
      };

      const codeGenerator = new CodeGenerator("./petstore.yaml", basePath, {
        routes: true,
        types: true,
      });

      await codeGenerator.generate(repository);
      await repository.finished();

      for (const [scriptPath, script] of repository.scripts.entries()) {
        expect(`${scriptPath}:${await script.contents()}`).toMatchSnapshot();
      }

      expect(await $.read(".gitignore")).toMatchSnapshot();

      expect(await $.read(".cache/README.md")).toMatchSnapshot();
    });
  });

  it("generates the same code for the example that it did on the last test run", async () => {
    await usingTemporaryFiles(async ($) => {
      const basePath = $.path("");
      const repository = new Repository();

      repository.writeFiles = async () => {
        await Promise.resolve(undefined);
      };

      const codeGenerator = new CodeGenerator(
        "./test/fixtures/openapi/example.yaml",
        basePath,
        { routes: true, types: true },
      );

      await codeGenerator.generate(repository);
      await repository.finished();

      for (const [scriptPath, script] of repository.scripts.entries()) {
        expect(`${scriptPath}:${await script.contents()}`).toMatchSnapshot();
      }

      expect(await $.read(".gitignore")).toMatchSnapshot();

      expect(await $.read(".cache/README.md")).toMatchSnapshot();
    });
  });
});

describe("$ref resolution for components/mediaTypes (OpenAPI 3.2)", () => {
  it("loads and bundles a spec with $ref pointing to components/mediaTypes without errors", async () => {
    await usingTemporaryFiles(async ($) => {
      const spec = {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0.0" },
        components: {
          mediaTypes: {
            JsonPayload: {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                },
              },
            },
          },
        },
        paths: {
          "/example": {
            get: {
              operationId: "getExample",
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      $ref: "#/components/mediaTypes/JsonPayload",
                    },
                  },
                },
              },
            },
          },
        },
      };

      await $.add("openapi.json", JSON.stringify(spec));

      const basePath = $.path("");
      const repository = new Repository();

      repository.writeFiles = async () => {};

      const codeGenerator = new CodeGenerator(
        $.path("openapi.json"),
        basePath,
        { routes: true, types: true },
      );

      await expect(codeGenerator.generate(repository)).resolves.toBeUndefined();
    });
  });

  it("generates correct TypeScript types for a response that references components/mediaTypes via $ref", async () => {
    await usingTemporaryFiles(async ($) => {
      const spec = {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0.0" },
        components: {
          mediaTypes: {
            JsonPayload: {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                },
              },
            },
          },
        },
        paths: {
          "/example": {
            get: {
              operationId: "getExample",
              responses: {
                "200": {
                  description: "OK",
                  content: {
                    "application/json": {
                      $ref: "#/components/mediaTypes/JsonPayload",
                    },
                  },
                },
              },
            },
          },
        },
      };

      await $.add("openapi.json", JSON.stringify(spec));

      const basePath = $.path("");
      const repository = new Repository();

      repository.writeFiles = async () => {};

      const codeGenerator = new CodeGenerator(
        $.path("openapi.json"),
        basePath,
        { routes: true, types: true },
      );

      await codeGenerator.generate(repository);
      await repository.finished();

      const scripts = [...repository.scripts.entries()];
      const typesEntry = scripts.find(([path]) =>
        path.includes("example.types.ts"),
      );

      expect(typesEntry).toBeDefined();

      const [, typesScript] = typesEntry!;
      const typesContent = await typesScript.contents();

      expect(typesContent).toContain('"application/json"');
      expect(typesContent).toContain("name");
    });
  });
});

describe("path item non-HTTP-verb fields", () => {
  it("ignores summary and description at the path item level without throwing", async () => {
    await usingTemporaryFiles(async ($) => {
      const spec = {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/test": {
            summary: "Test Summary",
            description: "Test Description",
            get: {
              operationId: "getTest",
              responses: { "200": { description: "OK" } },
            },
          },
        },
      };

      await $.add("openapi.json", JSON.stringify(spec));

      const basePath = $.path("");
      const repository = new Repository();

      repository.writeFiles = async () => {
        await Promise.resolve(undefined);
      };

      const codeGenerator = new CodeGenerator(
        $.path("openapi.json"),
        basePath,
        {
          routes: true,
          types: true,
        },
      );

      await expect(codeGenerator.generate(repository)).resolves.toBeUndefined();

      await repository.finished();

      const scripts = [...repository.scripts.keys()];
      expect(scripts.some((s) => s.includes("routes/test.ts"))).toBe(true);
    });
  });
});

describe("_.context type generation", () => {
  it("generates a fallback _.context.ts when no routes directory exists", async () => {
    await usingTemporaryFiles(async ($) => {
      const basePath = $.path("");
      const repository = new Repository();

      repository.writeFiles = async () => {
        await Promise.resolve(undefined);
      };

      const codeGenerator = new CodeGenerator("./petstore.yaml", basePath, {
        types: true,
      });

      await codeGenerator.generate(repository);
      await new ScenarioFileGenerator(basePath).generate();

      const content = await $.read("types/_.context.ts");
      expect(content).toContain("readonly context: Record<string, unknown>");
      expect(content).toContain(
        "loadContext(path: string): Record<string, unknown>;",
      );
      expect(content).not.toContain("import type");
      expect(content).toContain(
        "export type Scenario = ($: Scenario$) => Promise<void> | void;",
      );
      expect(content).toContain("export interface Context$ {");
      expect(content).toContain(
        '  readonly loadContext: LoadContextDefinitions["loadContext"];',
      );
      expect(content).toContain(
        "  readonly readJson: (relativePath: string) => Promise<unknown>;",
      );
    });
  });

  it("generates typed loadContext overloads for a root context file", async () => {
    await usingTemporaryFiles(async ($) => {
      const basePath = $.path("");
      const repository = new Repository();

      repository.writeFiles = async () => {
        await Promise.resolve(undefined);
      };

      await $.add("routes/_.context.ts", "export class Context {}");

      const codeGenerator = new CodeGenerator("./petstore.yaml", basePath, {
        types: true,
      });

      await codeGenerator.generate(repository);
      await new ScenarioFileGenerator(basePath).generate();

      const content = await $.read("types/_.context.ts");
      expect(content).toContain(
        'import type { Context } from "../routes/_.context";',
      );
      expect(content).toContain("readonly context: Context;");
      expect(content).toContain(
        'loadContext(path: "/" | `/${string}`): Context;',
      );
      expect(content).toContain(
        "loadContext(path: string): Record<string, unknown>;",
      );
    });
  });

  it("generates narrowed overloads for root + subdirectory context files", async () => {
    await usingTemporaryFiles(async ($) => {
      const basePath = $.path("");
      const repository = new Repository();

      repository.writeFiles = async () => {
        await Promise.resolve(undefined);
      };

      await $.add("routes/_.context.ts", "export class Context {}");
      await $.add("routes/pets/_.context.ts", "export class Context {}");

      const codeGenerator = new CodeGenerator("./petstore.yaml", basePath, {
        types: true,
      });

      await codeGenerator.generate(repository);
      await new ScenarioFileGenerator(basePath).generate();

      const content = await $.read("types/_.context.ts");
      expect(content).toContain(
        'import type { Context } from "../routes/_.context";',
      );
      expect(content).toContain(
        'import type { Context as PetsContext } from "../routes/pets/_.context";',
      );
      expect(content).toContain(
        'loadContext(path: "/pets" | `/pets/${string}`): PetsContext;',
      );
      expect(content).toContain(
        'loadContext(path: "/" | `/${string}`): Context;',
      );
      // Subdirectory overload must appear before root overload for correct resolution
      expect(content.indexOf("PetsContext")).toBeLessThan(
        content.indexOf('"/" |'),
      );
    });
  });

  it("generates overloads for parameterized path context files", async () => {
    await usingTemporaryFiles(async ($) => {
      const basePath = $.path("");
      const repository = new Repository();

      repository.writeFiles = async () => {
        await Promise.resolve(undefined);
      };

      await $.add("routes/_.context.ts", "export class Context {}");
      await $.add(
        "routes/pets/{petId}/_.context.ts",
        "export class Context {}",
      );

      const codeGenerator = new CodeGenerator("./petstore.yaml", basePath, {
        types: true,
      });

      await codeGenerator.generate(repository);
      await new ScenarioFileGenerator(basePath).generate();

      const content = await $.read("types/_.context.ts");
      expect(content).toContain(
        'import type { Context as PetsPetIdContext } from "../routes/pets/{petId}/_.context";',
      );
      expect(content).toContain(
        "loadContext(path: `/pets/${string}`): PetsPetIdContext;",
      );
    });
  });
});
