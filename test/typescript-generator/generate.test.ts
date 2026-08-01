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

describe("OpenAPI paths with trailing slashes", () => {
  const operation = (operationId: string) => ({
    get: {
      operationId,
      responses: { "204": { description: "Success" } },
    },
  });

  it("generates visible route and type files for normalized paths", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.json",
        JSON.stringify({
          openapi: "3.0.3",
          info: { title: "Trailing slash paths", version: "1.0.0" },
          paths: {
            "/": operation("getRoot"),
            "/customers/": operation("listCustomers"),
            "/customers/{id}/": operation("getCustomer"),
            "/subscriptions/{id}/cancel/": operation("cancelSubscription"),
          },
        }),
      );

      const repository = new Repository();
      repository.writeFiles = async () => {};

      await new CodeGenerator($.path("openapi.json"), $.path(""), {
        routes: true,
        types: true,
      }).generate(repository);
      await repository.finished();

      expect([...repository.scripts.keys()].sort()).toStrictEqual([
        "routes/customers.ts",
        "routes/customers/{id}.ts",
        "routes/index.ts",
        "routes/subscriptions/{id}/cancel.ts",
        "types/paths/customers.types.ts",
        "types/paths/customers/{id}.types.ts",
        "types/paths/index.types.ts",
        "types/paths/subscriptions/{id}/cancel.types.ts",
      ]);
    });
  });

  it("rejects paths that collide after trailing-slash normalization", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.json",
        JSON.stringify({
          openapi: "3.0.3",
          info: { title: "Conflicting paths", version: "1.0.0" },
          paths: {
            "/customers": operation("listCustomers"),
            "/customers/": operation("listCustomersWithSlash"),
          },
        }),
      );

      const repository = new Repository();
      repository.writeFiles = async () => {};

      await expect(
        new CodeGenerator($.path("openapi.json"), $.path(""), {
          routes: true,
          types: true,
        }).generate(repository),
      ).rejects.toThrow(
        'OpenAPI paths "/customers" and "/customers/" normalize to the same path "/customers"',
      );
    });
  });

  it("prunes renamed path types in type-only mode and remains idempotent", async () => {
    await usingTemporaryFiles(async ($) => {
      const document = (path: string, operationId: string) => ({
        openapi: "3.0.3",
        info: { title: "Pruned path types", version: "1.0.0" },
        paths: { [path]: operation(operationId) },
      });

      await $.add(
        "openapi.json",
        JSON.stringify(document("/customers/", "listCustomers")),
      );
      await new CodeGenerator($.path("openapi.json"), $.path(""), {
        routes: true,
        types: true,
      }).generate();
      await $.add("types/paths/customers/.types.ts", "// legacy generated");
      await $.add("types/versions.ts", "// obsolete version metadata");
      await $.add("types/custom.ts", "// user-authored helper");

      await $.remove("openapi.json");
      await $.add(
        "openapi.json",
        JSON.stringify(document("/accounts", "listAccounts")),
      );
      const generateTypes = () =>
        new CodeGenerator($.path("openapi.json"), $.path(""), {
          prune: true,
          routes: false,
          types: true,
        }).generate();

      await generateTypes();
      await expect($.read("types/paths/accounts.types.ts")).resolves.toContain(
        "listAccounts",
      );
      await expect($.read("types/paths/customers.types.ts")).rejects.toThrow();
      await expect($.read("types/paths/customers/.types.ts")).rejects.toThrow();
      await expect($.read("types/versions.ts")).rejects.toThrow();
      await expect($.read("routes/customers.ts")).resolves.toContain(
        "export const GET",
      );
      await expect($.read("types/custom.ts")).resolves.toBe(
        "// user-authored helper",
      );

      await expect(generateTypes()).resolves.toBeUndefined();
      await expect($.read("types/paths/accounts.types.ts")).resolves.toContain(
        "listAccounts",
      );
    });
  });

  it("preserves generated types accumulated from multiple specs", async () => {
    await usingTemporaryFiles(async ($) => {
      const document = (path: string, operationId: string) => ({
        openapi: "3.0.3",
        info: { title: operationId, version: "1.0.0" },
        paths: { [path]: operation(operationId) },
      });
      await $.add(
        "customers.json",
        JSON.stringify(document("/customers", "listCustomers")),
      );
      await $.add(
        "orders.json",
        JSON.stringify(document("/orders", "listOrders")),
      );
      await $.add("types/paths/obsolete.types.ts", "// obsolete");
      await $.add("types/versions.ts", "// current version metadata");
      const repository = new Repository();
      const options = { prune: true, routes: false, types: true };

      await new CodeGenerator(
        $.path("customers.json"),
        $.path(""),
        options,
        "v1",
      ).generate(repository);
      await new CodeGenerator(
        $.path("orders.json"),
        $.path(""),
        options,
        "v2",
      ).generate(repository);

      await expect($.read("types/paths/customers.types.ts")).resolves.toContain(
        "listCustomers",
      );
      await expect($.read("types/paths/orders.types.ts")).resolves.toContain(
        "listOrders",
      );
      await expect($.read("types/versions.ts")).resolves.toBe(
        "// current version metadata",
      );
      await expect($.read("types/paths/obsolete.types.ts")).rejects.toThrow();
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

describe("OpenAPI 3.2 additionalOperations", () => {
  it("generates handlers for additionalOperations entries alongside standard methods", async () => {
    await usingTemporaryFiles(async ($) => {
      const spec = {
        openapi: "3.2.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/links": {
            get: {
              operationId: "getLinks",
              responses: { "200": { description: "OK" } },
            },
            additionalOperations: {
              LINK: {
                operationId: "linkResource",
                responses: { "200": { description: "OK" } },
              },
            },
          },
        },
      };

      await $.add("openapi.json", JSON.stringify(spec));

      const repository = new Repository();

      repository.writeFiles = async () => {
        await Promise.resolve(undefined);
      };

      const codeGenerator = new CodeGenerator(
        $.path("openapi.json"),
        $.path(""),
        {
          routes: true,
          types: true,
        },
      );

      await codeGenerator.generate(repository);
      await repository.finished();

      const routeScript = repository.scripts.get("routes/links.ts");

      expect(routeScript).toBeDefined();
      expect(await routeScript!.contents()).toContain("export const GET");
      expect(await routeScript!.contents()).toContain("export const LINK");
    });
  });
});

describe("$self document identity", () => {
  it("generates correct TypeScript output for a spec with $self and relative $refs", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        [
          "openapi: '3.2.0'",
          "$self: 'https://example.com/openapi.yaml'",
          "info:",
          "  title: Pet API",
          "  version: '1.0.0'",
          "paths:",
          "  /pets:",
          "    get:",
          "      operationId: listPets",
          "      responses:",
          "        '200':",
          "          description: OK",
          "          content:",
          "            application/json:",
          "              schema:",
          "                $ref: 'components/pet.yaml#/schemas/Pet'",
        ].join("\n"),
      );
      await $.add(
        "components/pet.yaml",
        [
          "schemas:",
          "  Pet:",
          "    type: object",
          "    properties:",
          "      name:",
          "        type: string",
        ].join("\n"),
      );

      const basePath = $.path("");
      const repository = new Repository();

      repository.writeFiles = async () => {
        await Promise.resolve(undefined);
      };

      const codeGenerator = new CodeGenerator(
        $.path("openapi.yaml"),
        basePath,
        {
          routes: true,
          types: true,
        },
      );

      // Code generation should succeed without errors
      await expect(codeGenerator.generate(repository)).resolves.toBeUndefined();

      await repository.finished();

      // A route file for /pets should have been generated
      const scripts = [...repository.scripts.keys()];
      expect(scripts.some((s) => s.includes("routes/pets.ts"))).toBe(true);
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
