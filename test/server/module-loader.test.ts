/* eslint-disable @typescript-eslint/no-explicit-any */
import { once } from "node:events";

import { jest } from "@jest/globals";
import { usingTemporaryFiles } from "using-temporary-files";

import { ContextRegistry } from "../../src/server/context-registry.js";
import { ModuleLoader } from "../../src/server/module-loader.js";
import { MiddlewareFunction, Registry } from "../../src/server/registry.js";

describe("a module loader", () => {
  it("finds a file and adds it to the registry", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "a/b/c.js",
        `export function GET() {
          return {
              body: "GET from a/b/c"
          }; 
      }`,
      );

      await $.add(
        "hello.js",
        `
      export function GET() {
          return {
              body: "hello"
          };
      }`,
      );

      await $.add("package.json", '{ "type": "module" }');

      const registry: Registry = new Registry();
      const loader: ModuleLoader = new ModuleLoader($.path(""), registry);

      await loader.load();

      expect(registry.exists("GET", "/hello")).toBe(true);
      expect(registry.exists("POST", "/hello")).toBe(false);
      expect(registry.exists("GET", "/goodbye")).toBe(false);
      expect(registry.exists("GET", "/a/b/c")).toBe(true);
    });
  });

  it("maps /index to /", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "index.js",
        `export function GET() {
          return {
              body: "GET from a/b/c"
          }; 
      }`,
      );

      await $.add("package.json", '{ "type": "module" }');

      const registry: Registry = new Registry();
      const loader: ModuleLoader = new ModuleLoader($.path(""), registry);

      await loader.load();

      expect(registry.exists("GET", "/index")).toBe(true);
      expect(registry.exists("GET", "/")).toBe(true);
    });
  });

  it("updates the registry when a file is deleted", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "delete-me.js",
        'export function GET() { return { body: "Goodbye" }; }',
      );
      await $.add("package.json", '{ "type": "module" }');

      const registry: Registry = new Registry();
      const loader: ModuleLoader = new ModuleLoader($.path("."), registry);

      await loader.load();
      await loader.watch();

      expect(registry.exists("GET", "/delete-me")).toBe(true);

      await $.remove("delete-me.js");
      await once(loader, "remove");

      expect(registry.exists("GET", "/delete-me")).toBe(false);

      await loader.stopWatching();
    });
  });

  it("does not crash when a context file is deleted", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("_.context.js", "export class Context { value = 42 }");
      await $.add(
        "hello.js",
        'export function GET() { return { body: "hello" }; }',
      );
      await $.add("package.json", '{ "type": "module" }');

      const registry: Registry = new Registry();
      const loader: ModuleLoader = new ModuleLoader($.path("."), registry);

      await loader.load();
      await loader.watch();

      await $.remove("_.context.js");
      await once(loader, "remove");

      // Should not crash and the route should still be accessible
      expect(registry.exists("GET", "/hello")).toBe(true);

      await loader.stopWatching();
    });
  });

  it("ignores files with the wrong file extension", async () => {
    await usingTemporaryFiles(async ($) => {
      const registry: Registry = new Registry();
      const loader: ModuleLoader = new ModuleLoader($.path("."), registry);

      await $.add(
        "module.js",
        'export function GET() { return { body: "hello" }; }',
      );
      await $.add("package.json", '{"type": "module"}');
      await $.add("README.md", "readme");

      await loader.load();
      await loader.watch();

      await $.add("other.txt", "should not be loaded");

      expect(registry.exists("GET", "/module")).toBe(true);
      expect(registry.exists("GET", "/READMEx")).toBe(false);
      expect(registry.exists("GET", "/other")).toBe(false);
      expect(registry.exists("GET", "/types")).toBe(false);

      await loader.stopWatching();
    });
  });

  it("finds a context and adds it to the context registry", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("_.context.js", 'export class Context { name = "main"};');
      await $.add(
        "hello/_.context.js",
        'export class Context { name = "hello"};',
      );
      await $.add("package.json", '{ "type": "module" }');

      const registry: Registry = new Registry();

      const contextRegistry: ContextRegistry = new ContextRegistry();

      const loader: ModuleLoader = new ModuleLoader(
        $.path("."),
        registry,
        contextRegistry,
      );

      await loader.load();

      expect(contextRegistry.find("/hello").name).toBe("hello");
      expect(contextRegistry.find("/hello/world").name).toBe("hello");
      expect(contextRegistry.find("/some/other/path").name).toBe("main");
    });
  });

  it("finds a middleware and adds it to the registry", async () => {
    const names = new Map();
    class MiddlewareExposingRegistry extends Registry {
      public addMiddleware(url: string, callback: MiddlewareFunction): void {
        names.set(
          url,
          // @ts-expect-error not passing arguments to the callback
          callback(),
        );
      }
    }

    await usingTemporaryFiles(async ($) => {
      await $.add(
        "_.middleware.js",
        'export function middleware() { return "root"; }',
      );
      await $.add(
        "hello/_.middleware.js",
        'export function middleware() { return "hello"; }',
      );
      await $.add("package.json", '{ "type": "module" }');

      const registry: Registry = new MiddlewareExposingRegistry();

      const contextRegistry: ContextRegistry = new ContextRegistry();

      const loader: ModuleLoader = new ModuleLoader(
        $.path("."),
        registry,
        contextRegistry,
      );

      await loader.load();

      expect(names.get("/")).toBe("root");
      expect(names.get("/hello")).toBe("hello");
    });
  });

  it("provides the parent context if the local _.context.ts doesn't export a default", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("_.context.js", "export class Context { value = 0 }");
      await $.add(
        "hello/_.context.js",
        "export class Context  { value =  100 }",
      );
      await $.add("package.json", '{ "type": "module" }');

      const registry: Registry = new Registry();

      const contextRegistry: ContextRegistry = new ContextRegistry();

      const loader: ModuleLoader = new ModuleLoader(
        $.path("."),

        registry,
        contextRegistry,
      );

      await loader.load();

      const rootContext = contextRegistry.find("/");
      const helloContext = contextRegistry.find("/hello");

      rootContext.value = 1;
      helloContext.value = 101;

      expect(contextRegistry.find("/").value).toBe(1);
      expect(contextRegistry.find("/other").value).toBe(1);
      expect(contextRegistry.find("/hello").value).toBe(101);
      expect(contextRegistry.find("/hello/world").value).toBe(101);
    });
  });

  it("provides the loadContext helper for accessing nested contexts", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add(
        "_.context.js",
        "export class Context  { constructor({loadContext}) { this.loadContext = loadContext } }",
      );
      await $.add("a/_.context.js", "export class Context  { name = 'a' }");
      await $.add("package.json", '{ "type": "module" }');

      const registry: Registry = new Registry();

      const contextRegistry: ContextRegistry = new ContextRegistry();

      const loader: ModuleLoader = new ModuleLoader(
        $.path("."),

        registry,
        contextRegistry,
      );

      await loader.load();

      const rootContext = contextRegistry.find("/") as any;

      expect(rootContext?.loadContext("/a")?.name).toBe("a");
    });
  });

  it("provides readJson for reading JSON files relative to the context file", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("data.json", '{"name": "test", "value": 42}');
      await $.add(
        "_.context.js",
        "export class Context { constructor({ readJson }) { this.readJson = readJson; } }",
      );
      await $.add("package.json", '{ "type": "module" }');

      const registry: Registry = new Registry();
      const contextRegistry: ContextRegistry = new ContextRegistry();

      const loader: ModuleLoader = new ModuleLoader(
        $.path("."),
        registry,
        contextRegistry,
      );

      await loader.load();

      const rootContext = contextRegistry.find("/") as any;
      const data = await rootContext.readJson("./data.json");

      expect(data).toEqual({ name: "test", value: 42 });
    });
  });

  it("resolves readJson paths relative to the context file's directory", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("shared/data.json", '{"shared": true}');
      await $.add(
        "sub/_.context.js",
        "export class Context { constructor({ readJson }) { this.readJson = readJson; } }",
      );
      await $.add("package.json", '{ "type": "module" }');

      const registry: Registry = new Registry();
      const contextRegistry: ContextRegistry = new ContextRegistry();

      const loader: ModuleLoader = new ModuleLoader(
        $.path("."),
        registry,
        contextRegistry,
      );

      await loader.load();

      const subContext = contextRegistry.find("/sub") as any;
      const data = await subContext.readJson("../shared/data.json");

      expect(data).toEqual({ shared: true });
    });
  });

  it("registers a 500 handler for an ESM route file with a syntax error", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("bad-syntax.js", "this is not valid javascript @@@");
      await $.add("package.json", '{ "type": "module" }');

      const registry: Registry = new Registry();
      const loader: ModuleLoader = new ModuleLoader($.path(""), registry);

      await loader.load();

      expect(registry.exists("GET", "/bad-syntax")).toBe(true);

      // @ts-expect-error - not going to create a whole request object for a test
      const response = await registry.endpoint("GET", "/bad-syntax")({});

      expect(response?.status).toBe(500);
      expect(response?.body).toContain("bad-syntax.js");
    });
  });

  it("registers a 500 handler for a CJS route file with a syntax error", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("bad-syntax.cjs", "this is not valid javascript @@@");

      const registry: Registry = new Registry();
      const loader: ModuleLoader = new ModuleLoader($.path(""), registry);

      await loader.load();

      expect(registry.exists("GET", "/bad-syntax")).toBe(true);

      // @ts-expect-error - not going to create a whole request object for a test
      const response = await registry.endpoint("GET", "/bad-syntax")({});

      expect(response?.status).toBe(500);
      expect(response?.body).toContain("bad-syntax.cjs");
      expect(response?.body).toContain("syntax error");
    });
  });

  it("prints a warning and skips loading a context file with a syntax error", async () => {
    await usingTemporaryFiles(async ($) => {
      await $.add("_.context.js", "this is not valid javascript @@@");
      await $.add(
        "hello.js",
        'export function GET() { return { body: "hello" }; }',
      );
      await $.add("package.json", '{ "type": "module" }');

      const registry: Registry = new Registry();
      const contextRegistry: ContextRegistry = new ContextRegistry();
      const loader: ModuleLoader = new ModuleLoader(
        $.path(""),
        registry,
        contextRegistry,
      );

      const stdoutSpy = jest
        .spyOn(process.stdout, "write")
        .mockImplementation((() => true) as any);

      await expect(loader.load()).resolves.toBeUndefined();

      expect(registry.exists("GET", "/hello")).toBe(true);
      expect(contextRegistry.getAllPaths()).toEqual(["/"]);
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Warning: There was an error loading the context file:",
        ),
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining("_.context.js"),
      );
      expect(stdoutSpy).toHaveBeenCalledTimes(1);

      stdoutSpy.mockRestore();
    });
  });
});

