import { fileURLToPath } from "node:url";

import { jest } from "@jest/globals";
import { remove } from "fs-extra";
import { usingTemporaryFiles } from "using-temporary-files";

import { CodeGenerator } from "../src/code-generator.js";
import { Repository } from "../src/repository.js";
import { ScenarioFileGenerator } from "../src/scenario-file-generator.js";

const PETSTORE_FIXTURE = fileURLToPath(
  new URL("./petstore.yaml", import.meta.url),
);
const EXAMPLE_FIXTURE = fileURLToPath(
  new URL(
    "../../counterfact/test/fixtures/openapi/example.yaml",
    import.meta.url,
  ),
);

async function waitForGeneratedContent(
  read: () => Promise<string>,
  predicate: (content: string) => boolean,
): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const content = await read();
    if (predicate(content)) {
      return content;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Generated content did not update within five seconds");
}

describe("end-to-end test", () => {
  it("generates the same code for pet store that it did on the last test run", async () => {
    await usingTemporaryFiles(async ($) => {
      const basePath = $.path("");
      const repository = new Repository();

      repository.writeFiles = async () => {
        await Promise.resolve(undefined);
      };

      const codeGenerator = new CodeGenerator(PETSTORE_FIXTURE, basePath, {
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

      const codeGenerator = new CodeGenerator(EXAMPLE_FIXTURE, basePath, {
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

  it("applies overlays before generating route and type artifacts", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.yaml",
        [
          "openapi: 3.0.3",
          "info: { title: Generator integration, version: 1.0.0 }",
          "paths:",
          "  /old:",
          "    get:",
          "      operationId: getOld",
          "      responses: { '200': { description: old } }",
        ].join("\n"),
      );
      await $.add(
        "overlay.yaml",
        [
          "overlay: 1.0.0",
          "actions:",
          "  - target: $.paths",
          "    update:",
          "      /new:",
          "        get:",
          "          operationId: getNew",
          "          responses: { '200': { description: new } }",
          "  - target: $.paths['/old']",
          "    remove: true",
        ].join("\n"),
      );

      await new CodeGenerator(
        $.path("openapi.yaml"),
        $.path("out"),
        { routes: true, types: true },
        "",
        [$.path("overlay.yaml")],
      ).generate();

      await expect($.read("out/routes/new.ts")).resolves.toContain(
        "export const GET",
      );
      await expect($.read("out/types/paths/new.types.ts")).resolves.toContain(
        "export type getNew",
      );
      await expect($.read("out/routes/old.ts")).rejects.toThrow();
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

  it.each([
    "customers",
    "/customers\0private",
    "/customers\\..\\private",
    "/customers//private",
    "/customers/./private",
    "/customers/../private",
  ])("rejects unsafe OpenAPI path %p before writing files", async (path) => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "openapi.json",
        JSON.stringify({
          openapi: "3.0.3",
          info: { title: "Unsafe path", version: "1.0.0" },
          paths: { [path]: operation("unsafeOperation") },
        }),
      );

      const repository = new Repository();
      const writeFiles = jest.fn(async () => {});
      repository.writeFiles = writeFiles;

      await expect(
        new CodeGenerator($.path("openapi.json"), $.path("out"), {
          routes: true,
          types: true,
        }).generate(repository),
      ).rejects.toThrow("Invalid OpenAPI path");
      expect(writeFiles).not.toHaveBeenCalled();
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

      const codeGenerator = new CodeGenerator(PETSTORE_FIXTURE, basePath, {
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

      const codeGenerator = new CodeGenerator(PETSTORE_FIXTURE, basePath, {
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

  it("adds the root store only to the context constructor type", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("_.store.ts", "export class Store {}");

      await new ScenarioFileGenerator($.path("")).generate();

      const content = await $.read("types/_.context.ts");
      expect(content).toContain('import type { Store } from "../_.store.js";');
      expect(content).toContain("export interface Context$ {");
      expect(content).toContain("  readonly store: Store;");

      const scenarioType = content.slice(
        content.indexOf("export interface Scenario$"),
        content.indexOf("export type Scenario"),
      );
      expect(scenarioType).not.toContain("readonly store:");
    });
  });

  it("imports the root store type from a nested API group", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("_.store.ts", "export class Store {}");

      await new ScenarioFileGenerator(
        $.path("groups/customers"),
        $.path(""),
      ).generate();

      const content = await $.read("groups/customers/types/_.context.ts");
      expect(content).toContain(
        'import type { Store } from "../../../_.store.js";',
      );
      expect(content).toContain("  readonly store: Store;");
    });
  });

  it("watches an initially absent root store and regenerates on add and delete", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.addDirectory("customers/routes");
      const generator = new ScenarioFileGenerator(
        $.path("customers"),
        $.path(""),
      );

      await generator.generate();
      await generator.watch();

      try {
        expect(await $.read("customers/types/_.context.ts")).not.toContain(
          "readonly store: Store;",
        );

        await $.add("_.store.ts", "export class Store {}");
        const contentAfterAdd = await waitForGeneratedContent(
          () => $.read("customers/types/_.context.ts"),
          (content) => content.includes("readonly store: Store;"),
        );
        expect(contentAfterAdd).toContain("readonly store: Store;");

        await $.remove("_.store.ts");
        const contentAfterDelete = await waitForGeneratedContent(
          () => $.read("customers/types/_.context.ts"),
          (content) => !content.includes("readonly store: Store;"),
        );
        expect(contentAfterDelete).not.toContain("readonly store: Store;");
      } finally {
        await generator.stopWatching();
      }
    });
  });

  it("logs regeneration failures triggered by watcher events", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.addDirectory("customers/routes");
      const generator = new ScenarioFileGenerator(
        $.path("customers"),
        $.path(""),
      );

      await generator.generate();
      await generator.watch();

      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        await $.remove("customers/types/_.context.ts");
        await $.remove("customers/types/_.middleware.ts");
        await remove($.path("customers/types"));
        await $.add("customers/types", "blocker");
        await $.add("_.store.ts", "export class Store {}");

        await waitForGeneratedContent(
          async () => String(errorSpy.mock.calls.length),
          (callCount) => callCount !== "0",
        );

        expect(errorSpy).toHaveBeenCalledWith(
          "Failed to regenerate scenario files:",
          expect.anything(),
        );
      } finally {
        errorSpy.mockRestore();
        await generator.stopWatching();
      }
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

      const codeGenerator = new CodeGenerator(PETSTORE_FIXTURE, basePath, {
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

      const codeGenerator = new CodeGenerator(PETSTORE_FIXTURE, basePath, {
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

describe("_.middleware type generation", () => {
  it("generates a middleware type for every route directory", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("routes/_.context.ts", "export class Context {}");
      await $.add("routes/pets/list.ts", "export const GET = () => {};");
      await $.add(
        "routes/pets/admin/_.context.ts",
        "export class Context { isAuthorized() { return true; } }",
      );
      await $.add("routes/pets/admin/list.ts", "export const GET = () => {};");

      await new ScenarioFileGenerator($.path("")).generate();

      await expect($.read("types/_.middleware.ts")).resolves.toContain(
        'import type { Context } from "../routes/_.context.js";',
      );
      await expect($.read("types/pets/_.middleware.ts")).resolves.toContain(
        'import type { Context } from "../../routes/_.context.js";',
      );
      await expect(
        $.read("types/pets/admin/_.middleware.ts"),
      ).resolves.toContain(
        'import type { Context } from "../../../routes/pets/admin/_.context.js";',
      );
      await expect(
        $.read("types/pets/admin/_.middleware.ts"),
      ).resolves.toContain(
        "export type Middleware = MiddlewareFunction<Context>;",
      );
    });
  });

  it("falls back to an unknown context when no context file exists", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("routes/pets.ts", "export const GET = () => {};");

      await new ScenarioFileGenerator($.path("")).generate();

      const content = await $.read("types/_.middleware.ts");
      expect(content).toContain(
        'import type { Middleware as MiddlewareFunction } from "../counterfact-types/index.js";',
      );
      expect(content).toContain("export type Middleware = MiddlewareFunction;");
      expect(content).not.toContain("import type { Context }");
    });
  });

  it("removes generated middleware types for deleted route directories", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("routes/pets.ts", "export const GET = () => {};");
      await $.add(
        "types/admin/_.middleware.ts",
        "// This file is generated by Counterfact. Do not edit manually.\nexport type Middleware = never;\n",
      );

      await new ScenarioFileGenerator($.path("")).generate();

      await expect($.read("types/admin/_.middleware.ts")).rejects.toThrow();
    });
  });
});