describe("ModuleLoader scenario loading", () => {
  it("loads scenario files into the ScenarioRegistry on load()", async () => {
    const { ScenarioRegistry } =
      await import("../../src/server/scenario-registry.js");

    await usingTemporaryFiles(async ($) => {
      await $.add("routes/package.json", '{ "type": "module" }');
      await $.add(
        "scenarios/index.js",
        `export function soldPets() {}
export function resetAll() {}
export const notAFunction = 42;`,
      );
      await $.add("scenarios/package.json", '{ "type": "module" }');

      const registry = new Registry();
      const scenarioRegistry = new ScenarioRegistry();
      const loader = new ModuleLoader(
        $.path("routes"),
        registry,
        undefined,
        $.path("scenarios"),
        scenarioRegistry,
      );

      await loader.load();

      const names = scenarioRegistry.getExportedFunctionNames("index");

      expect(names).toContain("soldPets");
      expect(names).toContain("resetAll");
      // Non-functions are still stored but getExportedFunctionNames filters them
      expect(names).not.toContain("notAFunction");
    });
  });

  it("stores a nested scenario file under a slash-delimited key", async () => {
    const { ScenarioRegistry } =
      await import("../../src/server/scenario-registry.js");

    await usingTemporaryFiles(async ($) => {
      await $.add("routes/package.json", '{ "type": "module" }');
      await $.add("scenarios/pets/index.js", `export function sold() {}`);
      await $.add("scenarios/pets/package.json", '{ "type": "module" }');

      const registry = new Registry();
      const scenarioRegistry = new ScenarioRegistry();
      const loader = new ModuleLoader(
        $.path("routes"),
        registry,
        undefined,
        $.path("scenarios"),
        scenarioRegistry,
      );

      await loader.load();

      const names = scenarioRegistry.getExportedFunctionNames("pets/index");

      expect(names).toContain("sold");
    });
  });

  it("does not throw when the scenarios directory does not exist", async () => {
    const { ScenarioRegistry } =
      await import("../../src/server/scenario-registry.js");

    await usingTemporaryFiles(async ($) => {
      await $.add("routes/package.json", '{ "type": "module" }');

      const registry = new Registry();
      const scenarioRegistry = new ScenarioRegistry();
      const loader = new ModuleLoader(
        $.path("routes"),
        registry,
        undefined,
        $.path("scenarios"), // does not exist
        scenarioRegistry,
      );

      await expect(loader.load()).resolves.toBeUndefined();
      expect(scenarioRegistry.getFileKeys()).toHaveLength(0);
    });
  });

  it("loads version-specific scenarios when versionedScenariosPath is provided", async () => {
    const { ScenarioRegistry } =
      await import("../../src/server/scenario-registry.js");

    await usingTemporaryFiles(async ($) => {
      await $.add("routes/package.json", '{ "type": "module" }');
      await $.add("scenarios/index.js", `export function sharedFn() {}`);
      await $.add("scenarios/shared.js", `export function fallbackFn() {}`);
      await $.add("scenarios/package.json", '{ "type": "module" }');
      await $.add("v2/scenarios/index.js", `export function versionedFn() {}`);
      await $.add("v2/scenarios/package.json", '{ "type": "module" }');

      const registry = new Registry();
      const scenarioRegistry = new ScenarioRegistry();
      const loader = new ModuleLoader(
        $.path("routes"),
        registry,
        undefined,
        $.path("scenarios"),
        scenarioRegistry,
        $.path("v2/scenarios"),
      );

      await loader.load();

      expect(scenarioRegistry.getExportedFunctionNames("index")).toContain(
        "versionedFn",
      );
      // Shared-only file (no versioned counterpart) is still accessible.
      expect(scenarioRegistry.getExportedFunctionNames("shared")).toContain(
        "fallbackFn",
      );
    });
  });

  it("version-specific scenario takes precedence over shared scenario with the same key", async () => {
    const { ScenarioRegistry } =
      await import("../../src/server/scenario-registry.js");

    await usingTemporaryFiles(async ($) => {
      await $.add("routes/package.json", '{ "type": "module" }');
      await $.add(
        "scenarios/index.js",
        `export function setup() { return "shared"; }`,
      );
      await $.add("scenarios/package.json", '{ "type": "module" }');
      await $.add(
        "v2/scenarios/index.js",
        `export function setup() { return "versioned"; }`,
      );
      await $.add("v2/scenarios/package.json", '{ "type": "module" }');

      const registry = new Registry();
      const scenarioRegistry = new ScenarioRegistry();
      const loader = new ModuleLoader(
        $.path("routes"),
        registry,
        undefined,
        $.path("scenarios"),
        scenarioRegistry,
        $.path("v2/scenarios"),
      );

      await loader.load();

      const module = scenarioRegistry.getModule("index");
      expect(typeof module?.["setup"]).toBe("function");
      expect((module?.["setup"] as () => string)()).toBe("versioned");
    });
  });

  it("falls back to shared scenarios for files not present in the version-specific directory", async () => {
    const { ScenarioRegistry } =
      await import("../../src/server/scenario-registry.js");

    await usingTemporaryFiles(async ($) => {
      await $.add("routes/package.json", '{ "type": "module" }');
      await $.add("scenarios/shared.js", `export function sharedOnly() {}`);
      await $.add("scenarios/package.json", '{ "type": "module" }');
      await $.add(
        "v2/scenarios/versioned.js",
        `export function versionedOnly() {}`,
      );
      await $.add("v2/scenarios/package.json", '{ "type": "module" }');

      const registry = new Registry();
      const scenarioRegistry = new ScenarioRegistry();
      const loader = new ModuleLoader(
        $.path("routes"),
        registry,
        undefined,
        $.path("scenarios"),
        scenarioRegistry,
        $.path("v2/scenarios"),
      );

      await loader.load();

      expect(scenarioRegistry.getExportedFunctionNames("shared")).toContain(
        "sharedOnly",
      );
      expect(scenarioRegistry.getExportedFunctionNames("versioned")).toContain(
        "versionedOnly",
      );
    });
  });

  it("does not throw when the versioned scenarios directory does not exist", async () => {
    const { ScenarioRegistry } =
      await import("../../src/server/scenario-registry.js");

    await usingTemporaryFiles(async ($) => {
      await $.add("routes/package.json", '{ "type": "module" }');
      await $.add("scenarios/index.js", `export function sharedFn() {}`);
      await $.add("scenarios/package.json", '{ "type": "module" }');

      const registry = new Registry();
      const scenarioRegistry = new ScenarioRegistry();
      const loader = new ModuleLoader(
        $.path("routes"),
        registry,
        undefined,
        $.path("scenarios"),
        scenarioRegistry,
        $.path("v2/scenarios"), // does not exist
      );

      await expect(loader.load()).resolves.toBeUndefined();
      expect(scenarioRegistry.getExportedFunctionNames("index")).toContain(
        "sharedFn",
      );
    });
  });
});
